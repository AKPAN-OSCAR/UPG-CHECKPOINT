import { useState, useCallback, useRef } from 'react';
import State from '../core/state.js';
import { getAuth, getIdToken } from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';

export default function useAICoach(upg, goalsApi) {
  const [messages, setMessages] = useState(() => State.data('aiMessages', [
    { role: 'coach', content: "Hey — I'm here whenever you want to talk through your day, a goal, or just how you're feeling about your progress." },
  ]));
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const streamingRef = useRef('');

  const _persistMessages = (msgs) => State.setData('aiMessages', msgs.slice(-20));

  // Real context — matches the depth of the original ai-coach.js:
  // profile, today's status, FULL per-table breakdown (not just a
  // today list), habit streaks, goals with milestone %, mood history.
  const buildContext = () => {
    const u = State.me?.() || {};
    let ctx = `=== USER ===\nName: ${u.name || 'Unknown'}\nLife aim: ${u.aim || 'not set'}\n\n`;

    ctx += `=== TIMETABLES ===\n`;
    upg.tables.filter(t => !t.archived && t.type === 'timetable').forEach(t => {
      const blks = upg.blocks[t.id] || [];
      const { wk, dy } = upg.TZ.getTodayWkDay(t);
      const st = ((upg.schedState[t.id] || {})[wk] || {})[dy] || [];
      const done = st.filter(s => s === 1).length;
      ctx += `- ${t.name}: ${done}/${blks.length} done today\n`;
      blks.forEach((b, i) => { ctx += `   · ${b.label} (${b.start}-${b.end}, ${b.priority}): ${st[i] === 1 ? 'done' : st[i] === 2 ? 'missed' : 'not marked'}\n`; });
    });

    ctx += `\n=== HABITS ===\n`;
    upg.tables.filter(t => !t.archived && t.type !== 'timetable').forEach(t => {
      ctx += `- ${t.name} (${t.type === 'build' ? 'building' : 'breaking'}): current streak ${upg.getHabitStreak(t.id)}, best ${upg.getHabitBestStreak(t.id)}\n`;
    });

    if (goalsApi?.goals?.length) {
      ctx += `\n=== GOALS ===\n`;
      goalsApi.goals.forEach(g => {
        const pct = g.milestones.length ? Math.round(g.milestones.filter(m => m.done).length / g.milestones.length * 100) : 0;
        ctx += `- ${g.title} (${g.area}): ${pct}% of milestones done\n`;
      });
    }

    ctx += `\nConsistency score: ${upg.consistencyScore}%\n`;
    return ctx;
  };

  const systemPrompt = () => `You are the UPG AI Coach — a warm, direct, genuinely encouraging personal coach embedded in the UPG app, not a stats narrator.

RULES:
- Talk like a real coach who knows this person, not a report generator. Never open a reply by reciting numbers back at them ("your consistency score is X%...") — weave real data into natural sentences only when it actually helps what you're saying.
- Reference their REAL data below (actual task names, streaks, times) to be specific, not generic.
- Give concrete, actionable next steps, not vague encouragement.
- Celebrate real wins genuinely. If they're struggling, acknowledge it before advising — never scold.
- Keep replies under 150 words unless they ask for more detail.
- Casual greetings ("hey", "hi") get a casual, human reply — not a data dump.

${buildContext()}`;

  const send = useCallback(async (userText) => {
    setError(null);
    const nextMessages = [...messages, { role: 'user', content: userText }];
    setMessages(nextMessages);
    _persistMessages(nextMessages);
    setThinking(true);
    streamingRef.current = '';

    const endpoint = window.UPG_AI_ENDPOINT;
    if (window.UPG_AI_ENDPOINT_IS_CONFIGURED === false || !endpoint) {
      setThinking(false);
      setError('not_configured');
      setMessages(m => [...m, { role: 'coach', content: "I can't reach my real brain yet — the Cloud Function hasn't been deployed. Once that's live, I'll respond for real instead of this placeholder." }]);
      return;
    }

    try {
      const auth = getAuth(); // default app — matches email/Google/phone's shared app instance
      const idToken = auth.currentUser ? await getIdToken(auth.currentUser) : null;
      if (!idToken) { setThinking(false); setError('signed_out'); return; }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({
          system: systemPrompt(),
          messages: nextMessages.slice(-10).map(m => ({ role: m.role === 'coach' ? 'assistant' : 'user', content: m.content })),
        }),
      });

      if (!res.ok) { setThinking(false); setError(String(res.status)); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      setMessages(m => [...m, { role: 'coach', content: '' }]); // placeholder that streams in

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              streamingRef.current += parsed.delta.text;
              const snapshot = streamingRef.current;
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'coach', content: snapshot };
                return copy;
              });
            }
          } catch (e) { /* skip malformed SSE line */ }
        }
      }
    } catch (e) {
      setError('network');
    } finally {
      setThinking(false);
    }
  }, [messages, upg, goalsApi]);

  return { messages, thinking, error, send };
}
