import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { SceneManager } from "../core/SceneManager.js";
import { launcherState } from "../core/LauncherState.js";
import * as CharacterBuilder from "../components/CharacterBuilder.js";
import { SlideOutGameConfig } from "../config/SlideOutGameConfig.js";

/**
 * POLAR PUSH gameplay logic
 * Standalone Three.js minigame class for "Polar Push".
 *
 * Features:
 * - Slippery ice platform floating in freezing water.
 * - custom momentum-based movement & friction sliding (velocity * 0.98).
 * - Dash / Ram mechanic (Spacebar for Human, systematic trigger for AI) with trail effect.
 * - Rigid elastic collisions with momentum transfer.
 * - Edge detection with gravity fall & water splash elimination.
 * - Target-focused AI that attempts to ram closest players off.
 * - Custom glassmorphic HUD and victory/defeat screens.
 */


export default class SlideOutGame {
    constructor(containerId, playerColor) {
        this.containerId = containerId || 'canvas-container';
        this.playerColor = playerColor !== undefined ? playerColor : 0xff3333;

        this.gameOver = false;
        this.platformRadius = SlideOutGameConfig.gameplay.platformRadius;

        // Groups & Pools
        this.arenaGroup = null;
        this.players = [];
        this.particles = [];
        this.decorFloes = [];

        this.spacePressedLastFrame = false;
        this.originalCameraPos = null;
    }

    init() {
        const engine = SceneManager;
        if (!engine) {
            console.error('PolarPush: engine.js not found in global context!');
            return;
        }

        // 1. Store original camera position to restore on exit
        this.originalCameraPos = engine.camera.position.clone();

        // Set dramatic tilted top-down angle looking down at platform
        engine.camera.position.set(SlideOutGameConfig.camera.position.x, SlideOutGameConfig.camera.position.y, SlideOutGameConfig.camera.position.z);
        engine.camera.lookAt(SlideOutGameConfig.camera.lookAt.x, SlideOutGameConfig.camera.lookAt.y, SlideOutGameConfig.camera.lookAt.z);

        // 2. Coordinate Group aligned to the isometric perspective
        this.arenaGroup = new THREE.Group();
        this.arenaGroup.rotation.y = -Math.PI / 4;
        engine.scene.add(this.arenaGroup);

        // 3. Ice Platform Slab (Circular Cylinder)
        const iceGeo = new THREE.CylinderGeometry(
            this.platformRadius,
            this.platformRadius,
            1.0,
            32
        );
        const iceMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff, // Frosty pale blue
            roughness: 0.05, // Glossy / highly reflective
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
        });
        const platform = new THREE.Mesh(iceGeo, iceMat);
        platform.position.set(0, -0.5, 0); // top surface is at Y = 0
        platform.receiveShadow = true;
        this.arenaGroup.add(platform);

        // Subtly glowing outer rim for the ice platform
        const rimGeo = new THREE.RingGeometry(
            this.platformRadius - 0.1,
            this.platformRadius + 0.1,
            64
        );
        const rimMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.02;
        this.arenaGroup.add(rim);

        // 4. Dark Freezing Water Plane
        const waterGeo = new THREE.PlaneGeometry(120, 120);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x030814, // Deep freezing black-blue
            roughness: 0.2,
            metalness: 0.8
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -1.2; // Placed below the ice slab
        water.receiveShadow = true;
        this.arenaGroup.add(water);

        // 5. Decorative Floating Ice Floes
        for (let i = 0; i < 6; i++) {
            const size = 1.2 + Math.random() * 1.8;
            const floeGeo = new THREE.CylinderGeometry(size, size, 0.4, 6); // Hexagonal floes
            const floeMat = new THREE.MeshStandardMaterial({
                color: 0xbbdfff,
                roughness: 0.1,
                metalness: 0.1,
                transparent: true,
                opacity: 0.8
            });
            const floe = new THREE.Mesh(floeGeo, floeMat);

            const angle = Math.random() * Math.PI * 2;
            const dist = 16 + Math.random() * 8;
            floe.position.set(Math.cos(angle) * dist, -1.0, Math.sin(angle) * dist);
            floe.rotation.y = Math.random() * Math.PI;
            this.arenaGroup.add(floe);
            this.decorFloes.push({
                mesh: floe,
                rotSpeed: (Math.random() - 0.5) * 0.15,
                bobSpeed: 1.2 + Math.random() * 1.5,
                bobOffset: Math.random() * Math.PI,
                baseY: -1.0
            });
        }

        // 6. Initialize Players (Human + 3 AIs)
        this.spawnPlayers();

        // 7. Create dynamic custom HUD
        this.createHUD();

        // 8. Hook update logic into engine loops
        engine.updateCallbacks.push((dt, time) => {
            this.update(dt, engine.inputs);
        });
    }

    spawnPlayers() {
        const state = launcherState;
        const assignments = state.playerAssignments;
        const chars = state.characters;

        const positions = [
            { x: -5, z: 5 }, // P1 (Bottom Left)
            { x: -5, z: -5 }, // P2 (Top Left, AI)
            { x: 5, z: -5 }, // P3 (Top Right, AI)
            { x: 5, z: 5 } // P4 (Bottom Right, AI)
        ];

        const playerKeys = ['p1', 'p2', 'p3', 'p4'];

        playerKeys.forEach((key, idx) => {
            const charIdx = assignments[key];
            const charData = chars[charIdx];
            const pos = positions[idx];

            const isP1 = idx === 0;
            const pColor = isP1 ? this.playerColor : charData.color;

            let meshY = 0;
            const mesh = CharacterBuilder.create(charData.shape, pColor);
            mesh.position.set(pos.x, meshY, pos.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.arenaGroup.add(mesh);

            // Add glowing point light on players
            const light = new THREE.PointLight(pColor, 2.5, 6);
            mesh.add(light);

            this.players.push({
                id: idx + 1,
                name: idx === 0 ? 'Player 1' : `Opponent ${idx}`,
                mesh: mesh,
                shape: charData.shape,
                color: pColor,
                hex: isP1 ? '#' + pColor.toString(16).padStart(6, '0') : charData.hex,
                isAI: idx > 0,
                isDead: false,
                isEliminated: false,
                isOnIce: true,
                facingAngle: idx === 0 ? 0 : Math.PI,
                vx: 0,
                vy: 0,
                vz: 0,
                isDashing: false,
                dashTimer: 0,
                dashCooldown: 0,
                trailTimer: 0,
                meshY: meshY
            });
        });
    }

    createHUD() {
        // Hide other HUD elements
        const ballistixHud = document.querySelector('.score-container');
        if (ballistixHud) ballistixHud.style.display = 'none';
        const ballistixControls = document.querySelector('.control-panel');
        if (ballistixControls) ballistixControls.style.display = 'none';

        const existing = document.getElementById('polarpush-hud');
        if (existing) existing.remove();

        const hud = document.createElement('div');
        hud.id = 'polarpush-hud';
        hud.style.position = 'absolute';
        hud.style.top = '30px';
        hud.style.left = '50%';
        hud.style.transform = 'translateX(-50%)';
        hud.style.zIndex = '10';
        hud.style.background = 'rgba(10, 15, 30, 0.7)';
        hud.style.border = '1px solid rgba(0, 240, 255, 0.15)';
        hud.style.backdropFilter = 'blur(16px)';
        hud.style.webkitBackdropFilter = 'blur(16px)';
        hud.style.padding = '12px 28px';
        hud.style.borderRadius = '18px';
        hud.style.display = 'flex';
        hud.style.gap = '25px';
        hud.style.alignItems = 'center';
        hud.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 240, 255, 0.15)';
        hud.style.fontFamily = "'Outfit', sans-serif";
        hud.style.color = '#ffffff';

        let innerHTML = '';
        this.players.forEach(p => {
            innerHTML += `
                <div id="hud-player-card-${p.id}" style="display: flex; flex-direction: column; width: 110px; align-items: center; gap: 4px; transition: all 0.5s ease;">
                    <div style="font-size: 0.65rem; color: #a0aec0; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">${p.name}</div>
                    <div id="hud-name-${p.id}" style="font-family: 'Space Grotesk', sans-serif; font-size: 0.85rem; font-weight: 700; color: ${p.hex}; text-transform: uppercase;">${p.isAI ? 'AI' : 'Human'}</div>
                    
                    <!-- Status Label -->
                    <div id="hud-status-${p.id}" style="font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: rgba(57, 255, 20, 0.15); color: #39ff14; text-shadow: 0 0 4px #39ff14; border: 1px solid rgba(57, 255, 20, 0.3); margin-top: 4px; min-width: 60px; text-align: center;">
                        ALIVE
                    </div>
                    
                    <!-- Dash Cooldown Fill -->
                    <div id="hud-dash-meter-${p.id}" style="width: 100%; height: 4px; background: rgba(0,0,0,0.5); border-radius: 2px; overflow: hidden; margin-top: 6px;">
                        <div id="hud-dash-fill-${p.id}" style="width: 100%; height: 100%; background: #00f0ff; box-shadow: 0 0 6px #00f0ff; transition: width 0.1s linear;"></div>
                    </div>
                </div>
            `;
        });

        hud.innerHTML = innerHTML;
        document.body.appendChild(hud);

        // Update layouts in standard instructions hud
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'WASD/Arrows to slide. Spacebar to DASH & RAM. Knock all other players off the slippery ice platform to win!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'Polar Push Game';
        }
    }

    updateHUD() {
        this.players.forEach(p => {
            const statusLabel = document.getElementById(`hud-status-${p.id}`);
            const card = document.getElementById(`hud-player-card-${p.id}`);
            const dashFill = document.getElementById(`hud-dash-fill-${p.id}`);

            if (p.isEliminated) {
                if (statusLabel && statusLabel.textContent !== 'OUT') {
                    statusLabel.textContent = 'OUT';
                    statusLabel.style.background = 'rgba(255, 0, 127, 0.15)';
                    statusLabel.style.color = '#ff007f';
                    statusLabel.style.textShadow = '0 0 4px #ff007f';
                    statusLabel.style.border = '1px solid rgba(255, 0, 127, 0.3)';
                }
                if (card) {
                    card.style.opacity = '0.3';
                }
                if (dashFill) {
                    dashFill.style.width = '0%';
                }
            } else {
                if (dashFill) {
                    const pct =
                        p.dashCooldown <= 0 ? 100 : Math.max(0, (1.0 - p.dashCooldown / 1.5) * 100);
                    dashFill.style.width = `${pct}%`;
                    dashFill.style.background = p.dashCooldown <= 0 ? '#00f0ff' : '#718096';
                    dashFill.style.boxShadow = p.dashCooldown <= 0 ? '0 0 6px #00f0ff' : 'none';
                }
            }
        });
    }

    spawnDashTrail(player) {
        const color = player.color;
        const trailGeo = player.mesh.geometry.clone();
        const trailMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.35
        });
        const trailMesh = new THREE.Mesh(trailGeo, trailMat);
        trailMesh.position.copy(player.mesh.position);
        trailMesh.rotation.copy(player.mesh.rotation);
        trailMesh.scale.copy(player.mesh.scale);
        this.arenaGroup.add(trailMesh);

        this.particles.push({
            mesh: trailMesh,
            vx: 0,
            vy: 0,
            vz: 0,
            life: 0.4,
            decay: 2.5
        });
    }

    spawnWaterSplashParticles(x, z, colorHex, count) {
        const pGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const pMat = new THREE.MeshBasicMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.95
        });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(pGeo, pMat.clone());
            mesh.position.set(x, -0.4, z);
            this.arenaGroup.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const velocity = 1.8 + Math.random() * 4.2;
            const vx = Math.cos(angle) * velocity;
            const vz = Math.sin(angle) * velocity;
            const vy = 3.5 + Math.random() * 4.5; // High upward splash force

            this.particles.push({
                mesh,
                vx,
                vy,
                vz,
                life: 1.0,
                decay: 1.4 + Math.random() * 1.2
            });
        }
    }

    spawnCollisionImpactParticles(x, y, z, colorHex, count) {
        const pGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const pMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9
        });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(pGeo, pMat.clone());
            mesh.position.set(x, y, z);
            this.arenaGroup.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const velocity = 2.0 + Math.random() * 4.0;
            const vx = Math.cos(angle) * velocity;
            const vz = Math.sin(angle) * velocity;
            const vy = 1.0 + Math.random() * 3.0;

            this.particles.push({
                mesh,
                vx,
                vy,
                vz,
                life: 0.8,
                decay: 2.0 + Math.random() * 1.5
            });
        }
    }

    update(dt, inputs) {
        if (this.gameOver) {
            this.updateVisualEffects(dt);
            return;
        }

        // 1. Bob and rotate decorative floes
        const elapsed = SceneManager.clock.getElapsedTime();
        this.decorFloes.forEach(floe => {
            floe.mesh.rotation.y += floe.rotSpeed * dt;
            floe.mesh.position.y =
                floe.baseY + Math.sin(elapsed * floe.bobSpeed + floe.bobOffset) * 0.08;
        });

        // 2. Human player controls
        const p1 = this.players[0];
        if (p1 && !p1.isEliminated) {
            // Cool down timer decrement
            if (p1.dashCooldown > 0) p1.dashCooldown -= dt;

            // Dash Timer decrement
            if (p1.isDashing) {
                p1.dashTimer -= dt;
                if (p1.dashTimer <= 0) {
                    p1.isDashing = false;
                    const speed = Math.sqrt(p1.vx * p1.vx + p1.vz * p1.vz);
                    if (speed > 10.0) {
                        p1.vx = (p1.vx / speed) * 10.0;
                        p1.vz = (p1.vz / speed) * 10.0;
                    }
                }
            }

            if (p1.isOnIce) {
                let moveX = 0;
                let moveZ = 0;
                if (inputs.w || inputs.ArrowUp) moveZ -= 1;
                if (inputs.s || inputs.ArrowDown) moveZ += 1;
                if (inputs.a || inputs.ArrowLeft) moveX -= 1;
                if (inputs.d || inputs.ArrowRight) moveX += 1;

                if (moveX !== 0 || moveZ !== 0) {
                    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
                    const dirX = moveX / len;
                    const dirZ = moveZ / len;

                    // Convert to isometric
                    const targetDirX = dirZ;
                    const targetDirZ = -dirX;

                    p1.facingAngle = Math.atan2(-targetDirZ, targetDirX);

                    // Smoothly rotate character mesh
                    let diff = p1.facingAngle - p1.mesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    p1.mesh.rotation.y += diff * 0.25;

                    // Apply acceleration force
                    const accel = 25.0 * dt;
                    p1.vx += targetDirX * accel;
                    p1.vz += targetDirZ * accel;
                }

                // Spacebar Dash trigger
                const spaceTrigger = inputs.Space && !this.spacePressedLastFrame;
                this.spacePressedLastFrame = inputs.Space;

                if (spaceTrigger && p1.dashCooldown <= 0 && !p1.isDashing) {
                    const dashSpeed = 26.0;
                    p1.vx = Math.cos(p1.facingAngle) * dashSpeed;
                    p1.vz = -Math.sin(p1.facingAngle) * dashSpeed;
                    p1.isDashing = true;
                    p1.dashTimer = 0.25;
                    p1.dashCooldown = 1.5;
                    p1.trailTimer = 0.0;

                    this.spawnDashTrail(p1);
                    this.showNotification('DASH!', p1.hex);
                }
            }
        }

        // 3. Opponent AI actions
        this.updateAI(dt);

        // 4. Movement, Friction and Fall physics
        this.players.forEach(p => {
            if (p.isEliminated) return;

            // Apply friction slide if on ice and not active dashing
            if (p.isOnIce && !p.isDashing) {
                p.vx *= 0.98;
                p.vz *= 0.98;
            }

            // Move player position based on velocity
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.z += p.vz * dt;

            const currentSpeed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
            if (CharacterBuilder.animate) {
                CharacterBuilder.animate(
                    p.mesh,
                    currentSpeed,
                    SceneManager.clock.getElapsedTime()
                );
            }

            // Spawn trail particles during dash
            if (p.isDashing) {
                p.trailTimer += dt;
                if (p.trailTimer >= 0.04) {
                    p.trailTimer = 0.0;
                    this.spawnDashTrail(p);
                }
            }

            // Edge checks relative to center (0,0)
            const distFromCenter = Math.sqrt(
                p.mesh.position.x * p.mesh.position.x + p.mesh.position.z * p.mesh.position.z
            );
            if (distFromCenter > this.platformRadius) {
                p.isOnIce = false;
                p.isDashing = false; // Cancel active dash off platform
            } else {
                p.isOnIce = true;
            }

            // Gravity pulls them down if off ice
            if (!p.isOnIce) {
                p.vy -= 16.0 * dt; // Gravity speed
                p.mesh.position.y += p.vy * dt;
                p.vx *= 0.96; // Water drag slows horizontal speed
                p.vz *= 0.96;
            } else {
                p.mesh.position.y = p.meshY;
                p.vy = 0;
            }

            // Splash boundary check
            if (p.mesh.position.y <= -0.4 && !p.isEliminated) {
                p.isEliminated = true;
                p.isDead = true;
                this.spawnWaterSplashParticles(p.mesh.position.x, p.mesh.position.z, p.color, 25);
                this.arenaGroup.remove(p.mesh);
                this.showNotification(`${p.name} SPLASHED!`, p.hex);
            }
        });

        // 5. Rigid elastic collision handling
        this.handlePlayerCollisions();

        // 6. FX / Particle updates
        this.updateVisualEffects(dt);

        // 7. HUD rendering update
        this.updateHUD();

        // 8. Win condition checking
        this.checkGameStatus();
    }

    handlePlayerCollisions() {
        const radius = 0.6; // collision radius
        const minDist = radius * 2.0;

        for (let i = 0; i < this.players.length; i++) {
            const p1 = this.players[i];
            if (p1.isEliminated || !p1.isOnIce) continue;

            for (let j = i + 1; j < this.players.length; j++) {
                const p2 = this.players[j];
                if (p2.isEliminated || !p2.isOnIce) continue;

                const dx = p2.mesh.position.x - p1.mesh.position.x;
                const dz = p2.mesh.position.z - p1.mesh.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < minDist && dist > 0.01) {
                    // Push apart to prevent intersection clipping
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const nz = dz / dist;

                    p1.mesh.position.x -= nx * overlap * 0.5;
                    p1.mesh.position.z -= nz * overlap * 0.5;
                    p2.mesh.position.x += nx * overlap * 0.5;
                    p2.mesh.position.z += nz * overlap * 0.5;

                    // Elastic momentum transfer
                    const v1n = p1.vx * nx + p1.vz * nz;
                    const v2n = p2.vx * nx + p2.vz * nz;

                    let restitution = 1.3; // high arcade bounce
                    let new_v1n = v2n * restitution;
                    let new_v2n = v1n * restitution;

                    // If a player was dashing, add massive knockback momentum!
                    if (p1.isDashing) {
                        new_v2n += 16.0; // blast opponent away!
                        p1.isDashing = false;
                        p1.dashTimer = 0;
                        this.spawnCollisionImpactParticles(
                            p2.mesh.position.x,
                            0.4,
                            p2.mesh.position.z,
                            p1.color,
                            15
                        );
                        this.showNotification('RAMMED!', p1.hex);
                    }
                    if (p2.isDashing) {
                        new_v1n -= 16.0; // blast p1 away!
                        p2.isDashing = false;
                        p2.dashTimer = 0;
                        this.spawnCollisionImpactParticles(
                            p1.mesh.position.x,
                            0.4,
                            p1.mesh.position.z,
                            p2.color,
                            15
                        );
                        this.showNotification('RAMMED!', p2.hex);
                    }

                    p1.vx += (new_v1n - v1n) * nx;
                    p1.vz += (new_v1n - v1n) * nz;
                    p2.vx += (new_v2n - v2n) * nx;
                    p2.vz += (new_v2n - v2n) * nz;
                }
            }
        }
    }

    updateAI(dt) {
        this.players.forEach(ai => {
            if (!ai.isAI || ai.isEliminated) return;

            // AI timers
            if (ai.dashCooldown > 0) ai.dashCooldown -= dt;

            if (ai.isDashing) {
                ai.dashTimer -= dt;
                if (ai.dashTimer <= 0) {
                    ai.isDashing = false;
                    const speed = Math.sqrt(ai.vx * ai.vx + ai.vz * ai.vz);
                    if (speed > 9.0) {
                        ai.vx = (ai.vx / speed) * 9.0;
                        ai.vz = (ai.vz / speed) * 9.0;
                    }
                }
            }

            if (!ai.isOnIce) return;

            // Compute distance from center of the circular ice platform
            const centerDist = Math.sqrt(
                ai.mesh.position.x * ai.mesh.position.x + ai.mesh.position.z * ai.mesh.position.z
            );

            if (centerDist > 9.0) {
                // Priority A: Slide back to safety (center)
                const dirX = -ai.mesh.position.x / centerDist;
                const dirZ = -ai.mesh.position.z / centerDist;

                ai.facingAngle = Math.atan2(-dirZ, dirX);
                ai.mesh.rotation.y = ai.facingAngle;

                const accel = 28.0 * dt; // quick recovery acceleration
                ai.vx += dirX * accel;
                ai.vz += dirZ * accel;
            } else {
                // Priority B: Brawling AI! Target players closest to the edge
                let target = null;
                let maxEdgeDist = -1;

                this.players.forEach(p => {
                    if (p.id === ai.id || p.isEliminated) return;

                    const pDist = Math.sqrt(
                        p.mesh.position.x * p.mesh.position.x +
                        p.mesh.position.z * p.mesh.position.z
                    );
                    if (pDist > maxEdgeDist) {
                        maxEdgeDist = pDist;
                        target = p;
                    }
                });

                if (target) {
                    const dx = target.mesh.position.x - ai.mesh.position.x;
                    const dz = target.mesh.position.z - ai.mesh.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);

                    if (dist > 0.1) {
                        const dirX = dx / dist;
                        const dirZ = dz / dist;

                        ai.facingAngle = Math.atan2(-dirZ, dirX);
                        ai.mesh.rotation.y = ai.facingAngle;

                        let diffSetting = launcherState?.aiDifficulty || 'normal';
                        let accelMult = diffSetting === 'easy' ? 0.6 : (diffSetting === 'hard' ? 1.2 : 1.0);
                        const accel = 18.0 * dt * accelMult; // walk towards target
                        ai.vx += dirX * accel;
                        ai.vz += dirZ * accel;

                        // Dash Ram check: if aligned and close enough, and random trigger chance is met
                        let dashProb = diffSetting === 'easy' ? 0.02 : (diffSetting === 'hard' ? 0.15 : 0.06);
                        if (
                            dist > 3.0 &&
                            dist < 6.5 &&
                            ai.dashCooldown <= 0 &&
                            Math.random() < dashProb
                        ) {
                            const dashSpeed = 26.0;
                            ai.vx = dirX * dashSpeed;
                            ai.vz = dirZ * dashSpeed;
                            ai.isDashing = true;
                            ai.dashTimer = 0.25;
                            ai.dashCooldown = 1.5 + Math.random() * 0.8;
                            ai.trailTimer = 0.0;

                            this.spawnDashTrail(ai);
                            this.showNotification('DASH!', ai.hex);
                        }
                    }
                } else {
                    // Celebrate or stay near center
                    ai.vx *= 0.95;
                    ai.vz *= 0.95;
                }
            }
        });
    }

    updateVisualEffects(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;

            if (p.life <= 0) {
                this.arenaGroup.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
            } else {
                p.mesh.position.x += p.vx * dt;
                p.mesh.position.y += p.vy * dt;
                p.mesh.position.z += p.vz * dt;

                p.vy -= 9.8 * dt; // apply gravity to splashes/sparks

                p.mesh.material.opacity = p.life;
                p.mesh.scale.set(p.life, p.life, p.life);
            }
        }
    }

    checkGameStatus() {
        if (this.gameOver) return;

        const p1 = this.players[0];
        if (p1.isEliminated) {
            this.triggerGameOver(false);
            return;
        }

        const opponentsAlive = this.players.slice(1).filter(p => !p.isEliminated);
        if (opponentsAlive.length === 0) {
            this.triggerGameOver(true);
        }
    }

    triggerGameOver(isVictory) {
        this.gameOver = true;

        const existing = document.getElementById('game-over-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'game-over-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(6, 8, 15, 0.75)';
        overlay.style.backdropFilter = 'blur(12px)';
        overlay.style.webkitBackdropFilter = 'blur(12px)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '100';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.8s ease';

        const titleColor = isVictory ? '#48bb78' : '#ff007f';
        const titleText = isVictory ? 'VICTORY' : 'DEFEATED';
        const shadowColor = isVictory ? 'rgba(72, 187, 120, 0.6)' : 'rgba(255, 0, 127, 0.6)';

        overlay.innerHTML = `
            <div style="text-align: center; padding: 40px; border-radius: 24px; background: rgba(15, 18, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1); max-width: 450px; width: 90%;">
                <h2 style="font-family: 'Space Grotesk', sans-serif; font-size: 3rem; font-weight: 800; letter-spacing: 4px; color: ${titleColor}; text-shadow: 0 0 30px ${shadowColor}; margin: 0 0 10px 0; text-transform: uppercase;">
                    ${titleText}
                </h2>
                <p style="font-size: 1.05rem; color: #ffffff; margin: 0 0 25px 0; letter-spacing: 1px;">
                    ${isVictory ? 'You crowned yourself the lone survivor of the ice floe!' : 'You slid off the edge into freezing waters!'}
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="polar-exit-btn" style="pointer-events: auto; cursor: pointer; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; border-radius: 25px; transition: all 0.3s ease;">
                        Exit to Menu
                    </button>
                    <button id="polar-restart-btn" style="pointer-events: auto; cursor: pointer; background: linear-gradient(135deg, #00f0ff, #0072ff); border: none; color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border-radius: 25px; box-shadow: 0 0 20px rgba(0, 240, 255, 0.35); transition: all 0.3s ease;">
                        Play Again
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('polar-exit-btn').addEventListener('click', () => {
            window.exitToLauncher();
        });
        document.getElementById('polar-restart-btn').addEventListener('click', () => {
            this.resetGame();
        });

        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 50);
    }

    resetGame() {
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 800);
        }

        // Clean up visual particles
        for (const p of this.particles) {
            this.arenaGroup.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this.particles = [];

        // Clean and recreate players in starting spots
        this.players.forEach(p => {
            if (!p.isEliminated) {
                this.arenaGroup.remove(p.mesh);
            }
        });
        this.players = [];
        this.spawnPlayers();

        this.gameOver = false;
        this.spacePressedLastFrame = false;

        this.createHUD();
    }

    showNotification(text, colorHex) {
        const notif = document.createElement('div');
        notif.textContent = text;
        notif.style.position = 'absolute';
        notif.style.bottom = '80px';
        notif.style.top = 'auto';
        notif.style.left = '50%';
        notif.style.transform = 'translateX(-50%) scale(0.8)';
        notif.style.background = 'rgba(11, 14, 25, 0.85)';
        notif.style.border = `1px solid ${colorHex}`;
        notif.style.boxShadow = `0 0 25px ${colorHex}33, inset 0 0 8px ${colorHex}55`;
        notif.style.color = '#ffffff';
        notif.style.padding = '10px 28px';
        notif.style.borderRadius = '24px';
        notif.style.fontFamily = "'Space Grotesk', sans-serif";
        notif.style.fontSize = '0.85rem';
        notif.style.fontWeight = '700';
        notif.style.letterSpacing = '2px';
        notif.style.textTransform = 'uppercase';
        notif.style.zIndex = '99';
        notif.style.pointerEvents = 'none';
        notif.style.opacity = '0';
        notif.style.backdropFilter = 'blur(10px)';
        notif.style.webkitBackdropFilter = 'blur(10px)';
        notif.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

        document.body.appendChild(notif);
        notif.offsetHeight; // force reflow

        notif.style.opacity = '1';
        notif.style.transform = 'translateX(-50%) scale(1.0)';

        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transform = 'translateX(-50%) scale(0.8) translateY(-25px)';
            setTimeout(() => {
                if (notif.parentNode) {
                    document.body.removeChild(notif);
                }
            }, 400);
        }, 1300);
    }

    destroy() {
        if (this.arenaGroup) {
            SceneManager.scene.remove(this.arenaGroup);
            this.arenaGroup.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(mat => mat.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            this.arenaGroup = null;
        }

        SceneManager.updateCallbacks = [];

        // Restore original camera
        if (this.originalCameraPos && SceneManager.camera) {
            SceneManager.camera.position.copy(this.originalCameraPos);
            SceneManager.camera.lookAt(0, 0, 0);
        }

        const hud = document.getElementById('polarpush-hud');
        if (hud) hud.remove();

        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.remove();
    }
}

// Expose SlideOutGame globally

//export default SlideOutGame;
