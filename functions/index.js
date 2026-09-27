/* ═══════════════════════════════════════
   UPG — CLOUD FUNCTION: aiChat
   Purpose: this is the piece the AI Coach client code (js/features/
   ai-coach.js) has always expected to exist but never shipped with
   the app. It receives the conversation + context the client already
   builds, forwards it to Anthropic with the API key held ONLY here
   (as a Firebase secret, never in client code), and streams the
   response back byte-for-byte so ai-coach.js's existing SSE parser
   needs zero changes.

   DEPLOY STEPS (one-time):
     1. cd functions && npm install
     2. firebase functions:secrets:set ANTHROPIC_API_KEY
        (paste your key when prompted — this does NOT go in any file)
     3. firebase deploy --only functions
     4. Copy the printed URL into index.html as:
          window.UPG_AI_ENDPOINT = 'https://REGION-PROJECT.cloudfunctions.net/aiChat';
        (see js/config.js — that's where this now lives)

   REQUIRES the Blaze (pay-as-you-go) plan. Outbound network calls
   from Cloud Functions are not allowed on the free Spark plan — this
   is a Firebase platform requirement, not something we can code
   around. Blaze still has a large free-usage tier; you only pay for
   what genuinely exceeds it.
═══════════════════════════════════════ */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Lock this down to your real domains once you know them (web origin +
// your Capacitor app's origin, typically 'https://localhost' or
// 'capacitor://localhost' on Android). '*' is left here so local dev
// and the Capacitor wrap both work out of the box; tighten before
// a public launch if you want to stop other sites from riding your key.
const ALLOWED_ORIGINS = new Set([
  '*',
]);

const _setCors = (req, res) => {
  const origin = req.get('origin') || '*';
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has('*') ? '*' : (ALLOWED_ORIGINS.has(origin) ? origin : 'null'));
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

exports.aiChat = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: false, timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    _setCors(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Require a signed-in Firebase user for every request — this is
    // what actually stops a stranger from burning your Anthropic
    // credits, since Cloud Functions v2 HTTPS endpoints are public
    // by default. We verify the ID token the client already has
    // (from Firebase Auth) rather than trusting any client claim.
    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: 'Missing Authorization: Bearer <Firebase ID token>' });
      return;
    }
    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) admin.initializeApp();
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      logger.warn('aiChat: token verification failed', e?.message);
      res.status(401).json({ error: 'Invalid or expired sign-in token' });
      return;
    }

    const { messages, system } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      res.status(400).json({ error: 'Body must include a non-empty "messages" array' });
      return;
    }

    let upstream;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: system || undefined,
          messages,
          stream: true,
        }),
      });
    } catch (e) {
      logger.error('aiChat: fetch to Anthropic failed', e);
      res.status(502).json({ error: 'Could not reach Anthropic' });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      logger.warn('aiChat: Anthropic returned', upstream.status, errText);
      res.status(upstream.status).json({ error: 'Anthropic error', detail: errText });
      return;
    }

    // Stream the SSE body straight through, unchanged — ai-coach.js's
    // existing ReadableStream parser is written against Anthropic's
    // raw SSE format and needs nothing different from this proxy.
    res.set('Content-Type', 'text/event-stream');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch (e) {
      logger.warn('aiChat: stream interrupted', e?.message);
    } finally {
      res.end();
    }
  }
);
