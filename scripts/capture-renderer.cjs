const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#0d0b12',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      mkdirSync(path.resolve('.tmp'), { recursive: true });
      const image = await window.webContents.capturePage();
      writeFileSync(path.resolve('.tmp/renderer.png'), image.toPNG());
      app.quit();
    }, 900);
  });
  window.loadFile(path.resolve('apps/renderer/dist/index.html'));
});
