
import { SceneManager } from "./core/SceneManager.js";
import { setupLauncherDOM, transitionToState, toggleSettingsModal, exitToLauncher, closeLockedModal, cyclePlayer1Character, lockInPlayer1 } from "./core/UIManager.js";

// Initialize SceneManager
SceneManager.init();

// Wait for DOM to be ready, then attach listeners
document.addEventListener("DOMContentLoaded", () => {
    // Menu buttons
    const btnPlayArena = document.getElementById("btn-play-arena");
    if (btnPlayArena) btnPlayArena.addEventListener("click", () => transitionToState("GAME_SELECT"));

    const btnOpenSettings = document.getElementById("btn-open-settings");
    if (btnOpenSettings) btnOpenSettings.addEventListener("click", () => toggleSettingsModal(true));

    const btnCloseSettings = document.getElementById("btn-close-settings");
    if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => toggleSettingsModal(false));

    const btnBackMainMenu = document.getElementById("btn-back-main-menu");
    if (btnBackMainMenu) btnBackMainMenu.addEventListener("click", () => transitionToState("MAIN_MENU"));

    const btnCloseLocked = document.getElementById("btn-close-locked");
    if (btnCloseLocked) btnCloseLocked.addEventListener("click", () => closeLockedModal());

    const lockedModal = document.getElementById("locked-modal");
    if (lockedModal) lockedModal.addEventListener("click", () => closeLockedModal());

    const lockedModalContent = document.querySelector(".locked-modal-content");
    if (lockedModalContent) lockedModalContent.addEventListener("click", (e) => e.stopPropagation());

    const btnCyclePrev = document.getElementById("btn-cycle-prev");
    if (btnCyclePrev) btnCyclePrev.addEventListener("click", () => cyclePlayer1Character(-1));

    const btnCycleNext = document.getElementById("btn-cycle-next");
    if (btnCycleNext) btnCycleNext.addEventListener("click", () => cyclePlayer1Character(1));

    const btnBackGameSelect = document.getElementById("btn-back-game-select");
    if (btnBackGameSelect) btnBackGameSelect.addEventListener("click", () => transitionToState("GAME_SELECT"));

    const btnLockinContinue = document.getElementById("btn-lockin-continue");
    if (btnLockinContinue) btnLockinContinue.addEventListener("click", () => lockInPlayer1());

    const btnBackCharSelect = document.getElementById("btn-back-char-select");
    if (btnBackCharSelect) btnBackCharSelect.addEventListener("click", () => transitionToState("CHAR_SELECT"));

    const btnStartMatch = document.getElementById("btn-start-match");
    if (btnStartMatch) btnStartMatch.addEventListener("click", () => transitionToState("GAMEPLAY"));

    const bottomExitBtn = document.getElementById("bottom-exit-btn");
    if (bottomExitBtn) bottomExitBtn.addEventListener("click", () => exitToLauncher());

    const exitBtn = document.getElementById("exit-btn");
    if (exitBtn) exitBtn.addEventListener("click", () => {
        if (window.electronAPI) {
            window.electronAPI.quitApp();
        }
    });
});

