'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {setupUpdates, RELEASES_URL} = require('../src/update.cjs');

function harness({platform = 'win32', packaged = true, check = async () => ({})} = {}) {
  const handlers = {}, sent = [], dialogs = [], opened = [], cleared = [];
  let installed = false, scheduled = null, repeated = null, calls = 0;
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: true,
    on(name, fn) { handlers[name] = fn; },
    async checkForUpdates() { calls++; return check(); },
    quitAndInstall() { installed = true; },
  };
  const dialog = {
    showMessageBox: async (...args) => {
      dialogs.push(args.at(-1));
      return {response: 1};
    },
  };
  const shell = {openExternal: async url => opened.push(url)};
  const updater = setupUpdates({
    autoUpdater,
    app: {isPackaged: packaged},
    send: state => sent.push(state),
    dialog,
    shell,
    getWindow: () => null,
    platform,
    schedule: fn => { scheduled = fn; return 1; },
    interval: fn => { repeated = fn; return 2; },
    cancelTimeout: id => cleared.push(['timeout', id]),
    cancelInterval: id => cleared.push(['interval', id]),
  });
  return {
    updater, handlers, sent, dialogs, opened, autoUpdater, cleared,
    installed: () => installed,
    calls: () => calls,
    runScheduled: () => scheduled(),
    runRepeated: () => repeated(),
  };
}

test('updater enables background download, install on quit and periodic checks', () => {
  const h = harness();
  assert.equal(h.autoUpdater.autoDownload, true);
  assert.equal(h.autoUpdater.autoInstallOnAppQuit, true);
  assert.equal(h.autoUpdater.allowPrerelease, false);
  assert.equal(typeof h.runScheduled, 'function');
  assert.equal(typeof h.runRepeated, 'function');
  h.updater.stop();
  assert.deepEqual(h.cleared, [['timeout', 1], ['interval', 2]]);
});

test('unpackaged apps do not initialize the updater', () => {
  assert.equal(setupUpdates({autoUpdater: {}, app: {isPackaged: false}}), null);
});

test('available update announces background download', () => {
  const h = harness();
  h.handlers['update-available']({version: '0.3.1'});
  assert.deepEqual(h.sent.at(-1), {text: '发现新版本 0.3.1，正在后台下载。'});
});

test('manual check reports the latest version once', async () => {
  const h = harness();
  h.autoUpdater.checkForUpdates = async () => {
    h.handlers['update-not-available']({version: '0.3.0'});
    return null;
  };
  await h.updater.check(true);
  assert.deepEqual(h.sent, [{text: '已经是最新版本。'}]);
});

test('downloaded update installs immediately when confirmed', async () => {
  const h = harness();
  await h.handlers['update-downloaded']({version: '0.3.1'});
  assert.equal(h.dialogs.length, 1);
  assert.equal(h.dialogs[0].message, 'Corgi IME 0.3.1 已下载完成。');
  assert.equal(h.installed(), true);
});

test('manual macOS update failure opens the release page', async () => {
  const h = harness({platform: 'darwin', check: async () => { throw Error('signature required'); }});
  await h.updater.check(true);
  assert.equal(h.dialogs.length, 1);
  assert.deepEqual(h.opened, [RELEASES_URL]);
  assert.equal(h.sent.length, 0);
});

test('manual Windows update failure reports a retryable error', async () => {
  const h = harness({platform: 'win32', check: async () => { throw Error('network'); }});
  await h.updater.check(true);
  assert.equal(h.dialogs.length, 0);
  assert.deepEqual(h.sent.at(-1), {text: '检查更新失败，请稍后再试。'});
});
