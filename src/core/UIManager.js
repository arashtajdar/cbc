import { launcherState, saveLauncherState, minigamesRegistry } from "./LauncherState.js";
import { SceneManager } from "./SceneManager.js";
import { initCharPreviews, buildPlayerPreviews, playerPreviews, stopPlayerPreviewsAnimation } from "../components/PreviewRenderer.js";

// --- 4. STATE MACHINE TRANSITIONS & UI BUILDERS ---

/**
 * Populates minigame cards dynamically and connects event listeners
 */
export function setupLauncherDOM() {
    const grid = document.getElementById('launcher-games-grid');
    if (!grid) return;

    grid.innerHTML = '';
    minigamesRegistry.forEach(game => {
        const card = document.createElement('div');
        const isActive = game.status === 'Active' || game.status === 'Active/Ready to Play';
        card.className = `game-card ${isActive ? 'active-card' : 'locked-card'}`;
        card.setAttribute('data-id', game.id);

        card.innerHTML = `
            <div>
                <div class="grid-icon-wrapper">
                    <div class="card-icon ${game.id}-icon" style="width: 100%; height: 100%;"></div>
                </div>
                <h3 class="game-card-title">${game.name}</h3>
                <p class="game-card-desc">${game.description}</p>
            </div>
            <div class="game-card-status ${isActive ? 'status-ready' : 'status-locked'}">
                ${isActive ? 'Ready to Play' : 'Locked'}
            </div>
        `;

        if (isActive) {
            card.addEventListener('click', () => {
                selectMinigame(game.id);
            });
        } else {
            card.addEventListener('click', () => {
                showLockedModal();
            });
        }

        grid.appendChild(card);
    });

    // Wire settings control options
    const shadowsToggle = document.getElementById('setting-shadows');
    if (shadowsToggle) {
        shadowsToggle.addEventListener('change', e => {
            const enabled = e.target.checked;
            SceneManager.renderer.shadowMap.enabled = enabled;
            SceneManager.scene.traverse(child => {
                if (child.material) child.material.needsUpdate = true;
            });
            console.log(`Settings: Shadows ${enabled ? 'Enabled' : 'Disabled'}`);
        });
    }

    const volumeSlider = document.getElementById('setting-volume');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', e => {
            console.log(`Settings: Volume set to ${e.target.value}%`);
        });
    }

    const difficultySelect = document.getElementById('setting-difficulty');
    if (difficultySelect) {
        if (launcherState && launcherState.aiDifficulty) {
            difficultySelect.value = launcherState.aiDifficulty;
        }
        difficultySelect.addEventListener('change', e => {
            if (launcherState) {
                launcherState.aiDifficulty = e.target.value;
                if (typeof saveLauncherState === 'function') {
                    saveLauncherState();
                }
                console.log(`Settings: AI Difficulty set to ${e.target.value}`);
            }
        });
    }
}

/**
 * Shows the locked minigame modal with brand requirements
 */
export function showLockedModal() {
    const modal = document.getElementById('locked-modal');
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Closes the locked minigame modal
 */
export function closeLockedModal() {
    const modal = document.getElementById('locked-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Opens settings modal overlay
 */
export function toggleSettingsModal(open) {
    const settings = document.getElementById('settings-overlay');
    if (settings) {
        if (open) {
            settings.classList.add('active');
        } else {
            settings.classList.remove('active');
        }
    }
}

/**
 * Handles ready game card clicks, transitioning to character select
 */
export function selectMinigame(gameId) {
    launcherState.selectedGame = gameId;
    transitionToState('CHAR_SELECT');
}

export function selectCharacterForPlayer1(charIdx) {
    if (launcherState.p1LockedIn) return;

    const state = launcherState;
    state.playerAssignments.p1 = charIdx;

    updateCharacterSelectionUI();
    buildPlayerPreviews();
    saveLauncherState();
}

export function lockInPlayer1 () {
    const state = launcherState;
    if (state.p1LockedIn) {
        transitionToState('ARENA_SELECT');
        return;
    }

    state.p1LockedIn = true;

    const charIdx = state.playerAssignments.p1;
    const allIdx = [0, 1, 2, 3];
    const available = allIdx.filter(idx => idx !== charIdx);

    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }

    state.playerAssignments.p2 = available[0];
    state.playerAssignments.p3 = available[1];
    state.playerAssignments.p4 = available[2];

    updateCharacterSelectionUI();
    buildPlayerPreviews();
    saveLauncherState();

    const btn = document.getElementById('btn-lockin-continue');
    if (btn) btn.innerHTML = 'Continue to Arena ▶';
};

/**
 * Cycles Player 1's selection vertically (Up / Down)
 */
export function cyclePlayer1Character(direction) {
    if (launcherState.p1LockedIn) return;
    const state = launcherState;
    const currentIdx = state.playerAssignments.p1;
    const newIdx = currentIdx + direction;
    if (newIdx >= 0 && newIdx < state.characters.length) {
        selectCharacterForPlayer1(newIdx);
    }
}

/**
 * Updates UI slot cards' labels and border glow states
 */
export function updateCharacterSelectionUI() {
    const state = launcherState;
    const players = ['p1', 'p2', 'p3', 'p4'];

    players.forEach(pKey => {
        if (pKey !== 'p1' && !state.p1LockedIn) {
            const cardEl = document.getElementById(`slot-card-${pKey}`);
            if (cardEl) {
                cardEl.className = 'slot-card';
                const headerEl = cardEl.querySelector('.slot-header');
                if (headerEl) {
                    headerEl.style.color = '#555555';
                    headerEl.style.textShadow = 'none';
                }
            }
            const listEl = document.getElementById(`${pKey}-char-list`);
            if (listEl) {
                let overlay = listEl.querySelector('.char-items-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'char-items-overlay';
                    listEl.appendChild(overlay);
                }
                overlay.innerHTML =
                    '<div class="char-item" style="color:#555555; text-align:center; padding-top:80px; font-size: 0.8rem; letter-spacing: 2px;">WAITING...</div>';
            }
            return;
        }

        const charIdx = state.playerAssignments[pKey];
        const charData = state.characters[charIdx];

        const cardEl = document.getElementById(`slot-card-${pKey}`);
        if (cardEl) {
            cardEl.className = 'slot-card'; // Reset
            cardEl.classList.add(`glow-${charData.shape}`);
        }

        const headerEl = cardEl ? cardEl.querySelector('.slot-header') : null;
        if (headerEl) {
            headerEl.style.color = charData.hex;
            headerEl.style.textShadow = `0 0 10px ${charData.hex}`;
        }

        const listEl = document.getElementById(`${pKey}-char-list`);
        if (listEl) {
            let overlay = listEl.querySelector('.char-items-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'char-items-overlay';
                listEl.appendChild(overlay);
            }

            overlay.innerHTML = '';
            const numChars = state.characters.length;
            const prevIdx = charIdx - 1;
            const nextIdx = charIdx + 1;
            const displayIndices = [prevIdx, charIdx, nextIdx].filter(i => i >= 0 && i < numChars);

            displayIndices.forEach(cIdx => {
                const char = state.characters[cIdx];
                const charItem = document.createElement('div');
                charItem.className = `char-item char-${char.id}`;
                if (charIdx === cIdx) {
                    charItem.classList.add('selected');
                }
                charItem.textContent = char.name;

                if (pKey === 'p1') {
                    charItem.addEventListener('click', () => {
                        selectCharacterForPlayer1(cIdx);
                    });
                }

                overlay.appendChild(charItem);
            });
        }
    });
}

/**
 * Transitions between launcher screens, manages Three.js background scene overlays, and toggles HUDs
 */
export function transitionToState(state) {
    console.log(`Transitioning to state: ${state}`);
    launcherState.currentState = state;

    const splash = document.getElementById('splash-screen');
    const mainMenu = document.getElementById('main-menu-screen');
    const gameSelect = document.getElementById('game-selection-screen');
    const charSelect = document.getElementById('char-selection-screen');
    const arenaSelect = document.getElementById('arena-selection-screen');
    const settings = document.getElementById('settings-overlay');
    const canvasContainer = document.getElementById('canvas-container');

    // Deactivate all overlay screens
    [splash, mainMenu, gameSelect, charSelect, arenaSelect].forEach(el => {
        if (el) el.classList.remove('active');
    });

    // Close settings on state transition
    if (settings) {
        settings.classList.remove('active');
    }

    // Hide gameplay HUDs by default
    const gameplayHUDs = document.querySelectorAll('.hud');
    gameplayHUDs.forEach(hud => {
        hud.style.display = 'none';
    });

    // Stop mini character preview loop if transitioning away from selection screen
    if (state !== 'CHAR_SELECT') {
        stopPlayerPreviewsAnimation();
        const players = ['p1', 'p2', 'p3', 'p4'];
        players.forEach(pKey => {
            const preview = playerPreviews[pKey];
            if (preview && preview.renderer) {
                const container = document.getElementById(`${pKey}-char-list`);
                if (container) container.innerHTML = '';
                preview.renderer.dispose();
                preview.renderer = null;
            }
            if (preview) {
                preview.scene = null;
                preview.camera = null;
                preview.meshes = [];
                preview.group = null;
            }
        });
    }

    // Manage screen behaviors
    if (state === 'SPLASH') {
        if (splash) splash.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '0';
        }

        // Auto-fadeout after 2.5 seconds
        setTimeout(() => {
            if (launcherState.currentState === 'SPLASH') {
                transitionToState('MAIN_MENU');
            }
        }, 2500);
    } else if (state === 'MAIN_MENU') {
        if (mainMenu) mainMenu.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '1';
            canvasContainer.style.transition = 'opacity 0.6s ease';
        }

        // Ensure default environment is active
        if (!SceneManager.activeGameInstance && !SceneManager.entities.player) {
            SceneManager.restoreSceneEnvironment();
        }
    } else if (state === 'GAME_SELECT') {
        if (gameSelect) gameSelect.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '0.5'; // Dim for readability
        }
    } else if (state === 'CHAR_SELECT') {
        if (charSelect) charSelect.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '0.25'; // De-emphasize
        }
        launcherState.p1LockedIn = false;
        const btn = document.getElementById('btn-lockin-continue');
        if (btn) btn.innerHTML = 'Lock In Champion';
        initCharPreviews();
        selectCharacterForPlayer1(launcherState.playerAssignments.p1);
    } else if (state === 'ARENA_SELECT') {
        if (arenaSelect) arenaSelect.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '0.25'; // De-emphasize
        }
        if (typeof renderArenaSelectionGrid === 'function') {
            renderArenaSelectionGrid();
        }
    } else if (state === 'GAMEPLAY') {
        if (canvasContainer) {
            canvasContainer.style.opacity = '1';
        }
        launchSelectedMatch();
    }

    if (typeof saveLauncherState === 'function') {
        saveLauncherState();
    }
}



/**
 * Start Match: initializes game classes, clears launcher UI overlays, shows HUDs, and overrides custom colors
 */

export function launchSelectedMatch() {
    const gameId = launcherState.selectedGame;
    console.log("Starting match:", gameId);

    const overlays = ["splash-screen", "main-menu-screen", "game-selection-screen", "char-selection-screen", "settings-overlay"];
    overlays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("active");
    });

    const gameOverOverlay = document.getElementById("game-over-overlay");
    if (gameOverOverlay) gameOverOverlay.remove();

    const ballistixHud = document.querySelector(".score-container");
    const ballistixControls = document.querySelector(".control-panel");
    const headerHud = document.querySelector("header.hud");
    const instructionsHud = document.querySelector(".instructions.hud");
    const statsHud = document.querySelector(".stats-panel.hud");
    const bottomExitBtn = document.getElementById("bottom-exit-btn");

    if (headerHud) headerHud.style.display = "flex";
    if (instructionsHud) instructionsHud.style.display = "block";
    if (statsHud) statsHud.style.display = "flex";
    if (bottomExitBtn) bottomExitBtn.style.display = "block";

    const p1Char = launcherState.characters[launcherState.playerAssignments.p1];
    const p2Char = launcherState.characters[launcherState.playerAssignments.p2];
    const p3Char = launcherState.characters[launcherState.playerAssignments.p3];
    const p4Char = launcherState.characters[launcherState.playerAssignments.p4];

    const lifePlayer = document.getElementById("life-player");
    const lifeValPlayer = document.getElementById("life-val-player");
    if (lifePlayer && lifeValPlayer) {
        lifePlayer.style.color = p1Char.hex;
        lifeValPlayer.style.textShadow = "0 0 12px " + p1Char.hex + "80";
    }

    // Pass to SceneManager
    SceneManager.mountGame(gameId);
}

export function exitToLauncher() {
    const confirmed = window.confirm("Exit to launcher? Your current match will be lost.");
    if (!confirmed) return;

    if (SceneManager.activeGameInstance) {
        try { SceneManager.activeGameInstance.destroy(); } catch (e) {}
        SceneManager.activeGameInstance = null;
    }
    SceneManager.updateCallbacks = [];
    const gameOverOverlay = document.getElementById("game-over-overlay");
    if (gameOverOverlay) gameOverOverlay.remove();
    const exitBtn = document.getElementById("bottom-exit-btn");
    if (exitBtn) exitBtn.style.display = "none";
    SceneManager.restoreSceneEnvironment();
    transitionToState("GAME_SELECT");
}

export function renderArenaSelectionGrid() {
    const grid = document.getElementById("arena-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const gameDef = minigamesRegistry.find(g => g.id === launcherState.selectedGame);
    if (!gameDef || !gameDef.arenas) return;
    launcherState.selectedArena = gameDef.arenas[0];
    gameDef.arenas.forEach(arena => {
        const card = document.createElement("div");
        card.className = "game-card";
        card.style.height = "180px";
        card.innerHTML = "<div class=\"card-content\" style=\"padding: 10px;\"><h3 class=\"card-title\">" + arena + "</h3></div>";
        card.addEventListener("click", () => {
            selectArena(arena);
            document.querySelectorAll("#arena-grid .game-card").forEach(c => c.style.border = "1px solid rgba(255, 255, 255, 0.1)");
            card.style.border = "2px solid var(--accent-blue)";
        });
        if (arena === launcherState.selectedArena) card.style.border = "2px solid var(--accent-blue)";
        grid.appendChild(card);
    });
}

export function selectArena(arena) {
    launcherState.selectedArena = arena;
    saveLauncherState();
}

window.addEventListener("keydown", e => {
    if (launcherState && launcherState.currentState === "CHAR_SELECT") {
        if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
            cyclePlayer1Character(-1);
            e.preventDefault();
        } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
            cyclePlayer1Character(1);
            e.preventDefault();
        }
    }
});
