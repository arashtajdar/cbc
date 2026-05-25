const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Explicitly ensure hardware acceleration for WebGL / Three.js rendering
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    center: true,
    backgroundColor: '#1a1a2e',
    frame: false, // Frame-less to match the studio theme
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webgl: true // Ensure WebGL is enabled in the window
    }
  });

  // Load the central entry asset file
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // Re-instantiate the window if the application is active but no windows are currently open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit the application process safely unless running on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler to exit application from the UI
ipcMain.on('quit-app', () => {
  app.quit();
});
