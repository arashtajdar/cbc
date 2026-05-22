/**
 * BALLISTIX GAME ENGINE
 * Core Three.js Isometric Engine Setup
 * 
 * Exposes:
 * - window.engine: Core engine state, scene, camera, renderer, entities
 * - window.inputs: Key states for WASD, Arrow Keys, and Spacebar
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

// Global engine state object
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
    // Extensibility hook: other files can push callbacks here to update components
    updateCallbacks: []
};

// Expose inputs and engine globally
window.inputs = engine.inputs;
window.engine = engine;

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
    engine.scene.background = new THREE.Color(0x0a0c14); // Deep, premium space dark
    engine.scene.fog = new THREE.FogExp2(0x0a0c14, 0.015); // Fog blending for soft depth

    // 3. Initialize Isometric Perspective Camera
    // Angle looking down from (45, 45, 45) to (0, 0, 0)
    // Low FOV (32) reduces distortion to closely emulate orthographic isometric projections
    const fov = 32;
    const aspect = width / height;
    const near = 0.1;
    const far = 1000;
    engine.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    
    // Position camera at equal values on x, y, and z to form 45-degree isometric projection angle
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
    
    // Advanced color mapping and post-look settings
    engine.renderer.outputEncoding = THREE.sRGBEncoding;
    engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    engine.renderer.toneMappingExposure = 1.0;

    // Attach to HTML container
    engine.container.appendChild(engine.renderer.domElement);

    // 5. Initialize Clock for tracking time delta
    engine.clock = new THREE.Clock();

    // 6. Global Ambient / Directional Lighting
    // Ambient light serves as a cool-toned fill light
    engine.lights.ambient = new THREE.AmbientLight(0x2a3350, 1.5);
    engine.scene.add(engine.lights.ambient);

    // Primary Directional Light (Warm yellow sun key light) casting soft shadows
    engine.lights.directional = new THREE.DirectionalLight(0xffedd8, 2.5);
    engine.lights.directional.position.set(25, 40, 15);
    engine.lights.directional.castShadow = true;
    
    // Shadow Resolution & Bounds adjustment
    engine.lights.directional.shadow.mapSize.width = 2048;
    engine.lights.directional.shadow.mapSize.height = 2048;
    engine.lights.directional.shadow.camera.near = 0.5;
    engine.lights.directional.shadow.camera.far = 100;
    
    const d = 30; // Orthographic frustum box size for shadows
    engine.lights.directional.shadow.camera.left = -d;
    engine.lights.directional.shadow.camera.right = d;
    engine.lights.directional.shadow.camera.top = d;
    engine.lights.directional.shadow.camera.bottom = -d;
    engine.lights.directional.shadow.bias = -0.0005;
    
    engine.scene.add(engine.lights.directional);

    // Secondary Accent Light (Futuristic cyan rim light to add pop)
    engine.lights.cyanRim = new THREE.DirectionalLight(0x00f0ff, 1.8);
    engine.lights.cyanRim.position.set(-25, 10, -25);
    engine.scene.add(engine.lights.cyanRim);

    // 7. Create Demo Entities (Sci-fi Grid, Crystal, Rings)
    createSceneEnvironment();

    // 8. Bind Key Event Listeners
    setupInputHandling();

    // 9. Resize Observer
    window.addEventListener('resize', handleResize);

    // 10. Start the main game loop
    animate();
}

/**
 * Creates visual scene structures to display the isometric view
 */
function createSceneEnvironment() {
    // Ground Plane to receive shadows
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

    // Grid Helper styled to give a glowing sci-fi vibe
    const grid = new THREE.GridHelper(60, 30, 0x00f0ff, 0x1d243a);
    grid.position.y = 0.01; // Avoid depth fighting with ground plane
    engine.scene.add(grid);

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

    // Embedded Point Light inside the crystal for real-time glow reflection on ground
    const glowLight = new THREE.PointLight(0xff007f, 3, 15);
    glowLight.position.set(0, 3, 0);
    glowLight.castShadow = false; // Point light shadows are heavy, keep disabled
    engine.scene.add(glowLight);
    engine.entities.glowLight = glowLight;
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
            
            // Dispatch dynamic UI update event for visual feedback
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
            
            // Dispatch dynamic UI update event for visual feedback
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

    // Adjust camera aspect ratio
    engine.camera.aspect = width / height;
    engine.camera.updateProjectionMatrix();

    // Adjust renderer size and adjust for DPI density
    engine.renderer.setSize(width, height);
}

/**
 * Update logic runs every frame
 */
function update(delta, time) {
    // 1. Animate Crystal floating & rotation
    const player = engine.entities.player;
    if (player) {
        // Soft hover effect using sine wave
        player.position.y = 3.0 + Math.sin(time * 2.2) * 0.4;
        player.rotation.y += 0.6 * delta;
        player.rotation.x += 0.3 * delta;

        // Position the internal point light to follow the crystal height
        if (engine.entities.glowLight) {
            engine.entities.glowLight.position.y = player.position.y;
        }

        // 2. Perform Movement using WASD & Arrows
        let moveX = 0;
        let moveZ = 0;
        const movementSpeed = 16.0; // units/sec

        if (engine.inputs.w || engine.inputs.ArrowUp) moveZ -= 1;
        if (engine.inputs.s || engine.inputs.ArrowDown) moveZ += 1;
        if (engine.inputs.a || engine.inputs.ArrowLeft) moveX -= 1;
        if (engine.inputs.d || engine.inputs.ArrowRight) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
            // Normalize so diagonal speed isn't faster
            const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
            const dirX = moveX / len;
            const dirZ = moveZ / len;

            // Rotate input vector by -45 degrees (rad = -Math.PI / 4)
            // This aligns keyboard controls with the isometric screen projection
            const rad = -Math.PI / 4;
            const isoX = dirX * Math.cos(rad) - dirZ * Math.sin(rad);
            const isoZ = dirX * Math.sin(rad) + dirZ * Math.cos(rad);

            player.position.x += isoX * movementSpeed * delta;
            player.position.z += isoZ * movementSpeed * delta;

            // Boundary constraints
            player.position.x = Math.max(-28, Math.min(28, player.position.x));
            player.position.z = Math.max(-28, Math.min(28, player.position.z));
        }

        // 3. React to spacebar press
        if (engine.inputs.Space) {
            // Make crystal glow intensly & scale up surrounding ring
            player.material.emissiveIntensity = 1.2;
            if (engine.entities.glowRing) {
                engine.entities.glowRing.scale.lerp(new THREE.Vector3(1.6, 1.6, 1.6), 0.2);
                engine.entities.glowRing.material.color.setHex(0xff007f);
            }
            if (engine.entities.glowLight) {
                engine.entities.glowLight.intensity = 6;
            }
        } else {
            // Reset to idle pulsating glow
            player.material.emissiveIntensity = 0.25 + Math.sin(time * 6.0) * 0.15;
            if (engine.entities.glowRing) {
                engine.entities.glowRing.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.1);
                engine.entities.glowRing.material.color.setHex(0x00f0ff);
            }
            if (engine.entities.glowLight) {
                engine.entities.glowLight.intensity = 3 + Math.sin(time * 6.0) * 1.0;
            }
        }
    }

    // Spin the decorative floor ring
    if (engine.entities.glowRing) {
        engine.entities.glowRing.rotation.z -= 0.3 * delta;
    }

    // 4. Run external update hooks (for extension like ballistix.js)
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

    // Cap delta at 0.1s to avoid huge physics jumps when window is unfocused
    const delta = Math.min(engine.clock.getDelta(), 0.1);
    const time = engine.clock.getElapsedTime();

    // Call core engine updates (handles scene background / demo entities)
    update(delta, time);

    // Call active game updates if initialized
    if (window.activeGame && typeof window.activeGame.update === 'function') {
        window.activeGame.update(delta, engine.inputs);
    }

    engine.renderer.render(engine.scene, engine.camera);
}

// Start engine setup
window.addEventListener('DOMContentLoaded', init);

/**
 * Global function to switch between minigames dynamically
 * @param {string} gameName - Either 'ballistix' or 'dragondrop'
 */
function switchMinigame(gameName) {
    console.log(`switchMinigame: Switching to ${gameName}`);
    
    // 1. Destroy existing game if running
    if (window.activeGame) {
        try {
            window.activeGame.destroy();
        } catch (e) {
            console.error("Error destroying active game:", e);
        }
        window.activeGame = null;
    }

    // 2. Clear any active overlays (like game-over screens)
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.remove();

    // 3. Clear the scene of game-specific entities if destroy() missed them

    // 4. Update the header title and active button states in the UI
    const titleEl = document.getElementById('engine-title');
    const btnBallistix = document.getElementById('btn-play-ballistix');
    const btnDragonDrop = document.getElementById('btn-play-dragondrop');

    // 5. Hide/Show appropriate HTML HUD panels
    const ballistixHud = document.querySelector('.score-container');
    const ballistixControls = document.querySelector('.control-panel');
    const menuOverlay = document.getElementById('menu-overlay');

    // Fade out the menu overlay when a game is launched
    if (menuOverlay) {
        menuOverlay.style.opacity = '0';
        menuOverlay.style.pointerEvents = 'none';
    }

    if (gameName === 'ballistix') {
        if (titleEl) titleEl.textContent = "Ballistix";
        if (btnBallistix) btnBallistix.classList.add('active');
        if (btnDragonDrop) btnDragonDrop.classList.remove('active');

        if (ballistixHud) ballistixHud.style.display = 'flex';
        if (ballistixControls) ballistixControls.style.display = 'flex';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "Use A/D or Left/Right Arrow keys to slide the paddle. Keep the ball bouncing inside the arena!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "Ballistix Game";
        }

        if (window.BallistixGame) {
            window.activeGame = new window.BallistixGame();
            window.activeGame.setup();
        } else {
            console.error("BallistixGame class not found on window object.");
        }
    } else if (gameName === 'dragondrop') {
        if (titleEl) titleEl.textContent = "Dragon Drop";
        if (btnDragonDrop) btnDragonDrop.classList.add('active');
        if (btnBallistix) btnBallistix.classList.remove('active');

        if (ballistixHud) ballistixHud.style.display = 'none';
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Update instructions
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "Use WASD/Arrows to move the Dragon. Stand in outer concentric rings to increase multiplier (up to 3x)! Collide with jewels to pick them up, and press Spacebar to shoot them towards the moving target.";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "Dragon Drop Game";
        }

        if (window.DragonDropGame) {
            window.activeGame = new window.DragonDropGame();
        } else {
            console.error("DragonDropGame class not found on window object.");
        }
    }
}

// Expose globally
window.switchMinigame = switchMinigame;

// Standby on window load
window.addEventListener('load', () => {
    console.log("Arcadia engine ready. Standing by for minigame selection.");
});
