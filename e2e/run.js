const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const APP_DIR = '..';
const MOCK_DIR = '.';
const PORT = 6701;

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

function serveDir(rootDir) {
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    let filePath = path.join(rootDir, urlPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404); res.end('not found: ' + filePath); return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function main() {
  const appServer = serveDir(APP_DIR);
  await new Promise(r => appServer.listen(PORT, r));
  console.log(`App served at http://localhost:${PORT}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

  await page.route('https://www.gstatic.com/firebasejs/**/firebase-app.js', route =>
    route.fulfill({ contentType: 'application/javascript', path: path.join(MOCK_DIR, 'mock-firebase-app.js') }));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js', route =>
    route.fulfill({ contentType: 'application/javascript', path: path.join(MOCK_DIR, 'mock-firebase-auth.js') }));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-firestore.js', route =>
    route.fulfill({ contentType: 'application/javascript', path: path.join(MOCK_DIR, 'mock-firebase-firestore.js') }));

  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERTION FAILED: ' + msg); };

  const dismissOnboarding = async () => {
    for (let i = 0; i < 20; i++) {
      const ov = page.locator('#onboarding-overlay');
      if (await ov.isVisible().catch(() => false)) {
        await page.click('button:has-text("SKIP")');
        await page.waitForTimeout(150);
        return;
      }
      await page.waitForTimeout(150);
    }
  };

  const runWizardSteps1to5 = async (name, mission) => {
    await page.fill('#inp-name', name);
    await page.click('button:has-text("CONTINUE →")');
    await page.waitForTimeout(120);
    await page.click('#ss2 button:has-text("CONTINUE →")');
    await page.waitForTimeout(120);
    await page.click('#ss3 button:has-text("CONTINUE →")');
    await page.waitForTimeout(120);
    await page.click('#ss4 button:has-text("CONTINUE →")');
    await page.waitForTimeout(120);
    await page.fill('#inp-mission', mission);
    await page.click('#ss5 button:has-text("CONTINUE →")');
    await page.waitForTimeout(120);
  };

  console.log('\n[EMAIL 1] Fresh load - switcher shows immediately, no forced wizard...');
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  assert(await page.locator('#user-switcher').isVisible(), 'switcher should show on fresh load');
  assert(await page.locator('.add-user-card:has-text("NEW USER")').isVisible(), 'NEW USER card present');
  assert(await page.locator('.add-user-card:has-text("SIGN IN")').isVisible(), 'SIGN IN card present');
  assert((await page.locator('.user-card').count()) === 0, 'no guest cards yet on a fresh device');
  console.log('   OK switcher shown, no guest cards, no forced onboarding');

  console.log('\n[EMAIL 2] Creating an email account via the wizard - NO PIN fields anywhere...');
  await page.click('.add-user-card:has-text("NEW USER")');
  await page.waitForTimeout(200);
  await runWizardSteps1to5('Mansa', 'Ship UPG for real.');
  assert(await page.locator('#ss6').isVisible(), 'step 6 should be visible');
  const activeTab = await page.locator('.provider-tab.active').getAttribute('data-provider');
  assert(activeTab === 'email', 'expected email tab active by default, got ' + activeTab);
  assert(!(await page.locator('#guest-pin-section').isVisible()), 'PIN section must be HIDDEN for email path');

  await page.fill('#inp-email', 'mansa@example.com');
  await page.fill('#inp-password', 'supersecret123');
  await page.click('#create-account-btn');
  await page.waitForTimeout(700);
  assert(await page.locator('#app-shell').isVisible(), 'should land on app-shell after email signup');
  await dismissOnboarding();
  console.log('   OK email account created with zero PIN fields, landed on app-shell');

  console.log('\n[EMAIL 3] Writing real data, confirming it syncs to (mocked) Firestore...');
  await page.evaluate(() => {
    State.setData('testSyncKey', { hello: 'from Mansa', count: 42 });
  });
  await page.waitForTimeout(300);
  const firestoreSnapshot = await page.evaluate(() => localStorage.getItem('__mockfs_data') || '{}');
  const hasSyncedData = firestoreSnapshot.includes('from Mansa');
  assert(hasSyncedData, 'data written locally should have synced through to mock Firestore');
  console.log('   OK local write pushed through to Firestore automatically');

  console.log('\n[EMAIL 4] Simulating a fresh app reopen - should AUTO-LAUNCH, no switcher, no re-login...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert(await page.locator('#app-shell').isVisible(), 'should auto-launch straight into app-shell (stay logged in)');
  assert(!(await page.locator('#user-switcher').isVisible()), 'switcher should NOT show for an already-logged-in email user');
  await dismissOnboarding();
  console.log('   OK stayed logged in automatically across reload - no PIN, no re-entering password');

  console.log('\n[EMAIL 5] Logging out, then SIGN IN on a "new device" restores identity AND data...');
  await page.click('.menu-btn');
  await page.waitForTimeout(150);
  await page.click('#side-panel .side-item:has-text("Log Out")');
  await page.waitForTimeout(400);
  assert(await page.locator('#user-switcher').isVisible(), 'logout should return to switcher');

  await page.evaluate(() => {
    // Simulate a genuinely different device: wipe ALL local app data
    // (lp10_* keys), but leave the mock Firebase "backend" (__mockfb_*,
    // __mockfs_*) untouched - that's the part that would live on
    // Firebase's real servers, not on this device.
    Object.keys(localStorage).filter(k => k.startsWith('lp10_')).forEach(k => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  assert(await page.locator('#user-switcher').isVisible(), 'brand new device should show switcher, not auto-launch');
  assert((await page.locator('.user-card').count()) === 0, 'no guest cards on this "new device"');

  await page.click('.add-user-card:has-text("SIGN IN")');
  await page.waitForTimeout(200);
  assert(await page.locator('#signin-screen').isVisible(), 'sign-in screen should show');
  assert((await page.locator('#signin-pin-0').count()) === 0, 'sign-in must have NO pin fields');
  await page.fill('#signin-email', 'mansa@example.com');
  await page.fill('#signin-password', 'supersecret123');
  await page.click('#signin-btn');
  await page.waitForTimeout(700);
  assert(await page.locator('#app-shell').isVisible(), 'sign-in should succeed and land on app-shell');
  await dismissOnboarding();

  await page.click('.menu-btn');
  await page.waitForTimeout(200);
  const recalledName = (await page.locator('#menu-name').textContent()).trim();
  assert(recalledName === 'Mansa', 'name should be auto-recalled as "Mansa", got "' + recalledName + '"');
  await page.click('.side-overlay');
  await page.waitForTimeout(200);

  const restoredData = await page.evaluate(() => State.data('testSyncKey'));
  assert(restoredData && restoredData.hello === 'from Mansa' && restoredData.count === 42,
    'previous data should be restored on the "new device", got ' + JSON.stringify(restoredData));
  console.log('   OK signed in on a "new device": name recalled AND previous data restored from Firestore');

  console.log('\n[EMAIL 6] Confirming wrong password is rejected...');
  await page.click('.menu-btn');
  await page.waitForTimeout(150);
  await page.click('#side-panel .side-item:has-text("Log Out")');
  await page.waitForTimeout(300);
  await page.click('.add-user-card:has-text("SIGN IN")');
  await page.waitForTimeout(200);
  await page.fill('#signin-email', 'mansa@example.com');
  await page.fill('#signin-password', 'totally-wrong');
  await page.click('#signin-btn');
  await page.waitForTimeout(500);
  assert(await page.locator('#signin-screen').isVisible(), 'wrong password should stay on sign-in screen');
  console.log('   OK wrong password correctly rejected');

  console.log('\n[GUEST 1] Signing back in as Mansa, then creating a GUEST profile alongside...');
  await page.fill('#signin-email', 'mansa@example.com');
  await page.fill('#signin-password', 'supersecret123');
  await page.click('#signin-btn');
  await page.waitForTimeout(700);
  await dismissOnboarding();

  await page.click('.menu-btn');
  await page.waitForTimeout(150);
  await page.click('#side-panel .side-item:has-text("Log Out")');
  await page.waitForTimeout(300);

  await page.click('.add-user-card:has-text("NEW USER")');
  await page.waitForTimeout(200);
  await runWizardSteps1to5('Bola', 'Support the family business.');
  await page.click('.provider-tab[data-provider="guest"]');
  await page.waitForTimeout(150);
  assert(await page.locator('#guest-pin-section').isVisible(), 'PIN section should show for guest path');
  assert(!(await page.locator('#email-fields').isVisible()), 'email fields should hide for guest path');

  const pinInputs = page.locator('#pins-container input');
  await pinInputs.nth(0).fill('13579');
  await pinInputs.nth(1).fill('24680');
  await page.click('#create-account-btn');
  await page.waitForTimeout(700);
  assert(await page.locator('#app-shell').isVisible(), 'guest account should be created and logged in');
  await dismissOnboarding();
  console.log('   OK guest profile "Bola" created with nickname + 2 PINs, no email involved');

  console.log('\n[GUEST 2] Logging out - switcher shows guest card; Mansa the email user does NOT appear...');
  await page.click('.menu-btn');
  await page.waitForTimeout(150);
  await page.click('#side-panel .side-item:has-text("Log Out")');
  await page.waitForTimeout(300);
  assert(await page.locator('#user-switcher').isVisible(), 'should return to switcher');
  const cardNames = await page.locator('.user-card .user-card-name').allTextContents();
  assert(cardNames.includes('Bola'), 'expected Bola in switcher, got: ' + cardNames.join(', '));
  assert(!cardNames.includes('Mansa'), 'email users should NEVER appear as a switcher card');
  console.log('   OK switcher correctly shows only the guest card, not the email account');

  console.log('\n[GUEST 3] Wrong PIN rejected, correct PIN logs in...');
  await page.click('.user-card:has-text("Bola")');
  await page.waitForTimeout(200);
  for (const d of ['0','0','0','0','0']) await page.click('.pin-key:has-text("' + d + '")');
  await page.waitForTimeout(700);
  assert(await page.locator('#pin-login').isVisible(), 'wrong PIN should stay on lock screen');
  for (const d of ['1','3','5','7','9']) await page.click('.pin-key:has-text("' + d + '")');
  await page.waitForTimeout(600);
  assert(await page.locator('#app-shell').isVisible(), 'correct PIN should log Bola in');
  await dismissOnboarding();
  console.log('   OK guest PIN login works correctly (wrong rejected, correct accepted)');

  console.log('\n[GUEST 4] Guest data also syncs to Firestore, under its own uid...');
  await page.evaluate(() => {
    State.setData('guestTestKey', { guest: true, note: 'Bola was here' });
  });
  await page.waitForTimeout(300);
  const fsAfterGuest = await page.evaluate(() => localStorage.getItem('__mockfs_data') || '{}');
  assert(fsAfterGuest.includes('Bola was here'), 'guest data should sync to Firestore too');
  console.log('   OK guest data syncs independently, same as email users');

  console.log('\n[GUEST 5] Adding a second guest with a colliding PIN - must be rejected...');
  await page.click('.menu-btn');
  await page.waitForTimeout(150);
  await page.click('#side-panel .side-item:has-text("Log Out")');
  await page.waitForTimeout(300);
  await page.click('.add-user-card:has-text("NEW USER")');
  await page.waitForTimeout(200);
  await runWizardSteps1to5('Chidi', 'Learn something new.');
  await page.click('.provider-tab[data-provider="guest"]');
  await page.waitForTimeout(150);
  const pinInputs2 = page.locator('#pins-container input');
  await pinInputs2.nth(0).fill('13579');
  await pinInputs2.nth(1).fill('11223');
  await page.click('#create-account-btn');
  await page.waitForTimeout(400);
  assert(await page.locator('#ss6').isVisible(), 'colliding PIN should block creation, staying on step 6');
  console.log('   OK colliding PIN correctly rejected across guests');

  await pinInputs2.nth(0).fill('55555');
  await pinInputs2.nth(1).fill('66666');
  await page.click('#create-account-btn');
  await page.waitForTimeout(700);
  assert(await page.locator('#app-shell').isVisible(), 'second guest should be created with non-colliding PINs');
  await dismissOnboarding();
  console.log('   OK second guest "Chidi" created successfully with different PINs');

  console.log('\n[GUEST 6] Both guests coexist in the switcher and each PIN opens the right person...');
  await page.click('.menu-btn');
  await page.waitForTimeout(150);
  await page.click('#side-panel .side-item:has-text("Log Out")');
  await page.waitForTimeout(300);
  const allCardNames = await page.locator('.user-card .user-card-name').allTextContents();
  assert(allCardNames.includes('Bola') && allCardNames.includes('Chidi'),
    'expected both Bola and Chidi, got: ' + allCardNames.join(', '));

  await page.click('.user-card:has-text("Chidi")');
  await page.waitForTimeout(200);
  for (const d of ['5','5','5','5','5']) await page.click('.pin-key:has-text("' + d + '")');
  await page.waitForTimeout(600);
  assert(await page.locator('#app-shell').isVisible(), "Chidi's PIN should log Chidi in");
  await page.click('.menu-btn');
  await page.waitForTimeout(200);
  const chidiName = (await page.locator('#menu-name').textContent()).trim();
  assert(chidiName === 'Chidi', 'expected Chidi logged in, got "' + chidiName + '"');
  console.log('   OK multiple guests coexist correctly, each PIN opens the right identity');

  console.log('\n[FINAL] Checking for any console/page errors across the ENTIRE flow...');
  const realErrors = consoleErrors.filter(e =>
    !e.includes('manifest') && !e.includes('favicon') &&
    !e.includes('fonts.googleapis.com') && !e.includes('403'));
  if (realErrors.length) {
    console.log('   Errors found:');
    realErrors.forEach(e => console.log('     - ' + e));
  } else {
    console.log('   OK zero console/page errors across the entire email + guest flow');
  }

  await browser.close();
  appServer.close();

  if (realErrors.length) process.exit(1);
  console.log('\nALL E2E CHECKS PASSED');
}

main().catch(e => { console.error('E2E TEST FAILED:', e.message); process.exit(1); });
