import React, { useState, useEffect } from 'react';
import Icon from './components/Icon.jsx';
import AuthBackground from './components/AuthBackground.jsx';

import Login from './screens/Login.jsx';
import Setup from './screens/Setup.jsx';
import Home from './screens/Home.jsx';
import AICoach from './screens/AICoach.jsx';
import Progress from './screens/Progress.jsx';
import Menu from './screens/Menu.jsx';
import NewTableModal from './screens/NewTableModal.jsx';
import AddBlockModal from './screens/AddBlockModal.jsx';
import TimetableView from './screens/TimetableView.jsx';
import HabitView from './screens/HabitView.jsx';
import AlarmSettings from './screens/AlarmSettings.jsx';
import GoalsScreen from './screens/GoalsScreen.jsx';
import ManageTables from './screens/ManageTables.jsx';
import History from './screens/History.jsx';
import Account from './screens/Account.jsx';
import Preferences from './screens/Preferences.jsx';
import DataSync from './screens/DataSync.jsx';
import Help from './screens/Help.jsx';
import Widget from './screens/Widget.jsx';

import State from './core/state.js';
import useAuth from './hooks/useAuth.js';
import useTheme from './hooks/useTheme.js';
import useUPG from './hooks/useUPG.js';
import useGoals from './hooks/useGoals.js';
import useAICoach from './hooks/useAICoach.js';
import useAlarmSystem from './hooks/useAlarmSystem.js';

const TABS = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'progress', icon: 'trophy', label: 'Progress' },
  { key: 'coach', icon: 'compass', label: 'Coach' },
  { key: 'menu', icon: 'menu', label: 'Menu' },
];

export default function App() {
  const auth = useAuth();
  const theme = useTheme();
  const upg = useUPG();
  const goalsApi = useGoals();
  const coach = useAICoach(upg, goalsApi);
  const alarms = useAlarmSystem();

  const [tab, setTab] = useState('home');
  const [pushed, setPushed] = useState(null);
  const [modal, setModal] = useState(null);
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    if (!auth.user || !alarms.cfg.enabled) return;
    upg.tables.filter(t => !t.archived && t.type === 'timetable').forEach(table => {
      const { wk, dy } = upg.TZ.getTodayWkDay(table);
      (upg.blocks[table.id] || []).forEach((block, i) => {
        const isDoneNow = () => {
          const st = ((upg.schedState[table.id] || {})[wk] || {})[dy] || [];
          return st[i] === 1;
        };
        alarms.scheduleBlockEscalation(block, isDoneNow);
      });
    });
  }, [auth.user, alarms.cfg.enabled, upg.version]);

  // ── AUTH GATE ──
  // AuthBackground wraps BOTH Login and Setup — it's mounted once
  // here, so the same slow-rotating photo background continues
  // uninterrupted for the whole pre-app experience, whether the user
  // is a brand-new signup going through Setup's real questions, or a
  // returning user just signing in. It only disappears once we reach
  // the real app below.
  if (!auth.user) {
    return <AuthBackground><Login auth={auth} /></AuthBackground>;
  }
  const needsSetup = !State.me()?.tz && !setupDone;
  if (needsSetup) {
    return <AuthBackground><Setup userName={auth.user.name} onComplete={() => setSetupDone(true)} /></AuthBackground>;
  }

  const openTable = (table) => setPushed({ key: table.type === 'timetable' ? 'timetable' : 'habit', props: { table } });
  const closePush = () => setPushed(null);

  return (
    <div className="app-shell" style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {!pushed && tab === 'home' && (
        <Home upg={upg} userName={auth.user.name} onOpenMenu={() => setTab('menu')} onOpenTable={openTable} onNewTable={() => setModal({ key: 'new-table' })} />
      )}
      {!pushed && tab === 'progress' && <Progress upg={upg} />}
      {!pushed && tab === 'coach' && <AICoach coach={coach} />}
      {!pushed && tab === 'menu' && <Menu theme={theme} onClose={() => setTab('home')} onNavigate={(key) => setPushed({ key })} />}

      {pushed?.key === 'timetable' && <TimetableView upg={upg} table={pushed.props.table} onBack={closePush} onAddBlock={() => setModal({ key: 'add-block', props: { table: pushed.props.table } })} />}
      {pushed?.key === 'habit' && <HabitView upg={upg} table={pushed.props.table} onBack={closePush} />}
      {pushed?.key === 'alarms' && <AlarmSettings alarms={alarms} onBack={closePush} />}
      {pushed?.key === 'goals' && <GoalsScreen goalsApi={goalsApi} onBack={closePush} />}
      {pushed?.key === 'managetables' && <ManageTables upg={upg} onBack={closePush} />}
      {pushed?.key === 'history' && <History upg={upg} onBack={closePush} />}
      {pushed?.key === 'account' && <Account auth={auth} onBack={closePush} />}
      {pushed?.key === 'preferences' && <Preferences onBack={closePush} />}
      {pushed?.key === 'sync' && <DataSync onBack={closePush} />}
      {pushed?.key === 'help' && <Help onBack={closePush} />}
      {pushed?.key === 'widget' && <Widget upg={upg} onBack={closePush} />}

      {modal?.key === 'new-table' && <NewTableModal upg={upg} onClose={() => setModal(null)} onCreated={(table) => { setModal(null); openTable(table); }} />}
      {modal?.key === 'add-block' && <AddBlockModal upg={upg} table={modal.props.table} onClose={() => setModal(null)} />}

      {!pushed && (
        <nav className="navbar" aria-label="Main navigation">
          {TABS.map(({ key, icon, label }) => (
            <button key={key} className={`nb${tab === key ? ' on' : ''}`} aria-label={label} onClick={() => setTab(key)}>
              <Icon name={icon} size={20} />
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
