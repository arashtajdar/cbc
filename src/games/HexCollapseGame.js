import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { SceneManager } from "../core/SceneManager.js";
import { launcherState } from "../core/LauncherState.js";
import { HexCollapseGameConfig } from "../config/HexCollapseGameConfig.js";


export default class HexCollapseGame {
    constructor(containerId, p1Color) {
        this.containerId = containerId;
        this.p1Color = p1Color || 0xff3333;

        window.HexCollapseGame = this.constructor;

        this.scene = SceneManager.scene;
        this.camera = SceneManager.camera;
        this.renderer = SceneManager.renderer;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.players = [];
        this.traps = [];

        this.arenaSize = HexCollapseGameConfig.gameplay.arenaSize;
        this.safeZoneSize = this.arenaSize;
        this.minSafeZoneSize = HexCollapseGameConfig.gameplay.minSafeZoneSize;
        this.shrinkRate = HexCollapseGameConfig.gameplay.shrinkRate; // Units per second

        this.isGameOver = false;
        this.trapSpawnTimer = HexCollapseGameConfig.gameplay.trapSpawnTimer;

        this.originalCameraPos = this.camera.position.clone();
        this.originalCameraRot = this.camera.rotation.clone();
        this.setupCamera();

        this.createEnvironment();
        this.createPlayers();

        this.updateCallbackId =
            SceneManager.updateCallbacks.push((dt, time) => {
                this.updateParticles(dt);
            }) - 1;

        console.log('Toxic Trap initialized!');
    }

    setupCamera() {
        this.camera.position.set(0, 35, 30);
        this.camera.lookAt(0, 0, 0);
    }

    createEnvironment() {
        // Floor
        const floorGeo = new THREE.PlaneGeometry(this.arenaSize, this.arenaSize);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x333344,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.group.add(floor);

        // Toxic Storm Ring
        const stormGeo = new THREE.PlaneGeometry(this.arenaSize * 2, this.arenaSize * 2);
        // Create a basic material with a hole using alpha map, or simply construct a shape
        const stormShape = new THREE.Shape();
        stormShape.moveTo(-this.arenaSize, -this.arenaSize);
        stormShape.lineTo(this.arenaSize, -this.arenaSize);
        stormShape.lineTo(this.arenaSize, this.arenaSize);
        stormShape.lineTo(-this.arenaSize, this.arenaSize);
        stormShape.lineTo(-this.arenaSize, -this.arenaSize);

        const hole = new THREE.Path();
        const hs = this.safeZoneSize / 2;
        hole.moveTo(-hs, -hs);
        hole.lineTo(-hs, hs);
        hole.lineTo(hs, hs);
        hole.lineTo(hs, -hs);
        hole.lineTo(-hs, -hs);
        stormShape.holes.push(hole);

        const extrudeSettings = { depth: 0.1, bevelEnabled: false };
        const stormGeom = new THREE.ExtrudeGeometry(stormShape, extrudeSettings);

        this.stormMat = new THREE.MeshBasicMaterial({
            color: 0x22ff22,
            transparent: true,
            opacity: 0.4
        });
        this.stormMesh = new THREE.Mesh(stormGeom, this.stormMat);
        this.stormMesh.rotation.x = -Math.PI / 2;
        this.stormMesh.position.y = 0.1;
        this.group.add(this.stormMesh);

        // Boundaries walls
        const wallGeo = new THREE.BoxGeometry(this.arenaSize, 4, 1);
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x222233 });

        const w1 = new THREE.Mesh(wallGeo, wallMat);
        w1.position.set(0, 2, -this.arenaSize / 2 - 0.5);
        const w2 = new THREE.Mesh(wallGeo, wallMat);
        w2.position.set(0, 2, this.arenaSize / 2 + 0.5);
        const w3 = new THREE.Mesh(wallGeo, wallMat);
        w3.rotation.y = Math.PI / 2;
        w3.position.set(-this.arenaSize / 2 - 0.5, 2, 0);
        const w4 = new THREE.Mesh(wallGeo, wallMat);
        w4.rotation.y = Math.PI / 2;
        w4.position.set(this.arenaSize / 2 + 0.5, 2, 0);

        this.group.add(w1, w2, w3, w4);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.group.add(ambientLight);
    }

    createPlayers() {
        const startPositions = [
            new THREE.Vector3(-10, 1, 10),
            new THREE.Vector3(10, 1, 10),
            new THREE.Vector3(10, 1, -10),
            new THREE.Vector3(-10, 1, -10)
        ];

        const colors = [this.p1Color, 0x39ff14, 0x00f0ff, 0xb026ff];

        for (let i = 0; i < 4; i++) {
            const isHuman = i === 0;
            const radius = 0.6;
            const geo = new THREE.CylinderGeometry(radius, radius, 1.8, 16);
            const mat = new THREE.MeshStandardMaterial({
                color: colors[i],
                roughness: 0.4,
                metalness: 0.6,
                emissive: colors[i],
                emissiveIntensity: 0.2
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.copy(startPositions[i]);
            this.group.add(mesh);

            this.players.push({
                id: i,
                isHuman: isHuman,
                mesh: mesh,
                baseColor: colors[i],
                mat: mat,
                velocity: new THREE.Vector3(0, 0, 0),
                speed: 14.0,
                radius: radius,
                isDead: false,
                hp: 100,
                maxHp: 100
            });
        }
    }

    update(dt, inputs) {
        if (this.isGameOver) return;

        let aliveCount = 0;
        let lastAliveId = -1;

        // Shrink Zone
        if (this.safeZoneSize > this.minSafeZoneSize) {
            this.safeZoneSize -= this.shrinkRate * dt;
        }
        this.updateStormMesh();

        // Spawn Traps
        this.trapSpawnTimer -= dt;
        if (this.trapSpawnTimer <= 0) {
            this.spawnRandomTrap();
            this.trapSpawnTimer = 1.5 + Math.random() * 1.5;
        }

        // Update Traps
        this.traps.forEach((t, index) => {
            t.life -= dt;
            if (t.type === 'spike') {
                t.animTimer += dt;
                // Pop up every 3 seconds
                if (t.animTimer > 3.0) {
                    t.mesh.position.y = 0.5; // Pop up
                    t.mesh.material.color.setHex(0xff0000);
                    setTimeout(() => {
                        if (t.mesh) {
                            t.mesh.position.y = 0.05; // Go down
                            t.mesh.material.color.setHex(0x555555);
                        }
                    }, 500);
                    t.animTimer = 0;
                    t.activeFrame = 0.5; // active for 0.5s
                }
                if (t.activeFrame > 0) t.activeFrame -= dt;
            } else if (t.type === 'flame') {
                // Flicker
                t.mesh.scale.y = 1 + Math.random() * 0.2;
            }

            if (t.life <= 0) {
                this.group.remove(t.mesh);
                t.mesh.geometry.dispose();
                t.mesh.material.dispose();
                this.traps[index] = null;
            }
        });
        this.traps = this.traps.filter(t => t !== null);

        // Update Players
        this.players.forEach(p => {
            if (p.isDead) return;

            aliveCount++;
            lastAliveId = p.id;

            let moveDir = new THREE.Vector3();

            if (p.isHuman) {
                if (inputs.w || inputs.ArrowUp) moveDir.z -= 1;
                if (inputs.s || inputs.ArrowDown) moveDir.z += 1;
                if (inputs.a || inputs.ArrowLeft) moveDir.x -= 1;
                if (inputs.d || inputs.ArrowRight) moveDir.x += 1;

                if (moveDir.length() > 0) moveDir.normalize();
            } else {
                this.updateAI(p, dt);
                moveDir.copy(p.velocity).normalize();
            }

            // Apply movement
            if (p.isHuman) {
                p.velocity.x = moveDir.x * p.speed;
                p.velocity.z = moveDir.z * p.speed;
            }
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

            // Arena bounds collision
            const halfArena = this.arenaSize / 2 - p.radius;
            p.mesh.position.x = Math.max(-halfArena, Math.min(halfArena, p.mesh.position.x));
            p.mesh.position.z = Math.max(-halfArena, Math.min(halfArena, p.mesh.position.z));

            // Perimeter Damage Resolution
            const halfSafe = this.safeZoneSize / 2;
            let inStorm = false;
            if (
                p.mesh.position.x < -halfSafe ||
                p.mesh.position.x > halfSafe ||
                p.mesh.position.z < -halfSafe ||
                p.mesh.position.z > halfSafe
            ) {
                inStorm = true;
                p.hp -= 10 * dt; // -10 HP per second
            }

            // Trap Damage Resolution
            let inFlame = false;
            this.traps.forEach(t => {
                const distSq = (p.mesh.position.x - t.x) ** 2 + (p.mesh.position.z - t.z) ** 2;
                if (distSq < (p.radius + t.radius) ** 2) {
                    if (t.type === 'flame') {
                        inFlame = true;
                        p.hp -= 15 * dt; // 15 dmg per second
                    } else if (t.type === 'spike' && t.activeFrame > 0 && !p.spikeHitRecently) {
                        p.hp -= 30; // 30 instant dmg
                        p.spikeHitRecently = true;
                        setTimeout(() => (p.spikeHitRecently = false), 1000); // 1s invuln to spike
                    }
                }
            });

            // Tinting
            if (inStorm) {
                p.mat.color.setHex(0x22ff22);
            } else if (inFlame) {
                p.mat.color.setHex(0xffaa00);
            } else {
                p.mat.color.setHex(p.baseColor);
            }

            // Health check
            if (p.hp <= 0) {
                p.isDead = true;
                this.group.remove(p.mesh);
            }

            // Sync UI HUD if possible (optional, if elements exist)
            this.updatePlayerHUD(p);
        });

        if (aliveCount <= 1) {
            this.triggerGameOver(lastAliveId);
        }
    }

    spawnRandomTrap() {
        const type = Math.random() > 0.5 ? 'flame' : 'spike';
        // Random position within arena bounds
        const half = this.arenaSize / 2 - 2;
        const x = (Math.random() - 0.5) * 2 * half;
        const z = (Math.random() - 0.5) * 2 * half;

        let mesh;
        let radius = 1.5;
        if (type === 'flame') {
            const geo = new THREE.CylinderGeometry(radius, radius, 4, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xff4400,
                transparent: true,
                opacity: 0.8
            });
            mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, 2, z);
        } else {
            const geo = new THREE.BoxGeometry(radius * 2, 0.2, radius * 2);
            const mat = new THREE.MeshStandardMaterial({ color: 0x555555 });
            mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, 0.05, z);
        }

        this.group.add(mesh);

        this.traps.push({
            type: type,
            mesh: mesh,
            x: x,
            z: z,
            radius: radius,
            life: 10.0 + Math.random() * 5.0, // Last 10-15 seconds
            animTimer: Math.random() * 2.0, // Offset spike timing
            activeFrame: 0
        });
    }

    updateStormMesh() {
        if (!this.stormMesh) return;
        this.group.remove(this.stormMesh);
        this.stormMesh.geometry.dispose();

        const stormShape = new THREE.Shape();
        stormShape.moveTo(-this.arenaSize, -this.arenaSize);
        stormShape.lineTo(this.arenaSize, -this.arenaSize);
        stormShape.lineTo(this.arenaSize, this.arenaSize);
        stormShape.lineTo(-this.arenaSize, this.arenaSize);
        stormShape.lineTo(-this.arenaSize, -this.arenaSize);

        const hole = new THREE.Path();
        const hs = this.safeZoneSize / 2;
        hole.moveTo(-hs, -hs);
        hole.lineTo(-hs, hs);
        hole.lineTo(hs, hs);
        hole.lineTo(hs, -hs);
        hole.lineTo(-hs, -hs);
        stormShape.holes.push(hole);

        const extrudeSettings = { depth: 0.1, bevelEnabled: false };
        const stormGeom = new THREE.ExtrudeGeometry(stormShape, extrudeSettings);

        this.stormMesh = new THREE.Mesh(stormGeom, this.stormMat);
        this.stormMesh.rotation.x = -Math.PI / 2;
        this.stormMesh.position.y = 0.1;
        this.group.add(this.stormMesh);
    }

    updatePlayerHUD(p) {
        let elId;
        if (p.id === 0) elId = 'life-val-player';
        else if (p.id === 1) elId = 'life-val-top';
        else if (p.id === 2) elId = 'life-val-left';
        else if (p.id === 3) elId = 'life-val-right';

        const el = document.getElementById(elId);
        if (el) {
            el.textContent = Math.max(0, Math.ceil(p.hp));
            if (p.hp <= 30) el.style.color = '#ff0000';
            else el.style.color = '';
        }
    }

    updateAI(p, dt) {
        // AI Logic: Prioritize path towards absolute center, detouring active dangers
        const center = new THREE.Vector3(0, 0, 0);
        let targetPos = center.clone();

        // 1. Am I outside or near the edge of the safe zone?
        const halfSafe = this.safeZoneSize / 2;
        const distToSafeEdgeX = halfSafe - Math.abs(p.mesh.position.x);
        const distToSafeEdgeZ = halfSafe - Math.abs(p.mesh.position.z);

        let moveDir = new THREE.Vector3(0, 0, 0);

        if (distToSafeEdgeX < 2 || distToSafeEdgeZ < 2) {
            // Strongly pull towards center
            moveDir.copy(center).sub(p.mesh.position).normalize().multiplyScalar(2.0);
        } else {
            // Generally pull to center
            moveDir.copy(center).sub(p.mesh.position).normalize().multiplyScalar(0.5);
        }

        // 2. Detour around traps
        this.traps.forEach(t => {
            const trapPos = new THREE.Vector3(t.x, 0, t.z);
            const dist = p.mesh.position.distanceTo(trapPos);

            // Flee radius
            if (dist < t.radius + 3.0) {
                // If it's a spike that is dormant, maybe ignore?
                if (t.type === 'spike' && t.animTimer < 2.0 && t.activeFrame <= 0) {
                    // Safe for now
                } else {
                    const fleeDir = p.mesh.position.clone().sub(trapPos).normalize();
                    const fleeWeight = 1.0 / (dist + 0.1); // Stronger closer
                    moveDir.add(fleeDir.multiplyScalar(fleeWeight * 5.0));
                }
            }
        });

        if (moveDir.length() > 0) {
            moveDir.normalize();
        }

        let diff = launcherState?.aiDifficulty || 'normal';
        let mult = diff === 'easy' ? 0.5 : (diff === 'hard' ? 1.1 : 0.85);
        p.velocity.x = moveDir.x * p.speed * mult; // AI scaled by difficulty
        p.velocity.z = moveDir.z * p.speed * mult;
    }

    updateParticles(dt) {
        // Optional particles for traps
    }

    triggerGameOver(winnerId) {
        if (this.isGameOver) return;
        this.isGameOver = true;

        const winnerName =
            winnerId === 0 ? 'Player 1' : winnerId > 0 ? `AI Bot ${winnerId}` : 'Nobody';
        const winnerColor = winnerId === 0 ? '#ff3333' : '#aaaaaa';

        const overlay = document.createElement('div');
        overlay.id = 'game-over-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(10, 12, 20, 0.85)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '1000';
        overlay.style.color = '#fff';
        overlay.style.fontFamily = "'Outfit', sans-serif";

        overlay.innerHTML = `
            <h1 style="font-size: 4rem; margin-bottom: 10px; text-shadow: 0 0 20px ${winnerColor}; color: ${winnerColor}">SURVIVED!</h1>
            <h2 style="font-size: 2rem; margin-bottom: 30px;">${winnerName} avoided the toxicity!</h2>
            <div style="display: flex; gap: 20px;">
                <button id="btn-replay" class="menu-btn primary-btn" style="width: 200px;">Play Again</button>
                <button id="btn-exit" class="menu-btn" style="width: 200px;">Exit to Launcher</button>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('btn-replay').addEventListener('click', () => {
            this.resetGame();
        });
        document.getElementById('btn-exit').addEventListener('click', () => {
            window.exitToLauncher();
        });
    }

    resetGame() {
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.remove();

        this.traps.forEach(t => {
            if (t) {
                this.group.remove(t.mesh);
                t.mesh.geometry.dispose();
                t.mesh.material.dispose();
            }
        });
        this.traps = [];

        this.players.forEach(p => {
            if (!p.isDead) this.group.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();

            // reset UI
            this.updatePlayerHUD({ id: p.id, hp: 100 });
        });
        this.players = [];

        this.safeZoneSize = this.arenaSize;
        this.trapSpawnTimer = 0;

        // remove environment pieces to recreate
        const children = [...this.group.children];
        for (let c of children) {
            this.group.remove(c);
        }

        this.createEnvironment();
        this.createPlayers();
        this.isGameOver = false;
        this.setupCamera();
    }

    destroy() {
        if (this.updateCallbackId !== undefined) {
            SceneManager.updateCallbacks.splice(this.updateCallbackId, 1);
        }

        this.group.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.isMaterial) {
                    child.material.dispose();
                } else if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                }
            }
        });
        this.scene.remove(this.group);

        this.camera.position.copy(this.originalCameraPos);
        this.camera.rotation.copy(this.originalCameraRot);
        this.camera.lookAt(0, 0, 0);

        // Reset HUDs
        ['life-val-player', 'life-val-top', 'life-val-left', 'life-val-right'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '15';
                el.style.color = '';
            }
        });

        console.log('Toxic Trap destroyed');
    }
}


