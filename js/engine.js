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

const minigamesRegistry = window.minigamesRegistry;
const engine = window.engine;

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
    engine.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
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
    window.setupInputHandling();

    // 9. Resize Observer
    window.addEventListener('resize', handleResize);

    // 10. Populate UI from central registry and setup events
    window.setupLauncherDOM();

    // 11. Start State Machine: Load saved state or default to Splash
    let startingState = 'SPLASH';
    if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem('launcherState');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.selectedGame) window.launcherState.selectedGame = parsed.selectedGame;
                if (parsed.selectedArena) window.launcherState.selectedArena = parsed.selectedArena;
                if (parsed.playerAssignments)
                    window.launcherState.playerAssignments = parsed.playerAssignments;
                if (parsed.currentState && parsed.currentState !== 'SPLASH') {
                    startingState = parsed.currentState;
                }
            }
        } catch (e) {
            console.warn('Error loading saved state:', e);
        }
    }
    window.transitionToState(startingState);

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
window.removeSceneEnvironment = function removeSceneEnvironment() {
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
window.restoreSceneEnvironment = function restoreSceneEnvironment() {
    // Re-add engine environment helper
    createSceneEnvironment();
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
            console.error('Error in update callback: ', e);
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
// Event listener removed to avoid duplicate initialization with direct call

init();