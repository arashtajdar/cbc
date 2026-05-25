# 🎮 4OUT Arena: Windows Build & Packaging Guide

This guide details how to install the required development tools, build the project assets, and compile the **4OUT: Arena Arcade Launcher** into a standalone installer (`.exe`) for Windows.

---

## 🛠️ Step 1: Install System Prerequisites
Before compiling, ensure you have the following installed on your Windows machine:
1. **Node.js** (v18.x or v20.x recommended): Download from [nodejs.org](https://nodejs.org/).
2. **Git** (optional, for code management).

---

## 📦 Step 2: Install Project Dependencies
To bundle and pack the application, you need to install the project dependencies (including Electron and `electron-builder` as configured in `package.json`):

1. Open your terminal (PowerShell or Command Prompt).
2. Navigate to the project root directory:
   ```powershell
   cd c:\Projects\cbc
   ```
3. Run the installation command:
   ```powershell
   npm install
   ```

This command reads `package.json` and creates a local `node_modules` folder containing the necessary build engines.

---

## 🚀 Step 3: Run the Application Locally (Development Mode)
Before compiling the game into a installer, test that the game launches and executes with the native window adjustments (including hardware acceleration and the working **Exit Game** button):

```powershell
npm start
```

---

## 🏗️ Step 4: Package and Build the Windows Installer
We configured `electron-builder` with an NSIS Target. This packages your entire application logic, styles, and assets into a single setup wizard.

To create the installer, run:
```powershell
npm run dist
```

### What happens during this build:
* **Source Compiling:** `electron-builder` packages files listed in `package.json` (`main.js`, `preload.js`, `index.html`, `/css`, `/js`, and `/assets`).
* **NSIS Compiler:** It compiles a client-ready installer `4OUT Arena Setup 1.0.0.exe`.
* **Output Location:** Once finished, you will find the final setup executables in the newly created `./dist/` directory.

---

## 🔧 Target Configuration Details
Here is how `electron-builder` is customized inside your [package.json](file:///c:/Projects/cbc/package.json):

* **`appId`**: Unique identifier (`com.mojargames.arcade`).
* **`productName`**: Sets the display name on the desktop shortcut and start menu (`4OUT Arena`).
* **`nsis` configuration**:
  * `oneClick: false`: Ensures the user can customize installation properties (e.g. installation folder path).
  * `createDesktopShortcut: true`: Automatically creates a desktop icon.
  * `createStartMenuShortcut: true`: Places the game in the Windows Start Menu.

---

## ⚡ WebGL & Hardware Acceleration Verification
To verify hardware acceleration is fully working in your built application:
1. Open the game window.
2. Open the dev tools (press `Ctrl+Shift+I` or standard command if dev tools are enabled).
3. Type `chrome://gpu` in the URL/console or check the **Stats HUD** in-game which monitors `WebGL2 / PCFSoftShadows` rendering performance. The application has been configured with `webgl: true` and gpu-rasterization flags enabled to bypass restrictions on older Windows graphics cards.
