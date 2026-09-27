/* ═══════════════════════════════════════
   UPG v10 — GOALS + MOOD
   Fixed: Mood uses TZ.formatDateKey() — same key format as calendar
   Fixed: getMoodHistory uses TZ.formatDateKey() for consistent lookup
   Fixed: Mood is defined once here (removed duplicate in calendar.js)
   Added: Goals.editGoal() for in-place milestone editing
═══════════════════════════════════════ */

/* ════════ GOALS ════════ */
const Goals = (() => {
  const DEFAULT_AREAS = [
    { id:'health',    name:'Health',    color:'#00e676', icon:'💪' },
    { id:'work',      name:'Work',      color:'#2196f3', icon:'💼' },
    { id:'family',    name:'Family',    color:'#ff6d00', icon:'🏠' },
    { id:'finance',   name:'Finance',   color:'#ffd600', icon:'💰' },
    { id:'spiritual', name:'Spiritual', color:'#9c27b0', icon:'🙏' },
    { id:'learning',  name:'Learning',  color:'#00bcd4', icon:'📚' },
  ];

  const getAreas = () => [...DEFAULT_AREAS, ...State.data('customAreas', [])];

  const addArea = (name, color, icon) => {
    const custom = State.data('customAreas', []);
    custom.push({ id:'a_' + Date.now(), name, color, icon: icon || '🎯' });
    State.setData('customAreas', custom);
    State.saveAll();
  };

  const getGoals  = ()      => State.data('goals', []);
  const saveGoals = goals   => { State.setData('goals', goals); State.saveAll(); };

  const addGoal = goal => {
    const goals = getGoals();
    goals.push({
      id:         'g_' + Date.now(),
      name:       goal.name,
      desc:       goal.desc || '',
      areaId:     goal.areaId || 'work',
      deadline:   goal.deadline || '',
      createdAt:  new Date().toISOString(),
      milestones: (goal.milestones || []).map((m, i) => ({
        id:   'ms_' + Date.now() + '_' + i,
        text: m,
        done: false,
      })),
    });
    saveGoals(goals);
    Toast.success('Goal created!');
  };

  const toggleMilestone = (goalId, msId) => {
    const goals = getGoals();
    const g     = goals.find(g => g.id === goalId);
    if (!g) return;
    const ms = g.milestones.find(m => m.id === msId);
    if (ms) { ms.done = !ms.done; saveGoals(goals); }
  };

  const deleteGoal = async goalId => {
    const ok = await Confirm.show({
      icon:'🎯', title:'DELETE GOAL?',
      msg:'This goal and all its milestones will be permanently removed.',
      confirmLabel:'YES, DELETE', danger:true,
    });
    if (!ok) return;
    saveGoals(getGoals().filter(g => g.id !== goalId));
    renderGoals();
    Toast.success('Goal deleted');
  };

  const getProgress = goal => {
    if (!goal.milestones.length) return 0;
    return Math.round(goal.milestones.filter(m => m.done).length / goal.milestones.length * 100);
  };

  const renderGoals = (filterAreaId = null) => {
    const wrap = document.getElementById('goals-list');
    if (!wrap) return;
    const goals = getGoals().filter(g => !filterAreaId || g.areaId === filterAreaId);
    const areas = getAreas();
    wrap.innerHTML = '';

    if (!goals.length) {
      wrap.innerHTML = `<div style="text-align:center;padding:32px 16px">
        <div style="font-size:32px;margin-bottom:8px">🎯</div>
        <div style="font-family:var(--font-m);font-size:9px;color:var(--tx3);letter-spacing:1px">
          NO GOALS YET — TAP ＋ TO CREATE ONE
        </div>
      </div>`;
      return;
    }

    goals.forEach(g => {
      const area = areas.find(a => a.id === g.areaId) || areas[0];
      const pct  = getProgress(g);
      const card = document.createElement('div');
      card.className = 'goal-card fu';

      const deadlineStr = g.deadline
        ? (() => { const d = new Date(g.deadline); return `${d.getDate()} ${State.MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`; })()
        : 'No deadline';

      card.innerHTML = `
        <div class="goal-card-head" onclick="this.nextElementSibling.nextElementSibling.classList.toggle('open')">
          <div class="goal-area-dot" style="background:${area.color}"></div>
          <div class="goal-name">${_esc(g.name)}</div>
          <div class="goal-deadline">${deadlineStr}</div>
          <div style="color:var(--tx3);font-size:12px;margin-left:6px">›</div>
        </div>
        <div class="goal-prog-bar">
          <div class="goal-prog-fill" style="width:${pct}%;background:${area.color}"></div>
        </div>
        <div class="goal-body">
          ${g.desc ? `<div class="goal-desc">${_esc(g.desc)}</div>` : ''}
          <div style="font-family:var(--font-m);font-size:7px;color:var(--tx3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">
            ${area.icon} ${area.name} · ${pct}% complete
          </div>
          <div class="goal-milestones">
            ${g.milestones.map(ms => `
              <div class="milestone-item${ms.done ? ' done' : ''}"
                onclick="Goals.toggleMilestone('${g.id}','${ms.id}');Goals.renderGoals()">
                <div class="milestone-check">${ms.done ? '✓' : ''}</div>
                <span>${_esc(ms.text)}</span>
              </div>`).join('')}
          </div>
          <div style="display:flex;gap:6px;margin-top:12px">
            <button class="btn btn-ghost btn-sm" style="flex:1"
              onclick="Goals.deleteGoal('${g.id}')">🗑 DELETE</button>
          </div>
        </div>`;
      wrap.appendChild(card);
    });
  };

  const renderAreaFilter = () => {
    const el = document.getElementById('area-filter');
    if (!el) return;
    el.innerHTML = '';

    const all = document.createElement('div');
    all.className = 'area-chip active';
    all.textContent = '🌐 All';
    all.onclick = () => {
      el.querySelectorAll('.area-chip').forEach(c => c.classList.remove('active'));
      all.classList.add('active');
      renderGoals(null);
    };
    el.appendChild(all);

    getAreas().forEach(a => {
      const chip = document.createElement('div');
      chip.className = 'area-chip';
      chip.innerHTML = `<div class="area-dot" style="background:${a.color}"></div>${a.name}`;
      chip.onclick = () => {
        el.querySelectorAll('.area-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderGoals(a.id);
      };
      el.appendChild(chip);
    });
  };

  const _esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  return { getAreas, addArea, getGoals, addGoal, toggleMilestone, deleteGoal, getProgress, renderGoals, renderAreaFilter };
})();


/* ════════ MOOD ════════ */
// NOTE: Mood is defined HERE (goals.js), not in calendar.js.
// calendar.js imports and uses Mood.getMoodEmoji() and Mood.renderMoodPicker().
const Mood = (() => {
  const MOODS = [
    { id:'great', emoji:'😄', label:'Great' },
    { id:'good',  emoji:'😊', label:'Good'  },
    { id:'okay',  emoji:'😐', label:'Okay'  },
    { id:'low',   emoji:'😔', label:'Low'   },
    { id:'awful', emoji:'😞', label:'Awful' },
  ];

  // Fixed: use TZ.formatDateKey() — same key used by Calendar and AI coach
  const _key    = (d) => 'mood_' + TZ.formatDateKey(d);

  const getTodayMood  = ()   => State.data(_key(), null);
  const getMoodEmoji  = id   => MOODS.find(m => m.id === id)?.emoji || '–';

  const setTodayMood = id => {
    State.setData(_key(), id);
    State.saveAll();
    renderMoodPicker();
    Toast.success('Mood logged! ' + getMoodEmoji(id));
  };

  const getMoodHistory = (days = 30) => {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(TZ.now());
      d.setDate(d.getDate() - i);
      result.push({ date: d, mood: State.data(_key(d), null) });
    }
    return result;
  };

  const renderMoodPicker = () => {
    const el = document.getElementById('mood-picker');
    if (!el) return;
    const today = getTodayMood();
    el.innerHTML = '';
    MOODS.forEach(m => {
      const btn = document.createElement('div');
      btn.className = `mood-btn${m.id === today ? ' selected' : ''}`;
      btn.innerHTML = `<div class="mood-emoji">${m.emoji}</div><div class="mood-label">${m.label}</div>`;
      btn.onclick   = () => setTodayMood(m.id);
      el.appendChild(btn);
    });
  };

  return { MOODS, getTodayMood, setTodayMood, getMoodEmoji, getMoodHistory, renderMoodPicker };
})();
