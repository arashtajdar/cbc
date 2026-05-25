/**
 * BALLISTIX GAME ENGINE - STATE-DRIVEN LAUNCHER HUB
 * Core Three.js Isometric Engine Setup & Launcher State Machine
 * 
 * Exposes:
 * - window.engine: Core engine state, scene, camera, renderer, entities
 * - window.inputs: Key states for WASD, Arrow Keys, and Spacebar
 * - window.launcherState: Selected game, player characters, current launcher screen state
 * - window.transitionToState: Transitions between launcher screens (Splash, Menu, selection, gameplay)
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

// --- 1. THE 10 MINIGAME REGISTRY ---
const minigamesRegistry = [
    {
        id: "deflecto",
        name: "Deflecto",
        description: "3D shield-defending hockey arena.",
        status: "Active",
        arenas: ["Neon Stadium", "Grid Matrix", "Solar Plexus"]
    },
    {
        id: "tilefall",
        name: "TileFall",
        description: "Grid-dropping survival arena.",
        status: "Active",
        arenas: ["Volcano Core", "Deep Abyss", "Cyber Void"]
    },
    {
        id: "boxbrawl",
        name: "BoxBrawl",
        description: "Grid arena where players lift, carry, and throw TNT/wooden crates at each other.",
        status: "Active",
        arenas: ["Cargo Dock", "Warehouse Chaos", "TNT Factory"]
    },
    {
        id: "slideout",
        name: "SlideOut",
        description: "Slippery ice platform where players dash to bump opponents off.",
        status: "Active/Ready to Play",
        arenas: ["Slippery Summit", "Glacier Edge", "Frostbite Tundra"]
    },
    {
        id: "bounceclaim",
        name: "BounceClaim",
        description: "Grid-based arena where players bounce on tiles to color them.",
        status: "Active/Ready to Play",
        arenas: ["Pixel Floor", "Voxel Verse", "Color Clash"]
    },
    {
        id: "ricochet",
        name: "Ricochet",
        description: "Miniature 3D maze arena with explosive bouncing projectiles.",
        status: "Active/Ready to Play",
        arenas: ["Concrete Maze", "Rusty Warrens", "Iron Labyrinth"]
    },
    {
        id: "kineticring",
        name: "KineticRing",
        description: "Circular sumo wrestling arena using rolling/dashing vehicles.",
        status: "Active/Ready to Play",
        arenas: ["Sky Dojo", "Floating Tatami", "Neon Ring"]
    },
    {
        id: "hexcollapse",
        name: "HexCollapse",
        description: "Falling hex-grid platform where layers of tiles collapse dynamically.",
        status: "Active/Ready to Play",
        arenas: ["Crumble Heights", "Stratosphere Drop", "Aero Grid"]
    },
    {
        id: "shrinkzone",
        name: "ShrinkZone",
        description: "Survival arena with localized hazards and shrinking safe zones.",
        status: "Active/Ready to Play",
        arenas: ["Biohazard Zone", "Acid Pit", "Reactor Core"]
    },
    {
        id: "sweeper",
        name: "Sweeper",
        description: "A rotating, tilting beam platform where players must jump/duck.",
        status: "Active/Ready to Play",
        arenas: ["Centrifuge", "Rotor Wash", "Turbine Deck"]
    }
];

// --- 2. GLOBAL ENGINE & INPUT STATES ---
const engine = {
    scene: null,
    camera: null,
    renderer: null,
    container: null,
    clock: null,
    lights: {},
    entities: {},
    inputs: {
        w: false,
        a: false,
        s: false,
        d: false,
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        Space: false
    },
    updateCallbacks: []
};

// Expose inputs and engine globally
window.inputs = engine.inputs;
window.engine = engine;

// --- 3. STATE MACHINE CONFIGURATION ---
window.launcherState = {
    currentState: 'SPLASH', // SPLASH, MAIN_MENU, GAME_SELECT, CHAR_SELECT, ARENA_SELECT, GAMEPLAY
    selectedGame: null,
    selectedArena: null,
    characters: [
        { id: 'titan', name: 'Red Titan', shape: 'cube', color: 0xff3333, hex: '#ff3333' },
        { id: 'drake', name: 'Neon Drake', shape: 'sphere', color: 0x39ff14, hex: '#39ff14' },
        { id: 'mech', name: 'Cyber Mech', shape: 'cylinder', color: 0x00f0ff, hex: '#00f0ff' },
        { id: 'rogue', name: 'Shadow Rogue', shape: 'cone', color: 0xb026ff, hex: '#b026ff' }
    ],
    playerAssignments: {
        p1: 0, // Red Titan
        p2: 1, // Neon Drake
        p3: 2, // Cyber Mech
        p4: 3  // Shadow Rogue
    }
};

// Character preview scene globals
let charPreviewRenderer = null;
let charPreviewScene = null;
let charPreviewCamera = null;
let charPreviewAnimationFrame = null;
let previewGroup = null;
let previewMeshes = [];

/**
 * Initialize the engine components
 */
function init() {
    // 1. Get container
    engine.container = document.getElementById('canvas-container');
    if (!engine.container) {
        console.error("Canvas container '#canvas-container' not found in DOM!");
        return;
    }

    const width = engine.container.clientWidth;
    const height = engine.container.clientHeight;

    // 2. Initialize Scene
    engine.scene = new THREE.Scene();
    engine.scene.background = new THREE.Color(0x0a0c14); // Deep space dark
    engine.scene.fog = new THREE.FogExp2(0x0a0c14, 0.015); // Depth fog

    // 3. Initialize Isometric Perspective Camera
    const fov = 32;
    const aspect = width / height;
    const near = 0.1;
    const far = 1000;
    engine.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    
    // Position camera at 45 degrees isometric angle
    const isoDistance = 45;
    engine.camera.position.set(isoDistance, isoDistance, isoDistance);
    engine.camera.lookAt(0, 0, 0);

    // 4. Initialize WebGLRenderer
    engine.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    engine.renderer.setSize(width, height);
    engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Shadows & Soft Shadow mapping
    engine.renderer.shadowMap.enabled = true;
    engine.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    engine.renderer.outputEncoding = THREE.sRGBEncoding;
    engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    engine.renderer.toneMappingExposure = 1.0;

    // Attach to HTML container
    engine.container.appendChild(engine.renderer.domElement);

    // 5. Initialize Clock
    engine.clock = new THREE.Clock();

    // 6. Global Ambient / Directional Lighting
    engine.lights.ambient = new THREE.AmbientLight(0x2a3350, 1.5);
    engine.scene.add(engine.lights.ambient);

    // Primary Directional Light (Warm yellow sun key light) casting soft shadows
    engine.lights.directional = new THREE.DirectionalLight(0xffedd8, 2.5);
    engine.lights.directional.position.set(25, 40, 15);
    engine.lights.directional.castShadow = true;
    
    engine.lights.directional.shadow.mapSize.width = 2048;
    engine.lights.directional.shadow.mapSize.height = 2048;
    engine.lights.directional.shadow.camera.near = 0.5;
    engine.lights.directional.shadow.camera.far = 100;
    
    const d = 30; // Frustum box size
    engine.lights.directional.shadow.camera.left = -d;
    engine.lights.directional.shadow.camera.right = d;
    engine.lights.directional.shadow.camera.top = d;
    engine.lights.directional.shadow.camera.bottom = -d;
    engine.lights.directional.shadow.bias = -0.0005;
    
    engine.scene.add(engine.lights.directional);

    // Secondary Accent Light (Cyan rim light)
    engine.lights.cyanRim = new THREE.DirectionalLight(0x00f0ff, 1.8);
    engine.lights.cyanRim.position.set(-25, 10, -25);
    engine.scene.add(engine.lights.cyanRim);

    // 7. Create Demo Entities (Sci-fi Grid, Crystal, Rings)
    createSceneEnvironment();

    // 8. Bind Key Event Listeners
    setupInputHandling();

    // 9. Resize Observer
    window.addEventListener('resize', handleResize);

    // 10. Populate UI from central registry and setup events
    setupLauncherDOM();

    // 11. Start State Machine: Studio Splash Screen
    transitionToState('SPLASH');

    // 12. Start the main game loop
    animate();
}

/**
 * Creates visual scene structures to display the isometric view
 */
function createSceneEnvironment() {
    // Ground Plane to receive shadows
    if (!engine.entities.ground) {
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x0f111a,
            roughness: 0.85,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        engine.scene.add(ground);
        engine.entities.ground = ground;
    } else {
        engine.scene.add(engine.entities.ground);
    }

    // Grid Helper styled to give a glowing sci-fi vibe
    if (!engine.entities.grid) {
        const grid = new THREE.GridHelper(60, 30, 0x00f0ff, 0x1d243a);
        grid.position.y = 0.01; // Avoid depth fighting
        engine.scene.add(grid);
        engine.entities.grid = grid;
    } else {
        engine.scene.add(engine.entities.grid);
    }

    // Glowing Central Octahedron Crystal (Demo Character)
    const crystalGeo = new THREE.OctahedronGeometry(2, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
        color: 0xff007f, // Neon magenta
        roughness: 0.1,
        metalness: 0.9,
        emissive: 0xff007f,
        emissiveIntensity: 0.25
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(0, 3, 0);
    crystal.castShadow = true;
    crystal.receiveShadow = true;
    engine.scene.add(crystal);
    engine.entities.player = crystal;

    // Glowing dynamic energy ring surrounding the crystal
    const ringGeo = new THREE.RingGeometry(3.8, 4.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    engine.scene.add(ring);
    engine.entities.glowRing = ring;

    // Embedded Point Light inside the crystal
    const glowLight = new THREE.PointLight(0xff007f, 3, 15);
    glowLight.position.set(0, 3, 0);
    glowLight.castShadow = false;
    engine.scene.add(glowLight);
    engine.entities.glowLight = glowLight;
}

/**
 * Clean up default demo environment so games can setup their play spaces
 */
function removeSceneEnvironment() {
    if (engine.entities.player) {
        engine.scene.remove(engine.entities.player);
        engine.entities.player = null;
    }
    if (engine.entities.glowRing) {
        engine.scene.remove(engine.entities.glowRing);
        engine.entities.glowRing = null;
    }
    if (engine.entities.glowLight) {
        engine.scene.remove(engine.entities.glowLight);
        engine.entities.glowLight = null;
    }
    // Also remove the default ground and grid helper to avoid overlapping z-fight surfaces
    if (engine.entities.ground) {
        engine.scene.remove(engine.entities.ground);
    }
    if (engine.entities.grid) {
        engine.scene.remove(engine.entities.grid);
    }
}

/**
 * Restores the default demo crystal environment for menus
 */
function restoreSceneEnvironment() {
    // Re-add engine environment helper
    createSceneEnvironment();
}

/**
 * Sets up global input event handlers
 */
function setupInputHandling() {
    const keyMap = {
        'KeyW': 'w', 'w': 'w', 'W': 'w',
        'KeyA': 'a', 'a': 'a', 'A': 'a',
        'KeyS': 's', 's': 's', 'S': 's',
        'KeyD': 'd', 'd': 'd', 'D': 'd',
        'ArrowUp': 'ArrowUp',
        'ArrowDown': 'ArrowDown',
        'ArrowLeft': 'ArrowLeft',
        'ArrowRight': 'ArrowRight',
        'Space': 'Space', ' ': 'Space'
    };

    window.addEventListener('keydown', (e) => {
        const key = keyMap[e.code] || keyMap[e.key];
        if (key && engine.inputs[key] !== undefined) {
            engine.inputs[key] = true;
            
            // Dispatch dynamic UI update event
            window.dispatchEvent(new CustomEvent('engine-input-change', { detail: { key, pressed: true } }));
            
            // Prevent browser scroll behavior for gameplay controls
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(key)) {
                e.preventDefault();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        const key = keyMap[e.code] || keyMap[e.key];
        if (key && engine.inputs[key] !== undefined) {
            engine.inputs[key] = false;
            
            // Dispatch dynamic UI update event
            window.dispatchEvent(new CustomEvent('engine-input-change', { detail: { key, pressed: false } }));
        }
    });
}

/**
 * Handle screen size updates
 */
function handleResize() {
    if (!engine.container || !engine.camera || !engine.renderer) return;

    const width = engine.container.clientWidth;
    const height = engine.container.clientHeight;

    engine.camera.aspect = width / height;
    engine.camera.updateProjectionMatrix();

    engine.renderer.setSize(width, height);
}

/**
 * Update logic runs every frame
 */
function update(delta, time) {
    // Only update floating/rotating demo crystal if in menu state
    if (window.launcherState.currentState !== 'GAMEPLAY') {
        const player = engine.entities.player;
        if (player) {
            player.position.y = 3.0 + Math.sin(time * 2.2) * 0.4;
            player.rotation.y += 0.6 * delta;
            player.rotation.x += 0.3 * delta;

            if (engine.entities.glowLight) {
                engine.entities.glowLight.position.y = player.position.y;
            }
        }

        if (engine.entities.glowRing) {
            engine.entities.glowRing.rotation.z -= 0.3 * delta;
        }
    }

    // Run active gameplay hooks
    for (const callback of engine.updateCallbacks) {
        try {
            callback(delta, time);
        } catch (e) {
            console.error("Error in update callback: ", e);
        }
    }
}

/**
 * Primary requestAnimationFrame loop
 */
function animate() {
    requestAnimationFrame(animate);

    if (!engine.clock || !engine.scene || !engine.camera || !engine.renderer) return;

    const delta = Math.min(engine.clock.getDelta(), 0.1);
    const time = engine.clock.getElapsedTime();

    update(delta, time);

    if (window.activeGame && typeof window.activeGame.update === 'function') {
        window.activeGame.update(delta, engine.inputs);
    }

    engine.renderer.render(engine.scene, engine.camera);
}

// Start engine setup
window.addEventListener('DOMContentLoaded', init);

// --- 4. STATE MACHINE TRANSITIONS & UI BUILDERS ---

/**
 * Populates minigame cards dynamically and connects event listeners
 */
function setupLauncherDOM() {
    const grid = document.getElementById('launcher-games-grid');
    if (!grid) return;

    grid.innerHTML = '';
    minigamesRegistry.forEach((game) => {
        const card = document.createElement('div');
        const isActive = (game.status === 'Active' || game.status === 'Active/Ready to Play');
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
        shadowsToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            engine.renderer.shadowMap.enabled = enabled;
            engine.scene.traverse((child) => {
                if (child.material) child.material.needsUpdate = true;
            });
            console.log(`Settings: Shadows ${enabled ? 'Enabled' : 'Disabled'}`);
        });
    }

    const volumeSlider = document.getElementById('setting-volume');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
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

/**
 * Cycles player or bot characters on character selection screen
 */
function cyclePlayerCharacter(playerKey, direction) {
    const state = window.launcherState;
    const currentIdx = state.playerAssignments[playerKey];
    const newIdx = (currentIdx + direction + 4) % 4;
    state.playerAssignments[playerKey] = newIdx;

    updateCharacterSelectionUI();
    buildPreviewCharacters();
}

/**
 * Updates UI slot cards' labels and border glow states
 */
function updateCharacterSelectionUI() {
    const state = window.launcherState;
    const players = ['p1', 'p2', 'p3', 'p4'];

    players.forEach((pKey) => {
        const charIdx = state.playerAssignments[pKey];
        const charData = state.characters[charIdx];

        const nameEl = document.getElementById(`${pKey}-char-name`);
        if (nameEl) {
            nameEl.textContent = charData.name;
        }

        const cardEl = document.getElementById(`slot-card-${pKey}`);
        if (cardEl) {
            cardEl.className = 'slot-card'; // Reset
            cardEl.classList.add(`glow-${charData.shape}`);
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
        if (charPreviewAnimationFrame) {
            cancelAnimationFrame(charPreviewAnimationFrame);
            charPreviewAnimationFrame = null;
        }
        if (charPreviewRenderer) {
            const container = document.getElementById('char-preview-canvas-container');
            if (container) container.innerHTML = '';
            charPreviewRenderer.dispose();
            charPreviewRenderer = null;
        }
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
    } 
    else if (state === 'MAIN_MENU') {
        if (mainMenu) mainMenu.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '1';
            canvasContainer.style.transition = 'opacity 0.6s ease';
        }
        
        // Ensure default environment is active
        if (!window.activeGame && !engine.entities.player) {
            restoreSceneEnvironment();
        }
    } 
    else if (state === 'GAME_SELECT') {
        if (gameSelect) gameSelect.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '0.5'; // Dim for readability
        }
    } 
    else if (state === 'CHAR_SELECT') {
        if (charSelect) charSelect.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '0.25'; // De-emphasize
        }
        initCharPreview();
        updateCharacterSelectionUI();
    } 
    else if (state === 'ARENA_SELECT') {
        if (arenaSelect) arenaSelect.classList.add('active');
        if (canvasContainer) {
            canvasContainer.style.opacity = '0.25'; // De-emphasize
        }
        if (typeof renderArenaSelectionGrid === 'function') {
            renderArenaSelectionGrid();
        }
    }
    else if (state === 'GAMEPLAY') {
        if (canvasContainer) {
            canvasContainer.style.opacity = '1';
        }
        launchSelectedMatch();
    }
}

/**
 * Initializes character preview Three.js scene inside selection screen
 */
function initCharPreview() {
    const container = document.getElementById('char-preview-canvas-container');
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 220;

    charPreviewScene = new THREE.Scene();
    
    // Transparent renderer background to match glass cards
    charPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    charPreviewRenderer.setSize(width, height);
    charPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    charPreviewRenderer.shadowMap.enabled = true;
    charPreviewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(charPreviewRenderer.domElement);

    charPreviewCamera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    charPreviewCamera.position.set(0, 2.0, 8.5);
    charPreviewCamera.lookAt(0, 0.4, 0);

    // Light Setup
    const ambientLight = new THREE.AmbientLight(0x2a3350, 1.4);
    charPreviewScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffedd8, 2.0);
    dirLight.position.set(4, 8, 4);
    dirLight.castShadow = true;
    charPreviewScene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x8833ff, 1.2);
    rimLight.position.set(-4, 3, -4);
    charPreviewScene.add(rimLight);

    previewGroup = new THREE.Group();
    charPreviewScene.add(previewGroup);

    buildPreviewCharacters();

    const clock = new THREE.Clock();

    function animatePreview() {
        charPreviewAnimationFrame = requestAnimationFrame(animatePreview);
        const elapsed = clock.getElapsedTime();
        const dt = Math.min(clock.getDelta(), 0.1);

        previewMeshes.forEach((item, index) => {
            if (item.mesh) {
                // Floating hover using offsets
                item.mesh.position.y = item.baseY + Math.sin(elapsed * 2.5 + index * 1.5) * 0.2;
                // Spin rotation
                item.mesh.rotation.y += 0.8 * dt;
                
                // Scale highlight selected characters
                const isSelectedByP1 = (window.launcherState.playerAssignments.p1 === index);
                let targetScale = isSelectedByP1 ? 1.25 : 0.85;
                item.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);
                
                if (item.mesh.material && item.mesh.material.emissiveIntensity !== undefined) {
                    item.mesh.material.emissiveIntensity = isSelectedByP1 ? (0.6 + Math.sin(elapsed * 6.0) * 0.15) : 0.2;
                }
            }
            if (item.pedestalGlow) {
                const isSelectedByP1 = (window.launcherState.playerAssignments.p1 === index);
                const scaleVal = isSelectedByP1 ? (1.0 + Math.sin(elapsed * 6.0) * 0.06) : 0.85;
                item.pedestalGlow.scale.set(scaleVal, scaleVal, scaleVal);
                item.pedestalGlow.material.opacity = isSelectedByP1 ? 0.85 : 0.3;
            }
        });

        charPreviewRenderer.render(charPreviewScene, charPreviewCamera);
    }

    animatePreview();
}

/**
 * Builds the 4 selected geometric meshes inside the character select preview scene
 */
function buildPreviewCharacters() {
    if (!charPreviewScene || !previewGroup) return;

    // Clean up existing meshes
    previewMeshes.forEach(item => {
        if (item.mesh) {
            previewGroup.remove(item.mesh);
            item.mesh.geometry.dispose();
            item.mesh.material.dispose();
        }
        if (item.pedestalGlow) {
            previewGroup.remove(item.pedestalGlow);
            item.pedestalGlow.geometry.dispose();
            item.pedestalGlow.material.dispose();
        }
        if (item.pedestal) {
            previewGroup.remove(item.pedestal);
            item.pedestal.geometry.dispose();
            item.pedestal.material.dispose();
        }
    });

    previewMeshes = [];
    previewGroup.clear();

    const xPositions = [-3.6, -1.2, 1.2, 3.6];
    const players = ['p1', 'p2', 'p3', 'p4'];

    players.forEach((pKey, pIndex) => {
        const charIdx = window.launcherState.playerAssignments[pKey];
        const charData = window.launcherState.characters[charIdx];
        const xPos = xPositions[pIndex];

        // 1. Pedestal Base
        const pedGeo = new THREE.CylinderGeometry(0.65, 0.75, 0.15, 32);
        const pedMat = new THREE.MeshStandardMaterial({
            color: 0x1c1f30,
            roughness: 0.5,
            metalness: 0.8
        });
        const pedestal = new THREE.Mesh(pedGeo, pedMat);
        pedestal.position.set(xPos, -0.45, 0);
        pedestal.receiveShadow = true;
        previewGroup.add(pedestal);

        // Pedestal Glow Ring
        const ringGeo = new THREE.RingGeometry(0.72, 0.8, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: charData.color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(xPos, -0.36, 0);
        previewGroup.add(ring);

        // 2. Character Geometry Setup
        let geom;
        let baseY = 0.45;
        if (charData.shape === 'cube') {
            geom = new THREE.BoxGeometry(0.85, 0.85, 0.85);
            baseY = 0.45;
        } else if (charData.shape === 'sphere') {
            geom = new THREE.SphereGeometry(0.5, 32, 32);
            baseY = 0.45;
        } else if (charData.shape === 'cylinder') {
            geom = new THREE.CylinderGeometry(0.4, 0.4, 0.95, 32);
            baseY = 0.5;
        } else if (charData.shape === 'cone') {
            geom = new THREE.ConeGeometry(0.5, 1.0, 32);
            baseY = 0.55;
        }

        const mat = new THREE.MeshStandardMaterial({
            color: charData.color,
            roughness: 0.15,
            metalness: 0.8,
            emissive: charData.color,
            emissiveIntensity: 0.2
        });

        const charMesh = new THREE.Mesh(geom, mat);
        charMesh.position.set(xPos, baseY, 0);
        charMesh.castShadow = true;
        previewGroup.add(charMesh);

        previewMeshes.push({
            mesh: charMesh,
            pedestal: pedestal,
            pedestalGlow: ring,
            baseY: baseY
        });
    });
}

/**
 * Start Match: initializes game classes, clears launcher UI overlays, shows HUDs, and overrides custom colors
 */
function launchSelectedMatch() {
    const gameId = window.launcherState.selectedGame;
    console.log(`Starting match: ${gameId}`);

    // Remove active overlays
    const overlays = ['splash-screen', 'main-menu-screen', 'game-selection-screen', 'char-selection-screen', 'settings-overlay'];
    overlays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    // Clear background environment first
    removeSceneEnvironment();

    // Destroy active game if any
    if (window.activeGame) {
        try {
            window.activeGame.destroy();
        } catch (e) {
            console.error("Error cleaning up active game:", e);
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

    if (headerHud) headerHud.style.display = 'flex';
    if (instructionsHud) instructionsHud.style.display = 'block';
    if (statsHud) statsHud.style.display = 'flex';

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

    // Helper to set active button state
    const setActiveButton = (activeBtn) => {
        [btnDeflecto, btnTileFall, btnBoxBrawl, btnSlideOut, btnBounceClaim, btnRicochet, btnKineticRing, btnHexCollapse, btnShrinkZone, btnSweeper].forEach(btn => {
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
        if (titleEl) titleEl.textContent = "Deflecto";
        setActiveButton(btnDeflecto);

        if (ballistixHud) ballistixHud.style.display = 'flex';
        if (ballistixControls) ballistixControls.style.display = 'flex';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "Use A/D or Left/Right Arrow keys to slide the paddle. Keep the ball bouncing inside the arena!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "Deflecto";
        }

        if (window.BallistixGame) {
            window.activeGame = new window.BallistixGame('canvas-container', p1Char.color, window.launcherState.selectedArena);
            
            // Override active colors on standard paddle items
            if (window.activeGame.paddle) {
                window.activeGame.paddle.material.color.setHex(p1Char.color);
                window.activeGame.paddle.material.emissive.setHex(p1Char.color);
            }
            if (window.activeGame.topPaddle) {
                window.activeGame.topPaddle.material.color.setHex(p2Char.color);
                window.activeGame.topPaddle.material.emissive.setHex(p2Char.color);
            }
            if (window.activeGame.leftPaddle) {
                window.activeGame.leftPaddle.material.color.setHex(p3Char.color);
                window.activeGame.leftPaddle.material.emissive.setHex(p3Char.color);
            }
            if (window.activeGame.rightPaddle) {
                window.activeGame.rightPaddle.material.color.setHex(p4Char.color);
                window.activeGame.rightPaddle.material.emissive.setHex(p4Char.color);
            }
        } else {
            console.error("BallistixGame class not loaded.");
        }
    } 
    else if (gameId === 'tilefall') {
        if (titleEl) titleEl.textContent = "TileFall";
        setActiveButton(btnTileFall);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "Use WASD/Arrows to move the Dragon. Stand in outer concentric rings to increase multiplier (up to 3x)! Collide with jewels to pick them up, and press Spacebar to shoot them towards the moving target.";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "TileFall";
        }

        if (window.DragonDropGame) {
            window.activeGame = new window.DragonDropGame('canvas-container', p1Char.color, window.launcherState.selectedArena);
            
            // Override player avatar box color in Dragon Drop
            if (window.activeGame.player) {
                window.activeGame.player.material.color.setHex(p1Char.color);
                window.activeGame.player.material.emissive.setHex(p1Char.color);
            }
        } else {
            console.error("DragonDropGame class not loaded.");
        }
    }
    else if (gameId === 'boxbrawl') {
        if (titleEl) titleEl.textContent = "BoxBrawl";
        setActiveButton(btnBoxBrawl);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "Use WASD or Arrows to move. Press Spacebar near a crate to pick it up. Press Spacebar while holding a crate to throw it at opponents! Avoid getting crushed by falling or thrown crates. TNT crates cause explosive area damage!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "BoxBrawl";
        }

        if (window.CrateCrushGame) {
            // Instantiate and pass container ID, Player 1 color, and selected arena
            window.activeGame = new window.CrateCrushGame('canvas-container', p1Char.color, window.launcherState.selectedArena);
        } else {
            console.error("CrateCrushGame class not loaded.");
        }
    }
    else if (gameId === 'slideout') {
        if (titleEl) titleEl.textContent = "SlideOut";
        setActiveButton(btnSlideOut);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "WASD/Arrows to slide. Spacebar to DASH & RAM. Knock all other players off the slippery ice platform to win!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "SlideOut";
        }

        const chosenColor = p1Char.color;
        if (window.PolarPushGame) {
            // Instantiate and pass container ID, Player 1 color, and selected arena
            window.activeGame = new window.PolarPushGame('game-container', chosenColor, window.launcherState.selectedArena);
        } else {
            console.error("PolarPushGame class not loaded.");
        }
    }
    else if (gameId === 'bounceclaim') {
        if (titleEl) titleEl.textContent = "BounceClaim";
        setActiveButton(btnBounceClaim);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "WASD/Arrows to Hop. Paint the floor tiles with your color. Pick up Stars to claim a 3x3 territory burst. Avoid Spikes that stun you!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "BounceClaim";
        }

        const chosenColor = p1Char.color;
        if (window.PogoPandemoniumGame) {
            window.activeGame = new window.PogoPandemoniumGame('game-container', chosenColor, window.launcherState.selectedArena);
        } else {
            console.error("PogoPandemoniumGame class not loaded.");
        }
    }
    else if (gameId === 'ricochet') {
        if (titleEl) titleEl.textContent = "Ricochet";
        setActiveButton(btnRicochet);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "W/S to Drive. A/D to Steer Turret. Spacebar to FIRE. Projectiles bounce off concrete walls up to 2 times. Rusty walls are destructible!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "Ricochet";
        }

        const chosenColor = p1Char.color;
        if (window.TankMayhemGame) {
            window.activeGame = new window.TankMayhemGame('game-container', chosenColor, window.launcherState.selectedArena);
        } else {
            console.error("TankMayhemGame class not loaded.");
        }
    }
    else if (gameId === 'kineticring') {
        if (titleEl) titleEl.textContent = "KineticRing";
        setActiveButton(btnKineticRing);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "WASD/Arrows to Move. Spacebar to DASH. Knock opponents out of the Sumo Ring!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "KineticRing";
        }

        const chosenColor = p1Char.color;
        if (window.RingRuckusGame) {
            window.activeGame = new window.RingRuckusGame('game-container', chosenColor, window.launcherState.selectedArena);
        } else {
            console.error("RingRuckusGame class not loaded.");
        }
    }
    else if (gameId === 'hexcollapse') {
        if (titleEl) titleEl.textContent = "HexCollapse";
        setActiveButton(btnHexCollapse);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "WASD/Arrows to Move. Spacebar to Jump. Tiles crumble after you step on them. Don't fall through the bottom layer!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "HexCollapse";
        }

        const chosenColor = p1Char.color;
        if (window.SkyHighGame) {
            window.activeGame = new window.SkyHighGame('game-container', chosenColor, window.launcherState.selectedArena);
        } else {
            console.error("SkyHighGame class not loaded.");
        }
    }
    else if (gameId === 'shrinkzone') {
        if (titleEl) titleEl.textContent = "ShrinkZone";
        setActiveButton(btnShrinkZone);

        // We use the ballistix hud for health bars
        if (ballistixHud) ballistixHud.style.display = 'flex';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "WASD/Arrows to Move. Avoid Flame Spouts and Spike Plates! Stay inside the shrinking green Toxic Storm or take damage!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "ShrinkZone";
        }

        const chosenColor = p1Char.color;
        if (window.ToxicTrapGame) {
            window.activeGame = new window.ToxicTrapGame('game-container', chosenColor, window.launcherState.selectedArena);
        } else {
            console.error("ToxicTrapGame class not loaded.");
        }
    }
    else if (gameId === 'sweeper') {
        if (titleEl) titleEl.textContent = "Sweeper";
        setActiveButton(btnSweeper);

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "WASD/Arrows to Move. Spacebar to JUMP over the red beam. Shift/Control to DUCK under the blue beam!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "Sweeper";
        }

        const chosenColor = p1Char.color;
        if (window.MeltDownGame) {
            window.activeGame = new window.MeltDownGame('game-container', chosenColor, window.launcherState.selectedArena);
        } else {
            console.error("MeltDownGame class not loaded.");
        }
    }
}

/**
 * Cleanly exits active gameplay and returns to launcher selections
 */
function exitToLauncher() {
    console.log("Exiting gameplay to launcher selection...");

    // Destroy active game
    if (window.activeGame) {
        try {
            window.activeGame.destroy();
        } catch (e) {
            console.error("Error on game destroy:", e);
        }
        window.activeGame = null;
    }

    // Reset update hooks
    window.engine.updateCallbacks = [];

    // Remove game over overlay
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) gameOverOverlay.remove();

    // Recreate default octahedron
    restoreSceneEnvironment();

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

window.renderArenaSelectionGrid = function() {
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
            document.querySelectorAll('#arena-grid .game-card').forEach(c => c.style.border = '1px solid rgba(255, 255, 255, 0.1)');
            card.style.border = '2px solid var(--accent-blue)';
        });
        
        if (arena === window.launcherState.selectedArena) {
            card.style.border = '2px solid var(--accent-blue)';
        }
        
        grid.appendChild(card);
    });
};

window.selectArena = function(arena) {
    window.launcherState.selectedArena = arena;
};

// Start the engine
init();
window.toggleSettingsModal = toggleSettingsModal;
window.cyclePlayerCharacter = cyclePlayerCharacter;
window.closeLockedModal = closeLockedModal;
window.toggleSettingsModal = toggleSettingsModal;
