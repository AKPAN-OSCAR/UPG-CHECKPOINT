import React, { useRef } from 'react';
import Icon from '../components/Icon.jsx';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import Storage from '../core/storage.js';

export default function DataSync({ onBack }) {
  const fileRef = useRef(null);

  const exportBackup = () => {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `upg-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = Storage.importAll(reader.result);
      alert(ok ? 'Backup restored — reload the app to see your data.' : 'Could not read that backup file.');
    };
    reader.readAsText(file);
  };

  return (
    <ScreenFrame title="Data & Sync" onBack={onBack}>
      <div className="screen-root px" style={{ paddingTop: 16 }}>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="h2">Backup your data</div>
          <div className="muted" style={{ margin: '6px 0 14px' }}>Downloads everything — tables, blocks, history, goals — as one JSON file you can keep safe or move to another device.</div>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={exportBackup}><Icon name="download" size={15} />Export backup</button>
        </div>
        <div className="card">
          <div className="h2">Restore a backup</div>
          <div className="muted" style={{ margin: '6px 0 14px' }}>Choose a previously exported UPG backup file.</div>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} />Import backup</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={importBackup} />
        </div>
      </div>
    </ScreenFrame>
  );
}
