import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { SceneManager } from "../core/SceneManager.js";
import { launcherState } from "../core/LauncherState.js";
import { KineticRingGameConfig } from "../config/KineticRingGameConfig.js";


export default class KineticRingGame {
    constructor(containerId, p1Color) {
        this.containerId = containerId;
        this.p1Color = p1Color || 0xff3333;

        // Expose to window for engine to call
        window.KineticRingGame = this.constructor;

        this.scene = SceneManager.scene;
        this.camera = SceneManager.camera;
        this.renderer = SceneManager.renderer;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.players = [];
        this.projectiles = []; // Not used here, but keeping consistent arrays if needed
        this.particles = [];

        this.arenaRadius = KineticRingGameConfig.gameplay.arenaRadius;
        this.isGameOver = false;

        // Camera setup
        this.originalCameraPos = this.camera.position.clone();
        this.originalCameraRot = this.camera.rotation.clone();
        this.setupCamera();

        this.createEnvironment();
        this.createPlayers();

        // Add to engine update loop
        this.updateCallbackId =
            SceneManager.updateCallbacks.push((dt, time) => {
                // Usually update is called directly by engine if window.activeGame == this
                // We'll rely on the main engine update loop for particles, etc.
                this.updateParticles(dt);
            }) - 1;

        console.log('Ring Ruckus initialized!');
    }

    setupCamera() {
        // Dynamic isometric tracking angle
        this.camera.position.set(0, 25, 25);
        this.camera.lookAt(0, 0, 0);
    }

    createEnvironment() {
        // Circular, elevated concrete platform
        const platformGeo = new THREE.CylinderGeometry(
            this.arenaRadius,
            this.arenaRadius + 1,
            2,
            64
        );
        const platformMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.9,
            metalness: 0.1
        });
        const platform = new THREE.Mesh(platformGeo, platformMat);
        platform.position.y = -1;
        platform.receiveShadow = true;
        this.group.add(platform);

        // Boundary line ring texture
        const ringGeo = new THREE.RingGeometry(this.arenaRadius - 0.5, this.arenaRadius, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        this.group.add(ring);

        // Water/Void below
        const voidGeo = new THREE.PlaneGeometry(200, 200);
        const voidMat = new THREE.MeshBasicMaterial({ color: 0x0a0c14 });
        const voidMesh = new THREE.Mesh(voidGeo, voidMat);
        voidMesh.rotation.x = -Math.PI / 2;
        voidMesh.position.y = -15;
        this.group.add(voidMesh);

        // Lighting specifics
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.group.add(ambientLight);
    }

    createPlayers() {
        const startPositions = [
            new THREE.Vector3(0, 1, 8),
            new THREE.Vector3(0, 1, -8),
            new THREE.Vector3(8, 1, 0),
            new THREE.Vector3(-8, 1, 0)
        ];

        const colors = [
            this.p1Color,
            0x39ff14, // P2
            0x00f0ff, // P3
            0xb026ff // P4
        ];

        for (let i = 0; i < 4; i++) {
            const isHuman = i === 0;
            const radius = 1.0;
            const geo = new THREE.SphereGeometry(radius, 32, 32);
            const mat = new THREE.MeshStandardMaterial({
                color: colors[i],
                roughness: 0.2,
                metalness: 0.8,
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
                velocity: new THREE.Vector3(0, 0, 0),
                acceleration: 20.0,
                maxSpeed: 15.0,
                friction: 0.96, // high inertia, slow brake times
                mass: 1.0,
                radius: radius,
                isDead: false,
                dashCooldown: 0,
                dashReady: true
            });
        }
    }

    update(dt, inputs) {
        if (this.isGameOver) return;

        let aliveCount = 0;
        let lastAliveId = -1;

        this.players.forEach(p => {
            if (p.isDead) return;

            aliveCount++;
            lastAliveId = p.id;

            if (p.dashCooldown > 0) {
                p.dashCooldown -= dt;
            } else {
                p.dashReady = true;
            }

            let moveDir = new THREE.Vector3();

            if (p.isHuman) {
                if (inputs.w || inputs.ArrowUp) moveDir.z -= 1;
                if (inputs.s || inputs.ArrowDown) moveDir.z += 1;
                if (inputs.a || inputs.ArrowLeft) moveDir.x -= 1;
                if (inputs.d || inputs.ArrowRight) moveDir.x += 1;

                if (moveDir.length() > 0) moveDir.normalize();

                if (inputs.Space && p.dashReady) {
                    this.dash(p, moveDir.length() > 0 ? moveDir : p.velocity.clone().normalize());
                }
            } else {
                this.updateAI(p, dt);
            }

            // Apply acceleration
            p.velocity.add(moveDir.multiplyScalar(p.acceleration * dt));

            // Apply friction (inertia)
            p.velocity.multiplyScalar(p.friction);

            // Cap speed
            if (p.velocity.length() > p.maxSpeed) {
                p.velocity.normalize().multiplyScalar(p.maxSpeed);
            }

            // Move
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

            // Rolling effect
            const rotationAxis = new THREE.Vector3(p.velocity.z, 0, -p.velocity.x).normalize();
            const rotationAngle = (p.velocity.length() * dt) / p.radius;
            if (p.velocity.length() > 0.1) {
                p.mesh.rotateOnWorldAxis(rotationAxis, rotationAngle);
            }

            // Gravity if falling off edge
            const distFromCenter = Math.sqrt(
                p.mesh.position.x * p.mesh.position.x + p.mesh.position.z * p.mesh.position.z
            );
            if (distFromCenter > this.arenaRadius) {
                p.velocity.y -= 30 * dt; // gravity
                p.mesh.position.y += p.velocity.y * dt;
            } else {
                p.mesh.position.y = p.radius; // keep on floor
                p.velocity.y = 0;
            }

            // Elimination
            if (p.mesh.position.y < -10) {
                p.isDead = true;
                this.group.remove(p.mesh);
            }
        });

        this.checkCollisions();

        if (aliveCount <= 1) {
            this.triggerGameOver(lastAliveId);
        }
    }

    updateAI(p, dt) {
        // AI logic: Stay near center, target opponents near edge
        const center = new THREE.Vector3(0, 0, 0);
        let targetPos = center.clone();

        // Find nearest opponent
        let nearestOpponent = null;
        let minOppDist = Infinity;

        this.players.forEach(opp => {
            if (opp.id === p.id || opp.isDead) return;
            const dist = p.mesh.position.distanceTo(opp.mesh.position);
            if (dist < minOppDist) {
                minOppDist = dist;
                nearestOpponent = opp;
            }
        });

        if (nearestOpponent) {
            const oppDistCenter = Math.sqrt(
                nearestOpponent.mesh.position.x ** 2 + nearestOpponent.mesh.position.z ** 2
            );
            if (oppDistCenter > this.arenaRadius * 0.5) {
                // Opponent is near edge, target them
                targetPos = nearestOpponent.mesh.position.clone();
            } else if (p.mesh.position.distanceTo(center) > this.arenaRadius * 0.6) {
                // If I'm near edge, go to center
                targetPos = center.clone();
            } else {
                // Otherwise move towards opponent but not aggressively
                targetPos = nearestOpponent.mesh.position.clone();
            }
        }

        const dirToTarget = targetPos.clone().sub(p.mesh.position).normalize();

        // Avoid falling off
        if (p.mesh.position.distanceTo(center) > this.arenaRadius * 0.8) {
            const dirToCenter = center.clone().sub(p.mesh.position).normalize();
            dirToTarget.lerp(dirToCenter, 0.8).normalize();
        }

        let diffSetting = launcherState?.aiDifficulty || 'normal';
        let accelMult = diffSetting === 'easy' ? 0.6 : (diffSetting === 'hard' ? 1.1 : 0.8);
        p.velocity.add(dirToTarget.multiplyScalar(p.acceleration * dt * accelMult)); // AI slightly lower accel

        // Dash logic
        let dashDist = diffSetting === 'easy' ? 3 : (diffSetting === 'hard' ? 7 : 5);
        if (nearestOpponent && minOppDist < dashDist && p.dashReady) {
            const myDistCenter = p.mesh.position.distanceTo(center);
            const dirToOpp = nearestOpponent.mesh.position.clone().sub(p.mesh.position).normalize();

            // Only dash if not facing the edge directly or near center
            const projectedPos = p.mesh.position.clone().add(dirToOpp.clone().multiplyScalar(5));
            if (projectedPos.distanceTo(center) < this.arenaRadius) {
                this.dash(p, dirToOpp);
            }
        }
    }

    dash(p, direction) {
        p.velocity.add(direction.normalize().multiplyScalar(25));
        p.dashReady = false;
        p.dashCooldown = 2.0;
        this.createDashEffect(p.mesh.position);
    }

    checkCollisions() {
        for (let i = 0; i < this.players.length; i++) {
            for (let j = i + 1; j < this.players.length; j++) {
                const p1 = this.players[i];
                const p2 = this.players[j];

                if (p1.isDead || p2.isDead) continue;

                // Only collide if both are on platform roughly
                if (p1.mesh.position.y < 0 || p2.mesh.position.y < 0) continue;

                const dist = p1.mesh.position.distanceTo(p2.mesh.position);
                const minDist = p1.radius + p2.radius;

                if (dist < minDist) {
                    // Elastic momentum conservation
                    const normal = new THREE.Vector3()
                        .subVectors(p2.mesh.position, p1.mesh.position)
                        .normalize();
                    const relVel = new THREE.Vector3().subVectors(p1.velocity, p2.velocity);
                    const speed = relVel.dot(normal);

                    if (speed > 0) {
                        const restitution = 1.2; // Bouncy
                        const impulse = ((1 + restitution) * speed) / (1 / p1.mass + 1 / p2.mass);

                        const impulseVec = normal.clone().multiplyScalar(impulse);

                        p1.velocity.sub(impulseVec.clone().multiplyScalar(1 / p1.mass));
                        p2.velocity.add(impulseVec.clone().multiplyScalar(1 / p2.mass));

                        // Separate to avoid overlap
                        const overlap = minDist - dist;
                        const separationVec = normal.clone().multiplyScalar(overlap / 2);
                        p1.mesh.position.sub(separationVec);
                        p2.mesh.position.add(separationVec);

                        this.createImpactEffect(
                            p1.mesh.position.clone().add(p2.mesh.position).multiplyScalar(0.5)
                        );
                    }
                }
            }
        }
    }

    createImpactEffect(pos) {
        for (let i = 0; i < 15; i++) {
            const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            this.group.add(mesh);

            this.particles.push({
                mesh: mesh,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 10,
                    Math.random() * 10,
                    (Math.random() - 0.5) * 10
                ),
                life: 1.0
            });
        }
    }

    createDashEffect(pos) {
        const ringGeo = new THREE.RingGeometry(1, 1.2, 16);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.position.y = 0.1;
        ring.rotation.x = -Math.PI / 2;
        this.group.add(ring);

        this.particles.push({
            mesh: ring,
            velocity: new THREE.Vector3(0, 0, 0),
            life: 0.5,
            scaleSpeed: 5,
            isRing: true
        });
    }

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.group.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
            } else {
                p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
                if (p.isRing) {
                    p.mesh.scale.addScalar(p.scaleSpeed * dt);
                    p.mesh.material.opacity = p.life * 2;
                } else {
                    p.velocity.y -= 15 * dt; // gravity
                    p.mesh.rotation.x += dt * 5;
                    p.mesh.rotation.y += dt * 5;
                }
            }
        }
    }

    triggerGameOver(winnerId) {
        if (this.isGameOver) return;
        this.isGameOver = true;

        const winnerName = winnerId === 0 ? 'Player 1' : `AI Bot ${winnerId}`;
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
            <h1 style="font-size: 4rem; margin-bottom: 10px; text-shadow: 0 0 20px ${winnerColor}; color: ${winnerColor}">VICTORY!</h1>
            <h2 style="font-size: 2rem; margin-bottom: 30px;">${winnerName} Wins the Ruckus!</h2>
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

        // Clear particles
        this.particles.forEach(p => {
            this.group.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.particles = [];

        // Remove old players
        this.players.forEach(p => {
            if (!p.isDead) this.group.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.players = [];

        this.createPlayers();
        this.isGameOver = false;
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

        // Restore camera
        this.camera.position.copy(this.originalCameraPos);
        this.camera.rotation.copy(this.originalCameraRot);
        this.camera.lookAt(0, 0, 0);

        console.log('Ring Ruckus destroyed');
    }
}

// Make globally available

