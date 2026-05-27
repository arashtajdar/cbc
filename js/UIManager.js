// --- 4. STATE MACHINE TRANSITIONS & UI BUILDERS ---

const minigamesRegistry = window.minigamesRegistry;
const engine = window.engine;

/**
 * Populates minigame cards dynamically and connects event listeners
 */
function setupLauncherDOM() {
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
            engine.renderer.shadowMap.enabled = enabled;
            engine.scene.traverse(child => {
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
}

/**
 * Shows the locked minigame modal with brand requirements
 */
function showLockedModal() {
    const modal = document.getElementById('locked-modal');
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Closes the locked minigame modal
 */
function closeLockedModal() {
    const modal = document.getElementById('locked-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Opens settings modal overlay
 */
function toggleSettingsModal(open) {
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
function selectMinigame(gameId) {
    window.launcherState.selectedGame = gameId;
    transitionToState('CHAR_SELECT');
}

function selectCharacterForPlayer1(charIdx) {
    if (window.launcherState.p1LockedIn) return;

    const state = window.launcherState;
    state.playerAssignments.p1 = charIdx;

    updateCharacterSelectionUI();
    window.buildPlayerPreviews();
    window.saveLauncherState();
}

window.lockInPlayer1 = function () {
    const state = window.launcherState;
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
    window.buildPlayerPreviews();
    window.saveLauncherState();

    const btn = document.getElementById('btn-lockin-continue');
    if (btn) btn.innerHTML = 'Continue to Arena ▶';
};

/**
 * Cycles Player 1's selection vertically (Up / Down)
 */
function cyclePlayer1Character(direction) {
    if (window.launcherState.p1LockedIn) return;
    const state = window.launcherState;
    const currentIdx = state.playerAssignments.p1;
    const newIdx = currentIdx + direction;
    if (newIdx >= 0 && newIdx < state.characters.length) {
        selectCharacterForPlayer1(newIdx);
    }
}

/**
 * Updates UI slot cards' labels and border glow states
 */
function updateCharacterSelectionUI() {
    const state = window.launcherState;
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
function transitionToState(state) {
    console.log(`Transitioning to state: ${state}`);
    window.launcherState.currentState = state;

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
        if (window.playerPreviewsAnimationFrame) {
            cancelAnimationFrame(window.playerPreviewsAnimationFrame);
            window.playerPreviewsAnimationFrame = null;
        }
        const players = ['p1', 'p2', 'p3', 'p4'];
        players.forEach(pKey => {
            const preview = window.playerPreviews[pKey];
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
            if (window.launcherState.currentState === 'SPLASH') {
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
        if (!window.activeGame && !engine.entities.player) {
            window.restoreSceneEnvironment();
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
        window.launcherState.p1LockedIn = false;
        const btn = document.getElementById('btn-lockin-continue');
        if (btn) btn.innerHTML = 'Lock In Champion';
        window.initCharPreviews();
        selectCharacterForPlayer1(window.launcherState.playerAssignments.p1);
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

    if (typeof window.saveLauncherState === 'function') {
        window.saveLauncherState();
    }
}

window.saveLauncherState = function () {
    if (typeof localStorage !== 'undefined') {
        try {
            const stateToSave = {
                currentState: window.launcherState.currentState,
                selectedGame: window.launcherState.selectedGame,
                selectedArena: window.launcherState.selectedArena,
                playerAssignments: window.launcherState.playerAssignments
            };
            localStorage.setItem('launcherState', JSON.stringify(stateToSave));
        } catch (e) {
            console.warn('Could not save state', e);
        }
    }
};

/**
 * Start Match: initializes game classes, clears launcher UI overlays, shows HUDs, and overrides custom colors
 */
function launchSelectedMatch() {
    const gameId = window.launcherState.selectedGame;
    console.log(`Starting match: ${gameId}`);

    // Remove active overlays
    const overlays = [
        'splash-screen',
        'main-menu-screen',
        'game-selection-screen',
        'char-selection-screen',
        'settings-overlay'
    ];
    overlays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    // Clear background environment first
    window.removeSceneEnvironment();

    // Destroy active game if any
    if (window.activeGame) {
        try {
            window.activeGame.destroy();
        } catch (e) {
            console.error('Error cleaning up active game:', e);
        }
        window.activeGame = null;
    }

    // Reset callbacks
    window.engine.updateCallbacks = [];

    // Clear game over modal if leftover
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) gameOverOverlay.remove();

    // Show launcher HUDs
    const ballistixHud = document.querySelector('.score-container');
    const ballistixControls = document.querySelector('.control-panel');
    const headerHud = document.querySelector('header.hud');
    const instructionsHud = document.querySelector('.instructions.hud');
    const statsHud = document.querySelector('.stats-panel.hud');
    const bottomExitBtn = document.getElementById('bottom-exit-btn');

    if (headerHud) headerHud.style.display = 'flex';
    if (instructionsHud) instructionsHud.style.display = 'block';
    if (statsHud) statsHud.style.display = 'flex';
    if (bottomExitBtn) bottomExitBtn.style.display = 'block';

    const titleEl = document.getElementById('engine-title');
    const btnDeflecto = document.getElementById('btn-play-deflecto');
    const btnTileFall = document.getElementById('btn-play-tilefall');
    const btnBoxBrawl = document.getElementById('btn-play-boxbrawl');
    const btnSlideOut = document.getElementById('btn-play-slideout');
    const btnBounceClaim = document.getElementById('btn-play-bounceclaim');
    const btnRicochet = document.getElementById('btn-play-ricochet');
    const btnKineticRing = document.getElementById('btn-play-kineticring');
    const btnHexCollapse = document.getElementById('btn-play-hexcollapse');
    const btnShrinkZone = document.getElementById('btn-play-shrinkzone');
    const btnSweeper = document.getElementById('btn-play-sweeper');

    // Fetch Player character choices to apply colors dynamically
    const p1Char = window.launcherState.characters[window.launcherState.playerAssignments.p1];
    const p2Char = window.launcherState.characters[window.launcherState.playerAssignments.p2];
    const p3Char = window.launcherState.characters[window.launcherState.playerAssignments.p3];
    const p4Char = window.launcherState.characters[window.launcherState.playerAssignments.p4];

    // Update life panel HUD colors during gameplay to match the chosen character static color
    const lifePlayer = document.getElementById('life-player');
    const lifeValPlayer = document.getElementById('life-val-player');
    if (lifePlayer && lifeValPlayer) {
        lifePlayer.style.color = p1Char.hex;
        lifeValPlayer.style.textShadow = `0 0 12px ${p1Char.hex}80`;
    }
    const lifeTop = document.getElementById('life-top');
    const lifeValTop = document.getElementById('life-val-top');
    if (lifeTop && lifeValTop) {
        lifeTop.style.color = p2Char.hex;
        lifeValTop.style.textShadow = `0 0 12px ${p2Char.hex}80`;
    }
    const lifeLeft = document.getElementById('life-left');
    const lifeValLeft = document.getElementById('life-val-left');
    if (lifeLeft && lifeValLeft) {
        lifeLeft.style.color = p3Char.hex;
        lifeValLeft.style.textShadow = `0 0 12px ${p3Char.hex}80`;
    }
    const lifeRight = document.getElementById('life-right');
    const lifeValRight = document.getElementById('life-val-right');
    if (lifeRight && lifeValRight) {
        lifeRight.style.color = p4Char.hex;
        lifeValRight.style.textShadow = `0 0 12px ${p4Char.hex}80`;
    }

    // Helper to set active button state
    const setActiveButton = activeBtn => {
        [
            btnDeflecto,
            btnTileFall,
            btnBoxBrawl,
            btnSlideOut,
            btnBounceClaim,
            btnRicochet,
            btnKineticRing,
            btnHexCollapse,
            btnShrinkZone,
            btnSweeper
        ].forEach(btn => {
            if (btn) {
                if (btn === activeBtn) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
    };

    if (gameId === 'deflecto') {
        if (titleEl) titleEl.textContent = 'Deflecto';
        setActiveButton(btnDeflecto);

        if (ballistixHud) ballistixHud.style.display = 'flex';
        if (ballistixControls) ballistixControls.style.display = 'flex';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'Use A/D or Left/Right Arrow keys to slide the paddle. Keep the ball bouncing inside the arena!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'Deflecto';
        }

        const startBallistix = () => {
            if (!window.BallistixGame) {
                console.warn('BallistixGame not ready yet, retrying in 100ms...');
                setTimeout(startBallistix, 100);
                return;
            }
            window.activeGame = new window.BallistixGame(
                'canvas-container',
                p1Char.color,
                window.launcherState.selectedArena
            );

            // Override car body color only (first mesh child = the oval car body).
            // Character sub-meshes use MeshBasicMaterial which has no emissive, so we skip them.
            const applyColor = (paddleGroup, colorHex) => {
                if (!paddleGroup) return;
                paddleGroup.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.color.setHex(colorHex);
                        if (child.material.emissive) {
                            child.material.emissive.setHex(colorHex);
                        }
                    }
                });
            };
            applyColor(window.activeGame.paddle, p1Char.color);
            applyColor(window.activeGame.topPaddle, p2Char.color);
            applyColor(window.activeGame.leftPaddle, p3Char.color);
            applyColor(window.activeGame.rightPaddle, p4Char.color);
        };
        startBallistix();
    } else if (gameId === 'tilefall') {
        if (titleEl) titleEl.textContent = 'TileFall';
        setActiveButton(btnTileFall);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'Use WASD/Arrows to move the Dragon. Stand in outer concentric rings to increase multiplier (up to 3x)! Collide with jewels to pick them up, and press Spacebar to shoot them towards the moving target.';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'TileFall';
        }

        if (window.DragonDropGame) {
            window.activeGame = new window.DragonDropGame(
                'canvas-container',
                p1Char.color,
                window.launcherState.selectedArena
            );

            // Override player avatar box color in Dragon Drop
            if (window.activeGame.player) {
                window.activeGame.player.material.color.setHex(p1Char.color);
                window.activeGame.player.material.emissive.setHex(p1Char.color);
            }
        } else {
            console.error('DragonDropGame class not loaded.');
        }
    } else if (gameId === 'boxbrawl') {
        if (titleEl) titleEl.textContent = 'BoxBrawl';
        setActiveButton(btnBoxBrawl);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'Use WASD or Arrows to move. Press Spacebar near a crate to pick it up. Press Spacebar while holding a crate to throw it at opponents! Avoid getting crushed by falling or thrown crates. TNT crates cause explosive area damage!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'BoxBrawl';
        }

        if (window.CrateCrushGame) {
            // Instantiate and pass container ID, Player 1 color, and selected arena
            window.activeGame = new window.CrateCrushGame(
                'canvas-container',
                p1Char.color,
                window.launcherState.selectedArena
            );
        } else {
            console.error('CrateCrushGame class not loaded.');
        }
    } else if (gameId === 'slideout') {
        if (titleEl) titleEl.textContent = 'SlideOut';
        setActiveButton(btnSlideOut);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'WASD/Arrows to slide. Spacebar to DASH & RAM. Knock all other players off the slippery ice platform to win!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'SlideOut';
        }

        const chosenColor = p1Char.color;
        if (window.PolarPushGame) {
            // Instantiate and pass container ID, Player 1 color, and selected arena
            window.activeGame = new window.PolarPushGame(
                'game-container',
                chosenColor,
                window.launcherState.selectedArena
            );
        } else {
            console.error('PolarPushGame class not loaded.');
        }
    } else if (gameId === 'bounceclaim') {
        if (titleEl) titleEl.textContent = 'BounceClaim';
        setActiveButton(btnBounceClaim);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'WASD/Arrows to Hop. Paint the floor tiles with your color. Pick up Stars to claim a 3x3 territory burst. Avoid Spikes that stun you!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'BounceClaim';
        }

        const chosenColor = p1Char.color;
        if (window.PogoPandemoniumGame) {
            window.activeGame = new window.PogoPandemoniumGame(
                'game-container',
                chosenColor,
                window.launcherState.selectedArena
            );
        } else {
            console.error('PogoPandemoniumGame class not loaded.');
        }
    } else if (gameId === 'ricochet') {
        if (titleEl) titleEl.textContent = 'Ricochet';
        setActiveButton(btnRicochet);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'W/S to Drive. A/D to Steer Turret. Spacebar to FIRE. Projectiles bounce off concrete walls up to 2 times. Rusty walls are destructible!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'Ricochet';
        }

        const chosenColor = p1Char.color;
        if (window.TankMayhemGame) {
            window.activeGame = new window.TankMayhemGame(
                'game-container',
                chosenColor,
                window.launcherState.selectedArena
            );
        } else {
            console.error('TankMayhemGame class not loaded.');
        }
    } else if (gameId === 'kineticring') {
        if (titleEl) titleEl.textContent = 'KineticRing';
        setActiveButton(btnKineticRing);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'WASD/Arrows to Move. Spacebar to DASH. Knock opponents out of the Sumo Ring!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'KineticRing';
        }

        const chosenColor = p1Char.color;
        if (window.RingRuckusGame) {
            window.activeGame = new window.RingRuckusGame(
                'game-container',
                chosenColor,
                window.launcherState.selectedArena
            );
        } else {
            console.error('RingRuckusGame class not loaded.');
        }
    } else if (gameId === 'hexcollapse') {
        if (titleEl) titleEl.textContent = 'HexCollapse';
        setActiveButton(btnHexCollapse);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                "WASD/Arrows to Move. Spacebar to Jump. Tiles crumble after you step on them. Don't fall through the bottom layer!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'HexCollapse';
        }

        const chosenColor = p1Char.color;
        if (window.SkyHighGame) {
            window.activeGame = new window.SkyHighGame(
                'game-container',
                chosenColor,
                window.launcherState.selectedArena
            );
        } else {
            console.error('SkyHighGame class not loaded.');
        }
    } else if (gameId === 'shrinkzone') {
        if (titleEl) titleEl.textContent = 'ShrinkZone';
        setActiveButton(btnShrinkZone);

        // We use the ballistix hud for health bars
        if (ballistixHud) ballistixHud.style.display = 'flex';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'WASD/Arrows to Move. Avoid Flame Spouts and Spike Plates! Stay inside the shrinking green Toxic Storm or take damage!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'ShrinkZone';
        }

        const chosenColor = p1Char.color;
        if (window.ToxicTrapGame) {
            window.activeGame = new window.ToxicTrapGame(
                'game-container',
                chosenColor,
                window.launcherState.selectedArena
            );
        } else {
            console.error('ToxicTrapGame class not loaded.');
        }
    } else if (gameId === 'sweeper') {
        if (titleEl) titleEl.textContent = 'Sweeper';
        setActiveButton(btnSweeper);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'WASD/Arrows to Move. Spacebar to JUMP over the red beam. Shift/Control to DUCK under the blue beam!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'Sweeper';
        }

        const chosenColor = p1Char.color;
        if (window.MeltDownGame) {
            window.activeGame = new window.MeltDownGame(
                'game-container',
                chosenColor,
                window.launcherState.selectedArena
            );
        } else {
            console.error('MeltDownGame class not loaded.');
        }
    }
}

/**
 * Cleanly exits active gameplay and returns to launcher selections
 */
function exitToLauncher() {
    const confirmed = window.confirm('Exit to launcher? Your current match will be lost.');
    if (!confirmed) return;

    console.log('Exiting gameplay to launcher selection...');

    // Destroy active game
    if (window.activeGame) {
        try {
            window.activeGame.destroy();
        } catch (e) {
            console.error('Error on game destroy:', e);
        }
        window.activeGame = null;
    }

    // Reset update hooks
    window.engine.updateCallbacks = [];

    // Remove game over overlay
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) gameOverOverlay.remove();

    // Hide exit button manually (it's a .hud element so transitionToState will hide all HUDs)
    const exitBtn = document.getElementById('bottom-exit-btn');
    if (exitBtn) exitBtn.style.display = 'none';

    // Recreate default octahedron
    window.restoreSceneEnvironment();

    // Transition back to selection grid
    transitionToState('GAME_SELECT');
}

/**
 * Standard switch switcher (top-left select dropdown fallback)
 */
function switchMinigame(gameName) {
    console.log(`switchMinigame directly clicked: ${gameName}`);
    window.launcherState.selectedGame = gameName;
    transitionToState('GAMEPLAY');
}

// Expose states and transition functions globally
window.switchMinigame = switchMinigame;
window.transitionToState = transitionToState;
window.launchSelectedMatch = launchSelectedMatch;
window.exitToLauncher = exitToLauncher;
window.switchMinigame = switchMinigame;

window.renderArenaSelectionGrid = function () {
    const grid = document.getElementById('arena-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const gameDef = minigamesRegistry.find(g => g.id === window.launcherState.selectedGame);
    if (!gameDef || !gameDef.arenas) return;

    const subtitleEl = document.getElementById('arena-subtitle');
    if (subtitleEl) subtitleEl.textContent = `Choose your battleground for ${gameDef.name}`;
    window.launcherState.selectedArena = gameDef.arenas[0];

    gameDef.arenas.forEach(arena => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.height = '180px';
        card.innerHTML = `
            <div class="card-icon" style="height: 100px; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: rgba(0,0,0,0.5);">🏟️</div>
            <div class="card-content" style="padding: 10px;">
                <h3 class="card-title" style="font-size: 1.1rem; margin: 0;">${arena}</h3>
            </div>
        `;
        card.addEventListener('click', () => {
            window.selectArena(arena);
            document
                .querySelectorAll('#arena-grid .game-card')
                .forEach(c => (c.style.border = '1px solid rgba(255, 255, 255, 0.1)'));
            card.style.border = '2px solid var(--accent-blue)';
        });

        if (arena === window.launcherState.selectedArena) {
            card.style.border = '2px solid var(--accent-blue)';
        }

        grid.appendChild(card);
    });
};

window.selectArena = function (arena) {
    window.launcherState.selectedArena = arena;
    if (typeof window.saveLauncherState === 'function') window.saveLauncherState();
};

// Start the engine
window.toggleSettingsModal = toggleSettingsModal;
window.selectCharacterForPlayer1 = selectCharacterForPlayer1;
window.cyclePlayer1Character = cyclePlayer1Character;
window.closeLockedModal = closeLockedModal;
window.setupLauncherDOM = setupLauncherDOM;
window.transitionToState = transitionToState;

// Global vertical keydown navigation on Character Select Screen
window.addEventListener('keydown', e => {
    if (window.launcherState && window.launcherState.currentState === 'CHAR_SELECT') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            window.cyclePlayer1Character(-1);
            e.preventDefault();
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            window.cyclePlayer1Character(1);
            e.preventDefault();
        }
    }
});
