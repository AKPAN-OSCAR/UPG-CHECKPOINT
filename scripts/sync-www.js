#!/usr/bin/env node
/* ═══════════════════════════════════════
   Copies the real, single-source-of-truth web assets (index.html,
   css/, js/, icons/, manifest.json, service-worker.js — all at the
   project root, right alongside test/, functions/, node_modules/)
   into www/, which is what capacitor.config.json points Android's
   build at.

   Why a copy script instead of just setting webDir to the project
   root: the root also contains node_modules, functions/, test/, and
   .md files — none of that belongs inside the installed app. Why not
   symlinks instead of copying: symlinks created on Linux/Mac often
   don't survive a zip → Windows-extract round trip, which would
   silently break the build on a Windows machine (Black's setup).
   Plain copies are slightly more to maintain (rerun this after any
   web asset change) but they always just work everywhere.

   Run this:
     - once now, before the first `npx cap add android`
     - again anytime you change index.html/css/js AND before your
       next `npx cap sync android` or Android Studio build
   Or just run `npm run sync` — it does both steps together.
═══════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const ITEMS = ['index.html', 'css', 'js', 'icons', 'manifest.json', 'service-worker.js'];

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const item of ITEMS) {
  const src = path.join(ROOT, item);
  const dest = path.join(WWW, item);
  if (!fs.existsSync(src)) { console.warn(`[sync-www] skipping missing: ${item}`); continue; }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[sync-www] copied ${item}`);
}
console.log('[sync-www] done — www/ is ready for Capacitor.');
