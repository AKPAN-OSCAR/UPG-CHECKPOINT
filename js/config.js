/* ═══════════════════════════════════════
   UPG — CONFIG
   One place for the one thing that changes between environments:
   the AI Coach's Cloud Function URL. Everything else (Firebase config)
   stays in firebase-init.js since it's the same real project everywhere.

   Load this file BEFORE js/features/ai-coach.js in index.html.

   After you deploy functions/index.js (see the deploy steps written
   at the top of that file), replace the URL below with the one
   Firebase prints, e.g.:
     https://us-central1-ur-personal-plan-guide.cloudfunctions.net/aiChat
═══════════════════════════════════════ */
window.UPG_AI_ENDPOINT = 'https://us-central1-ur-personal-plan-guide.cloudfunctions.net/aiChat';

// Set to true only while testing against `firebase emulators:start`.
window.UPG_AI_ENDPOINT_IS_CONFIGURED = !/YOUR-PROJECT|localhost/.test(window.UPG_AI_ENDPOINT);
