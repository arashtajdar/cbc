import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { launcherState } from "./LauncherState.js";
import { inputs, setupInputHandling } from "./InputManager.js";
import { transitionToState, setupLauncherDOM } from "./UIManager.js";

export const SceneManager = {
    scene: null,
    camera: null,
    renderer: null,
    container: null,
    clock: null,
    lights: {},
    entities: {},
    updateCallbacks: [],
    activeGameInstance: null,
    inputs: inputs,

    init: function() {
        this.container = document.getElementById("canvas-container");
        if (!this.container) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0c14);
        this.scene.fog = new THREE.FogExp2(0x0a0c14, 0.015);

        this.camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 1000);
        this.camera.position.set(30, 35, 30);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.container.appendChild(this.renderer.domElement);
        this.clock = new THREE.Clock();

        this.lights.ambient = new THREE.AmbientLight(0x2a3350, 1.5);
        this.scene.add(this.lights.ambient);

        this.lights.directional = new THREE.DirectionalLight(0xffedd8, 2.5);
        this.lights.directional.position.set(25, 40, 15);
        this.lights.directional.castShadow = true;
        this.lights.directional.shadow.mapSize.width = 2048;
        this.lights.directional.shadow.mapSize.height = 2048;
        this.lights.directional.shadow.camera.near = 0.5;
        this.lights.directional.shadow.camera.far = 100;
        const d = 30;
        this.lights.directional.shadow.camera.left = -d;
        this.lights.directional.shadow.camera.right = d;
        this.lights.directional.shadow.camera.top = d;
        this.lights.directional.shadow.camera.bottom = -d;
        this.lights.directional.shadow.bias = -0.0005;
        this.scene.add(this.lights.directional);

        this.lights.cyanRim = new THREE.DirectionalLight(0x00f0ff, 1.8);
        this.lights.cyanRim.position.set(-25, 10, -25);
        this.scene.add(this.lights.cyanRim);

        this.createSceneEnvironment();
        setupInputHandling();
        window.addEventListener("resize", () => this.handleResize());
        setupLauncherDOM();

        let startingState = "SPLASH";
        if (typeof localStorage !== "undefined") {
            try {
                const saved = localStorage.getItem("launcherState");
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.selectedGame) launcherState.selectedGame = parsed.selectedGame;
                    if (parsed.selectedArena) launcherState.selectedArena = parsed.selectedArena;
                    if (parsed.playerAssignments) launcherState.playerAssignments = parsed.playerAssignments;
                    if (parsed.aiDifficulty) launcherState.aiDifficulty = parsed.aiDifficulty;
                    if (parsed.currentState && parsed.currentState !== "SPLASH") {
                        startingState = parsed.currentState === "GAMEPLAY" ? "GAME_SELECT" : parsed.currentState;
                    }
                }
            } catch (e) {
                console.warn("Error loading saved state:", e);
            }
        }
        transitionToState(startingState);

        this.animate = this.animate.bind(this);
        this.animate();
    },

    createSceneEnvironment: function() {
        if (!this.entities.ground) {
            const groundGeo = new THREE.PlaneGeometry(100, 100);
            const groundMat = new THREE.MeshStandardMaterial({ color: 0x0f111a, roughness: 0.85, metalness: 0.2 });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            this.scene.add(ground);
            this.entities.ground = ground;
        } else {
            this.scene.add(this.entities.ground);
        }

        if (!this.entities.grid) {
            const grid = new THREE.GridHelper(60, 30, 0x00f0ff, 0x1d243a);
            grid.position.y = 0.01;
            this.scene.add(grid);
            this.entities.grid = grid;
        } else {
            this.scene.add(this.entities.grid);
        }

        const crystalGeo = new THREE.OctahedronGeometry(2, 0);
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0xff007f, roughness: 0.1, metalness: 0.9, emissive: 0xff007f, emissiveIntensity: 0.25 });
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        crystal.position.set(0, 3, 0);
        crystal.castShadow = true;
        crystal.receiveShadow = true;
        this.scene.add(crystal);
        this.entities.player = crystal;

        const ringGeo = new THREE.RingGeometry(3.8, 4.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        this.scene.add(ring);
        this.entities.glowRing = ring;

        const glowLight = new THREE.PointLight(0xff007f, 3, 15);
        glowLight.position.set(0, 3, 0);
        glowLight.castShadow = false;
        this.scene.add(glowLight);
        this.entities.glowLight = glowLight;
    },

    removeSceneEnvironment: function() {
        if (this.entities.player) {
            this.scene.remove(this.entities.player);
            this.entities.player = null;
        }
        if (this.entities.glowRing) {
            this.scene.remove(this.entities.glowRing);
            this.entities.glowRing = null;
        }
        if (this.entities.glowLight) {
            this.scene.remove(this.entities.glowLight);
            this.entities.glowLight = null;
        }
        if (this.entities.ground) {
            this.scene.remove(this.entities.ground);
        }
        if (this.entities.grid) {
            this.scene.remove(this.entities.grid);
        }
    },

    restoreSceneEnvironment: function() {
        this.createSceneEnvironment();
    },

    handleResize: function() {
        if (!this.container || !this.camera || !this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },

    update: function(delta, time) {
        if (launcherState.currentState !== "GAMEPLAY") {
            const player = this.entities.player;
            if (player) {
                player.position.y = 3.0 + Math.sin(time * 2.2) * 0.4;
                player.rotation.y += 0.6 * delta;
                player.rotation.x += 0.3 * delta;
                if (this.entities.glowLight) this.entities.glowLight.position.y = player.position.y;
            }
            if (this.entities.glowRing) this.entities.glowRing.rotation.z -= 0.3 * delta;
        }

        for (const callback of this.updateCallbacks) {
            try {
                callback(delta, time);
            } catch (e) {
                console.error("Error in update callback: ", e);
            }
        }
    },

    animate: function() {
        requestAnimationFrame(this.animate);
        if (!this.clock || !this.scene || !this.camera || !this.renderer) return;

        const delta = Math.min(this.clock.getDelta(), 0.1);
        const time = this.clock.getElapsedTime();

        this.update(delta, time);

        if (this.activeGameInstance && typeof this.activeGameInstance.update === "function") {
            this.activeGameInstance.update(delta, inputs);
        }

        this.renderer.render(this.scene, this.camera);
    },

    mountGame: async function(gameId) {
        if (this.activeGameInstance) {
            if (typeof this.activeGameInstance.destroy === "function") {
                this.activeGameInstance.destroy();
            }
            this.activeGameInstance = null;
            this.updateCallbacks = [];
        }

        this.removeSceneEnvironment();

        const p1Color = launcherState.characters[launcherState.playerAssignments.p1].hex;

        let GameClass = null;
        switch(gameId) {
            case "deflecto":
                const { default: DeflectoGame } = await import("../games/DeflectoGame.js");
                GameClass = DeflectoGame;
                break;
            case "tilefall":
                const { default: TileFallGame } = await import("../games/TileFallGame.js");
                GameClass = TileFallGame;
                break;
            case "boxbrawl":
                const { default: BoxBrawlGame } = await import("../games/BoxBrawlGame.js");
                GameClass = BoxBrawlGame;
                break;
            case "slideout":
                const { default: SlideOutGame } = await import("../games/SlideOutGame.js");
                GameClass = SlideOutGame;
                break;
            case "bounceclaim":
                const { default: BounceClaimGame } = await import("../games/BounceClaimGame.js");
                GameClass = BounceClaimGame;
                break;
            case "ricochet":
                const { default: RicochetGame } = await import("../games/RicochetGame.js");
                GameClass = RicochetGame;
                break;
            case "kineticring":
                const { default: KineticRingGame } = await import("../games/KineticRingGame.js");
                GameClass = KineticRingGame;
                break;
            case "hexcollapse":
                const { default: HexCollapseGame } = await import("../games/HexCollapseGame.js");
                GameClass = HexCollapseGame;
                break;
            case "shrinkzone":
                const { default: ShrinkZoneGame } = await import("../games/ShrinkZoneGame.js");
                GameClass = ShrinkZoneGame;
                break;
            case "sweeper":
                const { default: SweeperGame } = await import("../games/SweeperGame.js");
                GameClass = SweeperGame;
                break;
            default:
                console.error("Unknown game ID:", gameId);
                return;
        }

        try {
            this.activeGameInstance = new GameClass("canvas-container", p1Color, launcherState.selectedArena);
            if (typeof this.activeGameInstance.init === "function") {
                this.activeGameInstance.init();
            }
        } catch (e) {
            console.error("Error mounting game:", e);
        }
    }
};
