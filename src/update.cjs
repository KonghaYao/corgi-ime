'use strict';

const RELEASES_URL = 'https://github.com/KonghaYao/corgi-ime/releases/latest';

function setupUpdates({
  autoUpdater,
  app,
  send,
  dialog,
  shell,
  getWindow = () => null,
  platform = process.platform,
  schedule = setTimeout,
  interval = setInterval,
  cancelTimeout = clearTimeout,
  cancelInterval = clearInterval,
} = {}) {
  if (!autoUpdater || !app?.isPackaged) return null;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  let manual = false;
  let errorHandled = false;

  const notify = text => send?.({ text });

  async function showReleasePage() {
    if (!dialog || !shell) return;
    try {
      const options = {
        type: 'warning',
        buttons: ['稍后', '打开下载页'],
        defaultId: 1,
        cancelId: 0,
        title: '自动更新不可用',
        message: 'macOS 自动更新需要签名版本。',
        detail: '当前版本没有 Developer ID 签名，自动安装会被系统拒绝。请前往 GitHub Releases 下载最新版本。',
      };
      const win = getWindow();
      const result = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options);
      if (result.response === 1) await shell.openExternal(RELEASES_URL);
    } catch {}
  }

  async function handleError(error, fromManual) {
    console.error('[updater]', error?.message || error);
    if (fromManual && !errorHandled) {
      errorHandled = true;
      if (platform === 'darwin') await showReleasePage();
      else notify('检查更新失败，请稍后再试。');
    }
    manual = false;
  }

  autoUpdater.on('update-available', info => {
    notify(`发现新版本 ${info.version}，正在后台下载。`);
  });

  autoUpdater.on('update-not-available', () => {
    if (manual) notify('已经是最新版本。');
    manual = false;
  });

  autoUpdater.on('error', error => {
    handleError(error, manual);
  });

  autoUpdater.on('update-downloaded', async info => {
    const options = {
      type: 'info',
      buttons: ['稍后', '立即重启'],
      defaultId: 1,
      cancelId: 0,
      title: '更新已下载',
      message: `Corgi IME ${info.version} 已下载完成。`,
      detail: '立即重启会安装新版本；选择稍后则在退出应用时安装。',
    };
    try {
      const win = getWindow();
      const result = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options);
      if (result.response === 1) autoUpdater.quitAndInstall();
    } catch (error) {
      console.error('[updater]', error?.message || error);
    } finally {
      manual = false;
    }
  });

  async function check(isManual = false) {
    manual = isManual;
    errorHandled = false;
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result && isManual && manual) notify('已经是最新版本。');
    } catch (error) {
      await handleError(error, isManual);
    }
  }

  const initialTimer = schedule(() => check(false), 10000);
  const timer = interval(() => check(false), 6 * 60 * 60 * 1000);

  return {
    check,
    stop() {
      cancelTimeout(initialTimer);
      cancelInterval(timer);
    },
  };
}

module.exports = { setupUpdates, RELEASES_URL };
