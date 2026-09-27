/* ═══════════════════════════════════════
   UPG v10 — AI COACH
   Fixed: anthropic-beta header removed (not needed for stream:true)
   Fixed: uses anthropic-version 2023-06-01 only
   Fixed: streaming text display (word-by-word via SSE simulation)
   Fixed: actual streaming with fetch + ReadableStream
   Fixed: context uses formatDateKey() for mood lookups
   Fixed: conversation history trimmed properly
   Added: typing cursor animation while streaming
   Added: auto-scroll follows streamed text
   Added: error message shown inline (not just fallback)
   Fixed (Step 1 backend): calls now go browser → Cloud Function proxy
         (aiChat) → Anthropic. No API key or provider details live in
         the client anymore. SSE parsing below is unchanged — the
         proxy relays Anthropic's stream through byte-for-byte.
═══════════════════════════════════════ */
const AICoach = (() => {
  // Cloud Function endpoint — set this to your deployed function URL.
  // Firebase gives you this after `firebase deploy --only functions`,
  // e.g. 'https://us-central1-YOUR-PROJECT.cloudfunctions.net/aiChat'
  const AI_ENDPOINT = window.UPG_AI_ENDPOINT || 'http://localhost:5001/YOUR-PROJECT/us-central1/aiChat';

  let _messages = [];
  let _thinking  = false;

  // ── BUILD CONTEXT FROM USER'S REAL DATA ──
  const _buildContext = () => {
    const u         = State.me();
    const score     = Stats.getConsistencyScore();
    const prog      = Widget.getProgress();
    const tt        = State.tables.filter(t => !t.archived && t.type === 'timetable');
    const habits    = State.tables.filter(t => !t.archived && t.type !== 'timetable');
    const goals     = State.data('goals', []);
    const todayKey  = TZ.formatDateKey();
    const todayMood = State.data('mood_' + todayKey, null);

    let ctx = `=== USER PROFILE ===\n`;
    ctx += `Name: ${u?.name || 'Unknown'}\n`;
    ctx += `Timezone: ${u?.tz || 'Unknown'}\n`;
    ctx += `Member since: ${u?.joinedAt ? new Date(u.joinedAt).toDateString() : 'Unknown'}\n`;
    ctx += `Life aim: ${u?.aim || 'Not set'}\n\n`;

    ctx += `=== TODAY'S STATUS ===\n`;
    ctx += `Date: ${TZ.formatFullDate(TZ.now())}\n`;
    ctx += `Tasks completed today: ${prog.done}/${prog.total} (${prog.pct}%)\n`;
    ctx += `Today's mood: ${todayMood || 'not logged'}\n`;
    ctx += `Overall consistency score: ${score}/100\n\n`;

    if (tt.length) {
      ctx += `=== TIMETABLES (${tt.length}) ===\n`;
      tt.forEach(tbl => {
        ctx += `\nTable: "${tbl.name}"\n`;
        ctx += `Goal: ${tbl.goal || 'none'}\n`;
        const blks = State.blocks[tbl.id] || [];
        ctx += `Blocks: ${blks.map(b => `${b.label} (${b.start}–${b.end})`).join(', ')}\n`;

        const bs = Stats.getBlockStats(tbl.id);
        const { wk } = TZ.getTodayWkDay(tbl);
        const summary = Stats.getWeeklySummary(tbl, wk);
        if (summary) {
          ctx += `This week: ${summary.overallPct}% (${summary.totalDone}/${summary.totalBlocks} tasks done)\n`;
          // Day breakdown
          const dayDetail = summary.dayPcts
            .map((p, i) => p !== null ? `${State.DAY_NAMES[i]}:${p}%` : null)
            .filter(Boolean).join(', ');
          if (dayDetail) ctx += `Day breakdown: ${dayDetail}\n`;
        }

        if (bs.length) {
          const sorted = [...bs].sort((a, b) =>
            (b.total ? b.done / b.total : 0) - (a.total ? a.done / a.total : 0)
          );
          const best  = sorted[0];
          const worst = sorted[sorted.length - 1];
          if (best?.total)  ctx += `Best block: ${best.label} (${Math.round(best.done / best.total * 100)}% done)\n`;
          if (worst?.total) ctx += `Most missed: ${worst.label} (${Math.round(worst.miss / worst.total * 100)}% missed)\n`;
        }
      });
    }

    if (habits.length) {
      ctx += `\n=== HABIT TRACKERS (${habits.length}) ===\n`;
      habits.forEach(t => {
        const age   = TZ.tableAgeDays(t);
        const s     = State.strkState[t.id] || [];
        let cur = 0;
        for (let i = age - 1; i >= 0; i--) { if (s[i] === 1) cur++; else break; }
        let best = 0, c = 0;
        s.forEach(v => { if (v === 1) { c++; best = Math.max(best, c); } else c = 0; });
        const total = s.filter(v => v === 1).length;
        ctx += `"${t.name}" (${t.type === 'stop' ? 'stopping' : 'building'}): streak ${cur} days now, best ${best} days, ${total} total days marked\n`;
      });
    }

    if (goals.length) {
      ctx += `\n=== LONG-TERM GOALS (${goals.length}) ===\n`;
      goals.forEach(g => {
        const pct = g.milestones.length
          ? Math.round(g.milestones.filter(m => m.done).length / g.milestones.length * 100)
          : 0;
        ctx += `"${g.name}" [${g.areaId}] — ${pct}% milestones complete`;
        if (g.deadline) ctx += `, deadline: ${g.deadline}`;
        ctx += '\n';
      });
    }

    // Last 7 days moods
    const recentMoods = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(TZ.now());
      d.setDate(d.getDate() - i);
      const key  = 'mood_' + TZ.formatDateKey(d);
      const mood = State.data(key, null);
      if (mood) recentMoods.push(mood);
    }
    if (recentMoods.length) {
      ctx += `\n=== MOOD (last 7 days) ===\n${recentMoods.join(', ')}\n`;
    }

    return ctx;
  };

  // ── SYSTEM PROMPT ──
  const _systemPrompt = () => {
    const ctx = _buildContext();
    return `You are the UPG AI Coach — a highly intelligent, empathetic, and direct personal productivity coach embedded in the UPG app.

You have REAL access to the user's actual schedule data shown below. Use it to give SPECIFIC, personalised advice — not generic tips. Reference their actual block names, streak numbers, scores, and patterns.

RULES:
- Be direct and honest, not just positive
- Reference REAL data: actual block names, numbers, days
- Give specific, actionable steps they can take TODAY
- Use **bold** for key points and numbers
- Keep responses under 200 words unless the user asks for detail
- Be conversational and warm but never fake
- If they're struggling, acknowledge it genuinely before advising
- Never repeat the same advice twice in a conversation

${ctx}

Current date/time: ${TZ.formatFullDate(TZ.now())}`;
  };

  // ── STREAMING API CALL ──
  // Uses fetch with ReadableStream to display text as it arrives
  const _callClaudeStreaming = async (userMessage, onChunk, onDone, onError) => {
    const msgs = [
      ..._messages.slice(-10).map(m => ({
        role:    m.role === 'coach' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    if (window.UPG_AI_ENDPOINT_IS_CONFIGURED === false) {
      console.warn('[AI] Cloud Function not deployed yet — see functions/index.js deploy steps');
      onError('not_configured');
      return;
    }

    try {
      const idToken = (typeof Auth !== 'undefined' && Auth.getIdToken) ? await Auth.getIdToken() : null;
      if (!idToken) { onError('signed_out'); return; }

      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken,
        },
        body: JSON.stringify({
          system:   _systemPrompt(),
          messages: msgs,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('[AI] proxy error:', res.status, errData);
        onError(res.status);
        return;
      }

      // Read the SSE stream
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let fullText  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const chunk = parsed.delta.text;
              fullText += chunk;
              onChunk(chunk, fullText);
            }
          } catch(e) {} // malformed JSON line — skip
        }
      }

      onDone(fullText);
    } catch(e) {
      console.warn('[AI] fetch error:', e);
      onError(0);
    }
  };

  // ── FALLBACK (offline / API error) ──
  const _fallback = (q) => {
    const score = Stats.getConsistencyScore();
    const prog  = Widget.getProgress();
    const name  = State.me()?.name || 'you';
    const ql    = q.toLowerCase();

    if (ql.includes('today') || ql.includes('progress'))
      return `Today you've done **${prog.done}/${prog.total} tasks (${prog.pct}%)**. Consistency score: **${score}/100**. ${prog.pct >= 80 ? '🏆 Excellent work!' : prog.pct >= 50 ? '📈 Keep going — finish strong.' : '💪 Start with your smallest task right now. One block done beats zero.'}`;

    if (ql.includes('motivat') || ql.includes('tired') || ql.includes('give up') || ql.includes('quit'))
      return `Feeling resistance is part of the process — it means you're actually pushing. **Action creates motivation, not the other way around.** Open your timetable. Pick the easiest block. Do 5 minutes. That's enough to break the inertia.`;

    if (ql.includes('streak') || ql.includes('habit'))
      return `Habits wire themselves through repetition, not willpower. The only rule: **never miss twice in a row.** A 50% day keeps the chain alive. A 0% day breaks it.`;

    if (ql.includes('fail') || ql.includes('miss') || ql.includes('behind'))
      return `Missing tasks doesn't mean you're failing — it means you have data. **Look at which block you miss most.** That's your real bottleneck. Fix the block time, the block content, or what comes before it. Then try again tomorrow.`;

    return `Your consistency score is **${score}/100** and today you've done **${prog.pct}%** of your tasks. ${score >= 70 ? "You're building real momentum — don't stop." : "Every completed task rewires your brain for discipline."} What specifically would you like help with?`;
  };

  // ── SEND MESSAGE (main entry) ──
  const sendMessage = async (question) => {
    if (!question.trim() || _thinking) return;
    _thinking = true;

    // Add user message
    _messages.push({ role: 'user', content: question, ts: Date.now() });
    _renderMessages();

    // Create streaming coach bubble
    const streamId = 'ai-stream-' + Date.now();
    _appendStreamBubble(streamId);

    let streamedText = '';
    let success      = false;

    await _callClaudeStreaming(
      question,
      // onChunk — called for every text delta
      (chunk, fullSoFar) => {
        streamedText = fullSoFar;
        _updateStreamBubble(streamId, fullSoFar);
      },
      // onDone — stream complete
      (finalText) => {
        success = true;
        streamedText = finalText || streamedText;
        _finaliseStreamBubble(streamId, streamedText);
        _thinking = false;
        _messages.push({ role: 'coach', content: streamedText, ts: Date.now() });
        State.setData('aiMessages', _messages.slice(-20));
        State.saveAll();
      },
      // onError — use fallback
      (statusCode) => {
        const fallbackText = _fallback(question);
        _finaliseStreamBubble(streamId, fallbackText, true);
        _thinking = false;
        _messages.push({ role: 'coach', content: fallbackText, ts: Date.now() });
        State.setData('aiMessages', _messages.slice(-20));
        State.saveAll();
      }
    );

    // Safety net if neither callback fired
    if (_thinking) {
      _thinking = false;
      const fb = _fallback(question);
      _finaliseStreamBubble(streamId, fb, true);
      _messages.push({ role: 'coach', content: fb, ts: Date.now() });
      State.saveAll();
    }
  };

  // ── DOM HELPERS ──
  const _md = text =>
    text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

  const _appendStreamBubble = (id) => {
    const el = document.getElementById('ai-messages');
    if (!el) return;

    // Remove thinking dots if present
    el.querySelector('.ai-thinking-wrap')?.remove();

    const div = document.createElement('div');
    div.className = 'ai-msg coach';
    div.id = id;

    const badge = document.createElement('div');
    badge.className = 'coach-badge';
    badge.innerHTML = '🤖 AI COACH';
    div.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'ai-stream-content';
    // Typing cursor
    content.innerHTML = '<span class="ai-cursor">▋</span>';
    div.appendChild(content);

    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  };

  const _updateStreamBubble = (id, text) => {
    const div = document.getElementById(id);
    if (!div) return;
    const content = div.querySelector('.ai-stream-content');
    if (!content) return;
    content.innerHTML = _md(text) + '<span class="ai-cursor">▋</span>';
    const el = document.getElementById('ai-messages');
    if (el) el.scrollTop = el.scrollHeight;
  };

  const _finaliseStreamBubble = (id, text, isOffline = false) => {
    const div = document.getElementById(id);
    if (!div) return;
    const content = div.querySelector('.ai-stream-content');
    if (!content) return;
    content.innerHTML = _md(text);
    if (isOffline) {
      const tag = document.createElement('div');
      tag.style.cssText = 'font-family:var(--font-m);font-size:7px;color:var(--tx3);margin-top:6px;letter-spacing:.5px';
      tag.textContent = '⚡ OFFLINE RESPONSE';
      content.appendChild(tag);
    }
    const el = document.getElementById('ai-messages');
    if (el) el.scrollTop = el.scrollHeight;
  };

  // ── FULL RENDER (for init / restore from storage) ──
  const _renderMessages = () => {
    const el = document.getElementById('ai-messages');
    if (!el) return;
    el.innerHTML = '';

    if (!_messages.length) {
      el.innerHTML = `<div style="text-align:center;padding:32px 16px">
        <div style="font-size:40px;margin-bottom:10px">🤖</div>
        <div style="font-size:18px;font-weight:800;letter-spacing:1px;margin-bottom:8px">AI COACH</div>
        <div style="font-family:var(--font-m);font-size:9px;color:var(--tx2);letter-spacing:.5px;line-height:1.9">
          I know your actual schedule data.<br>Ask me anything — I'll give you<br>real, personalised advice.
        </div>
      </div>`;
      return;
    }

    _messages.forEach(m => {
      const div = document.createElement('div');
      div.className = `ai-msg ${m.role === 'user' ? 'user' : 'coach'}`;
      if (m.role === 'coach') {
        const badge = document.createElement('div');
        badge.className = 'coach-badge';
        badge.innerHTML = '🤖 AI COACH';
        div.appendChild(badge);
      }
      const content = document.createElement('div');
      content.innerHTML = _md(m.content);
      div.appendChild(content);
      el.appendChild(div);
    });
    el.scrollTop = el.scrollHeight;
  };

  const init = () => {
    _messages = State.data('aiMessages', []);
    _renderMessages();
  };

  const clearHistory = () => {
    _messages = [];
    State.setData('aiMessages', []);
    State.saveAll();
    _renderMessages();
    Toast.success('Conversation cleared');
  };

  return { sendMessage, init, clearHistory };
})();
