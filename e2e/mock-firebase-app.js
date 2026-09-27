const _apps = new Map();

export function initializeApp(config, name) {
  const appName = name || '[DEFAULT]'; // matches real Firebase's default app naming
  if (_apps.has(appName)) return _apps.get(appName);
  const app = { name: appName, config };
  _apps.set(appName, app);
  return app;
}

export function getApp(name) {
  const appName = name || '[DEFAULT]';
  if (!_apps.has(appName)) {
    const err = new Error(`Firebase: No Firebase App '${appName}' created`);
    err.code = 'app/no-app';
    throw err;
  }
  return _apps.get(appName);
}
