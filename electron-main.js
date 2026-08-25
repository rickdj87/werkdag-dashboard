const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require('electron');
const { fork } = require('child_process');
const path = require('path');

const PORT = 8888;
let mainWindow;
let tray;
let serverProcess;

// ─── Server starten als child process ────────────────────
function startServer() {
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    env: { ...process.env, ELECTRON: '1' },
  });
  serverProcess.on('error', err => console.error('[Server] Fout:', err));
}

// ─── Browservenster maken ─────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Werkdag Dashboard',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Wacht even tot de server klaar is
  setTimeout(() => {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }, 800);

  // Externe links in browser openen, niet in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Tray-icoon (Mac menu bar) ────────────────────────────
function createTray() {
  // Klein leeg icoon (16x16 transparant)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Werkdag Dashboard');

  const menu = Menu.buildFromTemplate([
    { label: 'Dashboard openen', click: () => {
      if (mainWindow) mainWindow.focus();
      else createWindow();
    }},
    { label: 'Instellingen', click: () => {
      if (mainWindow) mainWindow.loadURL(`http://localhost:${PORT}/setup`);
      else createWindow();
    }},
    { type: 'separator' },
    {
      label: 'Starten bij inloggen',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    { type: 'separator' },
    { label: 'Stoppen', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow) mainWindow.focus();
    else createWindow();
  });
}

// ─── App events ───────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  createWindow();
  createTray();

  // Blijf actief als venster gesloten is (tray blijft staan)
  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Niet afsluiten — blijf in tray staan (Mac-conventie)
  // app.quit() weglaten zodat de app in de menubalk blijft
});

app.on('quit', () => {
  if (serverProcess) serverProcess.kill();
});
