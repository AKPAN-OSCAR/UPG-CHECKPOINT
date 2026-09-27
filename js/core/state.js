/* ═══════════════════════════════════════
   UPG v10 — STATE MANAGER
   Section 2: Added PRIORITIES, SUB_TIERS, getTier, isPro, canDo
   Fixed: storage keys updated to lp10_ prefix (via Storage module)
   Fixed: saveAll() deep-copies arrays/objects before writing
   Fixed: loadUser() migrates from v9 keys automatically
   Added: data() and setData() for arbitrary per-user keys
   Added: subscription placeholder field on user object
═══════════════════════════════════════ */
const State = (() => {

  // ── GLOBAL ──
  let _users     = Storage.get('users')     || [];
  let _activeUid = Storage.get('activeUid') || null;
  let _sessionUid= null;

  // ── PER-USER RUNTIME CACHE ──
  let _tables     = [];
  let _blocks     = {};
  let _schedState = {};
  let _strkState  = {};
  let _notes      = {};
  let _badges     = {};
  let _alertCfg   = {};

  // ── LOAD USER ──
  const loadUser = uid => {
    _sessionUid = uid;
    _tables     = Storage.uGet(uid, 'tables')     || [];
    _blocks     = Storage.uGet(uid, 'blocks')     || {};
    _schedState = Storage.uGet(uid, 'schedState') || {};
    _strkState  = Storage.uGet(uid, 'strkState')  || {};
    _notes      = Storage.uGet(uid, 'notes')      || {};
    _badges     = Storage.uGet(uid, 'badges')     || {};
    _alertCfg   = Storage.uGet(uid, 'alertCfg')   || {
      enabled:       true,
      voiceEnabled:  true,
      alarmEnabled:  false,
      personality:   'friendly',
      volume:        0.9,
      alarmVolume:   0.8,
      autoDetect:    true,
      threshold:     50,
      manualTimes:   [],
    };
  };

  const logoutUser = () => { _sessionUid = null; };

  // ── SAVE ALL ──
  // Deep-copies before writing so future mutations don't affect stored data
  const _copy = v => JSON.parse(JSON.stringify(v));

  const saveAll = () => {
    Storage.set('users',     _users);
    Storage.set('activeUid', _activeUid);
    if (!_sessionUid) return;
    Storage.uSet(_sessionUid, 'tables',     _copy(_tables));
    Storage.uSet(_sessionUid, 'blocks',     _copy(_blocks));
    Storage.uSet(_sessionUid, 'schedState', _copy(_schedState));
    Storage.uSet(_sessionUid, 'strkState',  _copy(_strkState));
    Storage.uSet(_sessionUid, 'notes',      _copy(_notes));
    Storage.uSet(_sessionUid, 'badges',     _copy(_badges));
    Storage.uSet(_sessionUid, 'alertCfg',   _copy(_alertCfg));
  };

  const saveGlobal = () => {
    Storage.set('users',     _users);
    Storage.set('activeUid', _activeUid);
  };

  // ── ARBITRARY PER-USER DATA (goals, mood, aiMessages, etc.) ──
  const data    = (key, fallback = null) => {
    if (!_sessionUid) return fallback;
    const v = Storage.uGet(_sessionUid, key);
    return v !== null && v !== undefined ? v : fallback;
  };
  const setData = (key, val) => {
    if (_sessionUid) Storage.uSet(_sessionUid, key, val);
  };

  // ── ACCESSOR ──
  const me = () => _users.find(u => u.id === _sessionUid) || null;

  // ── SUBSCRIPTION HELPERS ──
  const getTier = () => {
    const u = me();
    const tierId = u?.subscription?.tier || 'free';
    return SUB_TIERS[tierId] || SUB_TIERS.free;
  };
  const isPro  = () => { const t = getTier(); return t.id === 'pro' || t.id === 'team'; };
  const canDo  = (feature) => {
    const t = getTier();
    return t.features.includes('all') || t.features.includes(feature);
  };

  // ══════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════

  const DEFAULT_BLOCKS = [
    { id:'d0', label:'Critical Thinking / Planning', tag:'FOCUS',   start:'05:00', end:'05:30' },
    { id:'d1', label:'House Chores',                 tag:'HOME',    start:'05:40', end:'06:30' },
    { id:'d2', label:'Cook · Bath · Eat · Get Ready',tag:'MORNING', start:'06:35', end:'07:20' },
    { id:'d3', label:'School Activities',            tag:'SCHOOL',  start:'08:00', end:'17:00' },
    { id:'d4', label:'Software Work',                tag:'WORK',    start:'10:00', end:'14:00' },
    { id:'d5', label:'Have Little Fun',              tag:'LEISURE', start:'14:00', end:'15:00' },
    { id:'d6', label:'Hardware Work',                tag:'WORK',    start:'15:00', end:'19:00' },
    { id:'d7', label:'School Revision',              tag:'STUDY',   start:'20:00', end:'22:00' },
    { id:'d8', label:'Nice Sleep',                   tag:'REST',    start:'22:00', end:'04:00' },
  ];

  const TZ_LIST = [
    { tz:'Africa/Lagos',        name:'🇳🇬 Nigeria',     off:'WAT · UTC+1'   },
    { tz:'Africa/Accra',        name:'🇬🇭 Ghana',        off:'GMT · UTC+0'   },
    { tz:'Africa/Nairobi',      name:'🇰🇪 Kenya',        off:'EAT · UTC+3'   },
    { tz:'Africa/Johannesburg', name:'🇿🇦 South Africa', off:'SAST · UTC+2'  },
    { tz:'Africa/Cairo',        name:'🇪🇬 Egypt',        off:'EET · UTC+2'   },
    { tz:'Europe/London',       name:'🇬🇧 London',       off:'GMT/BST'       },
    { tz:'Europe/Paris',        name:'🇫🇷 Paris',        off:'CET/CEST'      },
    { tz:'America/New_York',    name:'🇺🇸 New York',     off:'EST/EDT'       },
    { tz:'America/Los_Angeles', name:'🇺🇸 Los Angeles',  off:'PST/PDT'       },
    { tz:'Asia/Dubai',          name:'🇦🇪 Dubai',        off:'GST · UTC+4'   },
    { tz:'Asia/Kolkata',        name:'🇮🇳 India',        off:'IST · UTC+5:30'},
    { tz:'Asia/Shanghai',       name:'🇨🇳 China',        off:'CST · UTC+8'   },
  ];

  const THEMES = [
    { id:'green',  color:'#00e676', name:'Green'  },
    { id:'red',    color:'#ff4757', name:'Red'    },
    { id:'blue',   color:'#2196f3', name:'Blue'   },
    { id:'yellow', color:'#ffd600', name:'Yellow' },
    { id:'black',  color:'#e0e0e0', name:'White'  },
    { id:'orange', color:'#ff6d00', name:'Orange' },
    { id:'purple', color:'#9c27b0', name:'Purple' },
    { id:'brown',  color:'#8d6e63', name:'Brown'  },
    { id:'maroon', color:'#880e4f', name:'Maroon' },
    { id:'lemon',  color:'#c6ff00', name:'Lemon'  },
  ];

  const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTH_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const DAY_NAMES   = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  const DAY_FULL    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  const TYPE_META = {
    timetable: { icon:'📋', label:'Daily Schedule' },
    build:     { icon:'🔥', label:'Build Habit'    },
    stop:      { icon:'🚫', label:'Stop Habit'     },
  };

  // Block priority weights — affects consistency score weighting and AI context
  const PRIORITIES = {
    critical: { id:'critical', label:'CRITICAL', color:'#ff4757', weight:4,
                desc:'Mission-critical. Missing this costs the most.' },
    high:     { id:'high',     label:'HIGH',     color:'#ffa502', weight:2,
                desc:'Important. Missing it matters significantly.' },
    normal:   { id:'normal',   label:'NORMAL',   color:'#00e676', weight:1,
                desc:'Standard block. Part of daily routine.' },
    background:{ id:'background',label:'BACKGROUND',color:'#6b7885',weight:0.25,
                desc:'Low priority. Nice to do, not essential.' },
  };

  // Subscription tiers — gates for feature access
  const SUB_TIERS = {
    free: {
      id:'free', label:'FREE', color:'#6b7885',
      maxTables: 2, maxGoals: 5, maxAIDaily: 10,
      features: ['basic_schedule','habits','badges','basic_history'],
    },
    pro: {
      id:'pro', label:'PRO', color:'#00e676',
      maxTables: Infinity, maxGoals: Infinity, maxAIDaily: Infinity,
      features: ['basic_schedule','habits','badges','basic_history',
                 'advanced_ai','decision_log','reflection','heatmap',
                 'export','priority_blocks','goal_linking'],
    },
    team: {
      id:'team', label:'TEAM', color:'#2196f3',
      maxTables: Infinity, maxGoals: Infinity, maxAIDaily: Infinity,
      features: ['all'],
    },
  };

  const VOICE_PERSONALITIES = {
    strict:       {
      name:'Strict 😤', pitch:.9, rate:1.0,
      messages:[
        '{name}! Your tasks are waiting. Do them now.',
        '{name}, stop procrastinating. You set this schedule.',
        'No excuses {name}. Get it done.',
        'Time is running out, {name}. Move.',
        '{name}, discipline means doing it even when you don\'t want to.',
      ],
    },
    friendly: {
      name:'Friendly 😊', pitch:1.1, rate:.95,
      messages:[
        'Hey {name}! Your tasks are waiting. You\'ve got this!',
        '{name}, a little effort now saves a lot of stress later.',
        'Time to shine {name}! Let\'s make today count.',
        'Hey {name}, even one task done is progress. Start small!',
        '{name}, you\'re doing better than you think. Keep going!',
      ],
    },
    motivational: {
      name:'Motivational 💪', pitch:1.15, rate:1.0,
      messages:[
        '{name}! Let\'s get those tasks done! You are capable of more than you know.',
        '{name}, champions show up every single day. Today is your day!',
        'Rise up {name}! Your future self is counting on what you do right now.',
        '{name}, every completed task is a vote for the person you\'re becoming.',
        'No days off, {name}! Consistency is the real superpower.',
      ],
    },
  };

  const QUOTES = [
    { text:"Discipline is doing what needs to be done, even when you don't want to.", author:"Unknown" },
    { text:"Small disciplines repeated with consistency every day lead to great achievements.", author:"John C. Maxwell" },
    { text:"The secret of your future is hidden in your daily routine.", author:"Mike Murdock" },
    { text:"We are what we repeatedly do. Excellence is not an act but a habit.", author:"Aristotle" },
    { text:"Success is the sum of small efforts repeated day in and day out.", author:"Robert Collier" },
    { text:"Motivation gets you going. Discipline keeps you growing.", author:"John C. Maxwell" },
    { text:"Your daily choices shape your destiny. Choose wisely.", author:"Unknown" },
    { text:"The pain of discipline is far less than the pain of regret.", author:"Unknown" },
    { text:"Don't count the days, make the days count.", author:"Muhammad Ali" },
    { text:"It's not about having time. It's about making time.", author:"Unknown" },
    { text:"Hard work beats talent when talent doesn't work hard.", author:"Tim Notke" },
    { text:"Push yourself because no one else is going to do it for you.", author:"Unknown" },
    { text:"Wake up with determination. Go to bed with satisfaction.", author:"Unknown" },
    { text:"Little by little, a little becomes a lot.", author:"Tanzanian Proverb" },
    { text:"The only way to do great work is to love what you do.", author:"Steve Jobs" },
  ];

  const BADGE_DEFS = [
    { id:'first_tick',   icon:'✅', name:'First Step',       desc:'Mark your first task done'           },
    { id:'day_complete', icon:'⭐', name:'Perfect Day',       desc:'Complete all blocks in one day'      },
    { id:'streak_3',     icon:'🔥', name:'On Fire',           desc:'3-day streak on any tracker'         },
    { id:'streak_7',     icon:'🌟', name:'One Week Strong',   desc:'7-day streak on any tracker'         },
    { id:'streak_14',    icon:'💎', name:'Two Week Warrior',  desc:'14-day streak on any tracker'        },
    { id:'streak_30',    icon:'👑', name:'Monthly Champion',  desc:'30-day streak on any tracker'        },
    { id:'week_done',    icon:'🏆', name:'Full Week',         desc:'Complete every active day of a week' },
    { id:'tables_3',     icon:'📚', name:'Planner',           desc:'Create 3 or more tables'             },
    { id:'consistent',   icon:'💪', name:'Consistent',        desc:'Consistency score above 80'          },
    { id:'early_bird',   icon:'🌅', name:'Early Bird',        desc:'Complete a task before 6 AM'         },
  ];

  // ── RUNTIME NAV STATE ──
  let activeTab    = 'home';
  let activeTbl    = null;
  let activeWk     = 0;
  let activeDy     = 0;
  let activeTTMode = 'sched';
  let archOpen     = false;

  return {
    // Global
    get users()       { return _users; },       set users(v)       { _users = v; },
    get activeUid()   { return _activeUid; },   set activeUid(v)   { _activeUid = v; },
    get sessionUid()  { return _sessionUid; },

    // Per-user runtime
    get tables()      { return _tables; },      set tables(v)      { _tables = v; },
    get blocks()      { return _blocks; },      set blocks(v)      { _blocks = v; },
    get schedState()  { return _schedState; },  set schedState(v)  { _schedState = v; },
    get strkState()   { return _strkState; },   set strkState(v)   { _strkState = v; },
    get notes()       { return _notes; },       set notes(v)       { _notes = v; },
    get badges()      { return _badges; },      set badges(v)      { _badges = v; },
    get alertCfg()    { return _alertCfg; },    set alertCfg(v)    { _alertCfg = v; },

    // Nav
    get activeTab()   { return activeTab; },    set activeTab(v)   { activeTab = v; },
    get activeTbl()   { return activeTbl; },    set activeTbl(v)   { activeTbl = v; },
    get activeWk()    { return activeWk; },     set activeWk(v)    { activeWk = v; },
    get activeDy()    { return activeDy; },     set activeDy(v)    { activeDy = v; },
    get activeTTMode(){ return activeTTMode; }, set activeTTMode(v){ activeTTMode = v; },
    get archOpen()    { return archOpen; },     set archOpen(v)    { archOpen = v; },

    me, getTier, isPro, canDo, loadUser, logoutUser, saveAll, saveGlobal,
    data, setData,
    DEFAULT_BLOCKS, TZ_LIST, THEMES,
    MONTH_FULL, MONTH_SHORT, DAY_NAMES, DAY_FULL,
    TYPE_META, PRIORITIES, SUB_TIERS, VOICE_PERSONALITIES, QUOTES, BADGE_DEFS,
  };
})();
