/**
 * DRAGON DROP GAMEPLAY LOGIC
 * Implements the DragonDropGame class to run a jewel-collection and shooting game.
 *
 * Features:
 * - 1 Human Player Dragon (Box, Cyan) controlled via WASD / Arrows
 * - 3 Concentric Rings for Score Zones (1x, 2x, 3x multipliers)
 * - Moving Target along the back wall (Slides left/right using a sine wave)
 * - Jewel System: Collide with jewels to pick them up, and press Spacebar to launch them towards the target
 * - Spawner rules: Pink & Green jewels spawn at start (10 pts), Blue jewel spawns at 45s (30 pts)
 * - 90-second match limit with glassmorphic Victory / Game Over screen
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class DragonDropGame {
    constructor() {
        this.score = 0;
        this.currentMultiplier = 1;
        this.matchTimer = 0.0;
        this.blueJewelSpawned = false;
        this.gameOver = false;

        // 3D Objects
        this.arenaGroup = null;
        this.floor = null;
        this.player = null;
        this.target = null;

        // Concentric Rings list
        this.rings = [];

        // Jewels and Projectiles
        this.jewels = []; // on ground
        this.heldJewel = null; // currently attached to player
        this.projectiles = []; // active shots in mid-air

        // Particles pool
        this.particles = [];

        // Spacebar debounce flag
        this.spacePressedLastFrame = false;

        this.setup();
    }

    /**
     * Initializes all 3D assets and registers the update loop
     */
    setup() {
        if (this.arenaGroup) return;
        const engine = window.engine;
        if (!engine) {
            console.error('DragonDropGame: engine.js not found in global context!');
            return;
        }

        // 1. Remove demo elements spawned by engine.js to clear the play space
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

        // 2. Create local Coordinate Group rotated to align with the isometric perspective
        this.arenaGroup = new THREE.Group();
        this.arenaGroup.rotation.y = -Math.PI / 4;
        engine.scene.add(this.arenaGroup);

        // 3. Spawn Floor Arena (3D box)
        const arenaSize = 40;
        const floorGeo = new THREE.BoxGeometry(arenaSize, 0.4, arenaSize);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x0c0e16, // Ultra-dark blue/gray slab
            roughness: 0.8,
            metalness: 0.4
        });
        this.floor = new THREE.Mesh(floorGeo, floorMat);
        this.floor.position.set(0, -0.2, 0); // Y = 0 is flush with floor top
        this.floor.receiveShadow = true;
        this.arenaGroup.add(this.floor);

        // Grid overlay for arcade styling
        const grid = new THREE.GridHelper(arenaSize, 20, 0xff007f, 0x181f33);
        grid.position.y = 0.01;
        this.arenaGroup.add(grid);

        // 4. Draw 3 concentric rings (circles) expanding from the center of the stage
        // Zone 1 Ring (Cyan, Radius 6)
        const ringGeo1 = new THREE.RingGeometry(5.9, 6.1, 64);
        const ringMat1 = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
        ring1.rotation.x = Math.PI / 2;
        ring1.position.y = 0.02;
        this.arenaGroup.add(ring1);
        this.rings.push(ring1);

        // Zone 2 Ring (Purple, Radius 12)
        const ringGeo2 = new THREE.RingGeometry(11.9, 12.1, 64);
        const ringMat2 = new THREE.MeshBasicMaterial({
            color: 0xb026ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
        ring2.rotation.x = Math.PI / 2;
        ring2.position.y = 0.02;
        this.arenaGroup.add(ring2);
        this.rings.push(ring2);

        // Zone 3 Ring (Orange, Radius 18)
        const ringGeo3 = new THREE.RingGeometry(17.9, 18.1, 64);
        const ringMat3 = new THREE.MeshBasicMaterial({
            color: 0xffbb00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const ring3 = new THREE.Mesh(ringGeo3, ringMat3);
        ring3.rotation.x = Math.PI / 2;
        ring3.position.y = 0.02;
        this.arenaGroup.add(ring3);
        this.rings.push(ring3);

        // 5. Spawn Moving Target along the back wall (Z = -18)
        const targetGeo = new THREE.OctahedronGeometry(1.2, 0);
        const targetMat = new THREE.MeshStandardMaterial({
            color: 0xff0055, // neon pink/red
            roughness: 0.1,
            metalness: 0.9,
            emissive: 0xff0055,
            emissiveIntensity: 0.8
        });
        this.target = new THREE.Mesh(targetGeo, targetMat);
        this.target.position.set(0, 1.5, -18.0);
        this.target.castShadow = true;
        this.target.receiveShadow = true;
        this.arenaGroup.add(this.target);

        // Add glowing point light on target
        const targetLight = new THREE.PointLight(0xff0055, 3.5, 10);
        this.target.add(targetLight);

        // 6. Spawn Player Dragon Box (Cyan, Center)
        const playerGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
        const playerMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            roughness: 0.15,
            metalness: 0.8,
            emissive: 0x00f0ff,
            emissiveIntensity: 0.3
        });
        this.player = new THREE.Mesh(playerGeo, playerMat);
        this.player.position.set(0, 0.7, 0); // Y offset to float on floor
        this.player.castShadow = true;
        this.player.receiveShadow = true;
        this.arenaGroup.add(this.player);

        // Add small glowing point light under player
        const playerLight = new THREE.PointLight(0x00f0ff, 2.0, 6);
        this.player.add(playerLight);

        // 7. Inject HUD overlay for Dragon Drop
        this.createHUD();

        // 8. Spawn initial Jewels (1 Pink, 1 Green)
        this.spawnJewel('pink');
        this.spawnJewel('green');

        // 9. Hook update logic into the engine loop
        engine.updateCallbacks.push((dt, time) => {
            this.update(dt, engine.inputs);
            this.updateParticles(dt);
        });
    }

    /**
     * Injects the dynamic Dragon Drop HUD overlay into the page
     */
    createHUD() {
        // Hide Ballistix elements
        const ballistixHud = document.querySelector('.score-container');
        if (ballistixHud) ballistixHud.style.display = 'none';
        const ballistixControls = document.querySelector('.control-panel');
        if (ballistixControls) ballistixControls.style.display = 'none';

        // Remove existing Dragon Drop HUD if any
        const existing = document.getElementById('dragondrop-hud');
        if (existing) existing.remove();

        const hud = document.createElement('div');
        hud.id = 'dragondrop-hud';
        hud.style.position = 'absolute';
        hud.style.top = '30px';
        hud.style.left = '50%';
        hud.style.transform = 'translateX(-50%)';
        hud.style.zIndex = '10';
        hud.style.background = 'rgba(15, 18, 30, 0.7)';
        hud.style.border = '1px solid rgba(255, 255, 255, 0.08)';
        hud.style.backdropFilter = 'blur(16px)';
        hud.style.webkitBackdropFilter = 'blur(16px)';
        hud.style.padding = '12px 32px';
        hud.style.borderRadius = '18px';
        hud.style.display = 'flex';
        hud.style.gap = '36px';
        hud.style.alignItems = 'center';
        hud.style.boxShadow =
            '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255,255,255,0.1)';
        hud.style.fontFamily = "'Outfit', sans-serif";
        hud.style.color = '#ffffff';

        hud.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 0.65rem; color: #a0aec0; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 2px;">Score</div>
                <div id="dd-score-val" style="font-family: 'Space Grotesk', sans-serif; font-size: 1.8rem; font-weight: 800; color: #ff007f; text-shadow: 0 0 12px rgba(255, 0, 127, 0.5); line-height: 1; transition: transform 0.15s ease;">0</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 0.65rem; color: #a0aec0; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 2px;">Zone / Multiplier</div>
                <div id="dd-zone-val" style="font-family: 'Space Grotesk', sans-serif; font-size: 1.3rem; font-weight: 800; color: #00f0ff; line-height: 1.3;">Zone 1 (1x)</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 0.65rem; color: #a0aec0; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 2px;">Time Remaining</div>
                <div id="dd-timer-val" style="font-family: 'Space Grotesk', sans-serif; font-size: 1.8rem; font-weight: 800; color: #ffffff; text-shadow: 0 0 12px rgba(255, 255, 255, 0.2); line-height: 1;">90.0s</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 0.65rem; color: #a0aec0; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 2px;">Holding</div>
                <div id="dd-held-val" style="font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; font-weight: 700; color: #718096; text-transform: uppercase; line-height: 1.3;">None</div>
            </div>
        `;
        document.body.appendChild(hud);

        // Update layout descriptions in the HTML template
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'Use WASD/Arrows to move the Dragon. Stand in outer concentric rings to increase multiplier (up to 3x)! Collide with jewels to pick them up, and press Spacebar to shoot them towards the moving target.';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'Dragon Drop Game';
        }
    }

    /**
     * Displays a temporary animated notification overlay on the screen
     */
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

        // Force reflow
        notif.offsetHeight;

        // Fade in
        notif.style.opacity = '1';
        notif.style.transform = 'translateX(-50%) scale(1.0)';

        // Fade out and cleanup
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

    /**
     * Spawns a jewel of the specified colorName at a random location on the ground
     */
    spawnJewel(colorName) {
        // Sphere shape for jewels as requested
        const jewelGeo = new THREE.SphereGeometry(0.5, 32, 32);

        let color, value, name, hexString;
        if (colorName === 'pink') {
            color = 0xff007f;
            value = 10;
            name = 'Pink Jewel';
            hexString = '#ff007f';
        } else if (colorName === 'green') {
            color = 0x39ff14;
            value = 10;
            name = 'Green Jewel';
            hexString = '#39ff14';
        } else if (colorName === 'blue') {
            color = 0x00f0ff;
            value = 30;
            name = 'Blue Jewel';
            hexString = '#00f0ff';
        }

        const jewelMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.1,
            metalness: 0.9,
            emissive: color,
            emissiveIntensity: 0.6
        });

        const mesh = new THREE.Mesh(jewelGeo, jewelMat);
        mesh.castShadow = true;

        // Glowing point light attached to jewel
        const light = new THREE.PointLight(color, 2.5, 6);
        mesh.add(light);

        this.arenaGroup.add(mesh);

        // Position it randomly on the ground inside Zone 3 (radius 18)
        let rx, rz, dist;
        do {
            rx = (Math.random() - 0.5) * 32.0;
            rz = (Math.random() - 0.5) * 32.0;
            dist = Math.sqrt(rx * rx + rz * rz);
        } while (dist > 17.0 || dist < 2.0); // Keep within reasonable zones

        mesh.position.set(rx, 0.5, rz);

        this.jewels.push({
            mesh,
            color,
            colorName,
            value,
            name,
            hexString,
            state: 'ground'
        });

        // Spawn particles burst
        this.createCollisionImpact(rx, rz, color, 6);
    }

    /**
     * Shoots the currently held jewel towards the target's current location
     */
    shootJewel() {
        if (!this.heldJewel) return;

        const proj = this.heldJewel;
        this.heldJewel = null;

        // Visual feedback
        const hexColor = proj.color;
        this.createCollisionImpact(proj.mesh.position.x, proj.mesh.position.z, hexColor, 10);
        this.showNotification('Jewel Launched!', '#' + hexColor.toString(16).padStart(6, '0'));

        // Calculate vector pointing from launch position to target position
        const targetPos = this.target.position.clone();
        const launchPos = proj.mesh.position.clone();
        const dir = new THREE.Vector3().subVectors(targetPos, launchPos).normalize();

        const speed = 28.0; // Launch projectile speed
        proj.vx = dir.x * speed;
        proj.vz = dir.z * speed;
        proj.state = 'projectile';

        this.projectiles.push(proj);

        // Update HUD
        const heldVal = document.getElementById('dd-held-val');
        if (heldVal) {
            heldVal.textContent = 'None';
            heldVal.style.color = '#718096';
        }
    }

    /**
     * Core update loop, manages movement, zone multiplier checks, target animation, collision, and spawner logic
     */
    update(dt, inputs) {
        if (this.gameOver) {
            this.updateParticles(dt);
            if (this.target) {
                this.target.rotation.y += 1.5 * dt;
                this.target.rotation.x += 0.8 * dt;
            }
            return;
        }

        // --- 1. Update Match Timer & Spawner Rules ---
        this.matchTimer += dt;

        // At exactly 45 seconds, spawn high-value Blue Jewel
        if (this.matchTimer >= 45.0 && !this.blueJewelSpawned) {
            this.blueJewelSpawned = true;
            this.spawnJewel('blue');
            this.showNotification('BLUE JEWEL SPAWNED (30 PTS)!', '#00f0ff');
        }

        // End Game at exactly 90 seconds total
        if (this.matchTimer >= 90.0) {
            this.triggerGameOver();
        }

        // Update timer HUD
        const timerVal = document.getElementById('dd-timer-val');
        if (timerVal) {
            const remaining = Math.max(0, 90.0 - this.matchTimer);
            timerVal.textContent = remaining.toFixed(1) + 's';
            if (remaining <= 10.0) {
                timerVal.style.color = '#ff0055'; // Red flashing danger warning
            } else {
                timerVal.style.color = '#ffffff';
            }
        }

        // --- 2. Target Movement along the back wall ---
        if (this.target) {
            const slideSpeed = 1.8;
            const slideRange = 13.0; // horizontal sweep range
            const targetX = Math.sin(this.matchTimer * slideSpeed) * slideRange;
            this.target.position.x = targetX;
            this.target.rotation.y += 1.2 * dt;
            this.target.rotation.x += 0.6 * dt;
        }

        // --- 3. Player Movement & Rotational Alignments ---
        if (this.player) {
            let moveX = 0;
            let moveZ = 0;
            const movementSpeed = 16.0; // Dragon flight speed

            if (inputs.w || inputs.ArrowUp) moveZ -= 1;
            if (inputs.s || inputs.ArrowDown) moveZ += 1;
            if (inputs.a || inputs.ArrowLeft) moveX -= 1;
            if (inputs.d || inputs.ArrowRight) moveX += 1;

            if (moveX !== 0 || moveZ !== 0) {
                const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
                const dirX = moveX / len;
                const dirZ = moveZ / len;

                // Convert screen inputs (WASD) into local isometric space for the rotated arenaGroup.
                // Screen Right (dirX = 1) maps to Local -Z.
                // Screen Up (dirZ = -1) maps to Local -X.
                const isoX = dirZ;
                const isoZ = -dirX;

                // Smoothly rotate the player box to face the direction of flight
                const targetRotation = Math.atan2(-isoZ, isoX);
                let currentRotation = this.player.rotation.y;
                let angleDiff = targetRotation - currentRotation;

                // Normalize angle difference to [-PI, PI]
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                const turnRate = 8.0 * dt; // radians per second
                if (Math.abs(angleDiff) <= turnRate) {
                    this.player.rotation.y = targetRotation;
                } else {
                    this.player.rotation.y += Math.sign(angleDiff) * turnRate;
                }

                // Keep rotation normalized
                while (this.player.rotation.y < -Math.PI) this.player.rotation.y += Math.PI * 2;
                while (this.player.rotation.y > Math.PI) this.player.rotation.y -= Math.PI * 2;

                // Calculate alignment to scale speed (don't move if facing far away from target)
                const alignment = Math.max(0, Math.cos(angleDiff));

                // Move forward in the CURRENT facing direction
                const forwardX = Math.cos(this.player.rotation.y);
                const forwardZ = -Math.sin(this.player.rotation.y);

                const speed = 9.0 * alignment; // Slower speed, scaled by alignment

                this.player.position.x += forwardX * speed * dt;
                this.player.position.z += forwardZ * speed * dt;

                // Floor boundary clamps (size 40 arena)
                const limit = 19.0;
                this.player.position.x = Math.max(-limit, Math.min(limit, this.player.position.x));
                this.player.position.z = Math.max(-limit, Math.min(limit, this.player.position.z));
            }

            // --- 4. Constantly Track Concentric Score Zone and Multiplier ---
            const distFromCenter = Math.sqrt(
                this.player.position.x * this.player.position.x +
                    this.player.position.z * this.player.position.z
            );

            let zoneText = 'Outside (1x)';
            let zoneColor = '#718096';
            this.currentMultiplier = 1;

            if (distFromCenter <= 6.0) {
                zoneText = 'Zone 1 (1x)';
                zoneColor = '#00f0ff';
                this.currentMultiplier = 1;
            } else if (distFromCenter <= 12.0) {
                zoneText = 'Zone 2 (2x)';
                zoneColor = '#b026ff';
                this.currentMultiplier = 2;
            } else if (distFromCenter <= 18.0) {
                zoneText = 'Zone 3 (3x)';
                zoneColor = '#ffbb00';
                this.currentMultiplier = 3;
            }

            const zoneVal = document.getElementById('dd-zone-val');
            if (zoneVal) {
                zoneVal.textContent = zoneText;
                zoneVal.style.color = zoneColor;
            }
        }

        // --- 5. Handle Jewel Attachment (Position locked in front of player) ---
        if (this.heldJewel && this.player) {
            const offsetDist = 1.3;
            const angle = this.player.rotation.y;
            this.heldJewel.mesh.position.x = this.player.position.x + Math.cos(angle) * offsetDist;
            this.heldJewel.mesh.position.z = this.player.position.z - Math.sin(angle) * offsetDist;
            this.heldJewel.mesh.position.y = this.player.position.y + 0.2;
            this.heldJewel.mesh.rotation.y += 2.0 * dt;
        }

        // --- 6. Handle Spacebar Launch Input ---
        const spacePressed = inputs.Space;
        const spaceTriggered = spacePressed && !this.spacePressedLastFrame;
        this.spacePressedLastFrame = spacePressed;

        if (spaceTriggered && this.heldJewel) {
            this.shootJewel();
        }

        // --- 7. Collide with Ground Jewels ---
        if (!this.heldJewel && this.player) {
            for (let i = this.jewels.length - 1; i >= 0; i--) {
                const jewel = this.jewels[i];
                if (jewel.state === 'ground') {
                    const distToPlayer = this.player.position.distanceTo(jewel.mesh.position);
                    if (distToPlayer < 1.4) {
                        // Pick it up!
                        jewel.state = 'held';
                        this.heldJewel = jewel;
                        this.jewels.splice(i, 1);

                        // Collection feedback particles
                        this.createCollisionImpact(
                            jewel.mesh.position.x,
                            jewel.mesh.position.z,
                            jewel.color,
                            8
                        );

                        // Update HUD indicator
                        const heldVal = document.getElementById('dd-held-val');
                        if (heldVal) {
                            heldVal.textContent = jewel.name;
                            heldVal.style.color = jewel.hexString;
                        }

                        break; // only hold 1 jewel
                    }
                }
            }
        }

        // --- 8. Update Projectile Travel and Collisions ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];

            // Move projectile
            proj.mesh.position.x += proj.vx * dt;
            proj.mesh.position.z += proj.vz * dt;
            proj.mesh.rotation.y += 4.0 * dt;

            // Check collision with the target
            const distToTarget = proj.mesh.position.distanceTo(this.target.position);
            if (distToTarget < 1.6) {
                // Target HIT!
                const points = proj.value * this.currentMultiplier;
                this.score += points;

                // Update score panel
                const scoreVal = document.getElementById('dd-score-val');
                if (scoreVal) {
                    scoreVal.textContent = this.score;
                    scoreVal.style.transform = 'scale(1.3)';
                    setTimeout(() => (scoreVal.style.transform = 'scale(1.0)'), 150);
                }

                // Explosive particles
                this.createCollisionImpact(
                    proj.mesh.position.x,
                    proj.mesh.position.z,
                    proj.color,
                    22
                );
                this.showNotification(`Target Hit! +${points} pts`, proj.hexString);

                // Clean up projectile Mesh
                this.arenaGroup.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();
                this.projectiles.splice(i, 1);

                // Respawn a new ground jewel of the same type to keep game active
                this.spawnJewel(proj.colorName);
                continue;
            }

            // Check if projectile goes out of bounds (past target or off grid)
            if (
                proj.mesh.position.z < -22.0 ||
                Math.abs(proj.mesh.position.x) > 22.0 ||
                Math.abs(proj.mesh.position.z) > 22.0
            ) {
                // MISS! Emitter feedback
                this.createCollisionImpact(
                    proj.mesh.position.x,
                    proj.mesh.position.z,
                    proj.color,
                    6
                );
                this.showNotification('Missed Target!', '#ff0055');

                // Clean up projectile Mesh
                this.arenaGroup.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();
                this.projectiles.splice(i, 1);

                // Respawn replacement
                this.spawnJewel(proj.colorName);
            }
        }

        // Decay visual particles
        this.updateParticles(dt);
    }

    /**
     * Removes a ball mesh/light from Three.js scene, disposes components, and splices from array
     */
    removeJewelObject(jewel) {
        if (jewel) {
            this.arenaGroup.remove(jewel.mesh);
            jewel.mesh.geometry.dispose();
            jewel.mesh.material.dispose();
        }
    }

    /**
     * Triggers match ending, presenting the Final Score with an overlay restart button
     */
    triggerGameOver() {
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
        overlay.style.backgroundColor = 'rgba(6, 8, 15, 0.7)';
        overlay.style.backdropFilter = 'blur(12px)';
        overlay.style.webkitBackdropFilter = 'blur(12px)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '100';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.8s ease';

        overlay.innerHTML = `
            <div style="text-align: center; padding: 40px; border-radius: 24px; background: rgba(15, 18, 30, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1); max-width: 450px; width: 90%;">
                <h2 style="font-family: 'Space Grotesk', sans-serif; font-size: 3rem; font-weight: 800; letter-spacing: 4px; color: #ff007f; text-shadow: 0 0 30px rgba(255, 0, 127, 0.6); margin: 0 0 10px 0; text-transform: uppercase;">
                    MATCH OVER
                </h2>
                <p style="font-size: 1.1rem; color: #ffffff; margin: 0 0 10px 0; letter-spacing: 1px;">
                    Final Score: <strong style="color: #00f0ff; font-size: 1.5rem;">${this.score}</strong>
                </p>
                <p style="font-size: 0.85rem; color: #a0aec0; margin: 0 0 30px 0;">
                    Great run! Try standing further out in Zone 3 to get that 3x multiplier!
                </p>
                <button id="dd-restart-btn" style="pointer-events: auto; cursor: pointer; background: linear-gradient(135deg, #ff007f, #8b00ff); border: none; color: white; padding: 14px 40px; font-family: 'Space Grotesk', sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; border-radius: 30px; box-shadow: 0 0 20px rgba(255, 0, 127, 0.4); transition: all 0.3s ease;">
                    Restart Match
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        const btn = overlay.querySelector('#dd-restart-btn');
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.05)';
            btn.style.boxShadow = `0 0 30px rgba(255, 0, 127, 0.8)`;
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1.0)';
            btn.style.boxShadow = `0 0 20px rgba(255, 0, 127, 0.4)`;
        });
        btn.addEventListener('click', () => {
            this.resetGame();
        });

        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 50);
    }

    /**
     * Resets the game state and rebuilds the arena entities dynamically
     */
    resetGame() {
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 800);
        }

        // Remove projectiles
        for (const proj of this.projectiles) {
            this.removeJewelObject(proj);
        }
        this.projectiles = [];

        // Remove ground jewels
        for (const jewel of this.jewels) {
            this.removeJewelObject(jewel);
        }
        this.jewels = [];

        // Remove held jewel
        if (this.heldJewel) {
            this.removeJewelObject(this.heldJewel);
            this.heldJewel = null;
        }

        // Reset positions
        if (this.player) {
            this.player.position.set(0, 0.7, 0);
            this.player.rotation.set(0, 0, 0);
        }
        if (this.target) {
            this.target.position.set(0, 1.5, -18.0);
        }

        this.score = 0;
        this.currentMultiplier = 1;
        this.matchTimer = 0.0;
        this.blueJewelSpawned = false;
        this.gameOver = false;
        this.spacePressedLastFrame = false;

        // Reset HUD displays
        const scoreVal = document.getElementById('dd-score-val');
        if (scoreVal) scoreVal.textContent = 0;

        const heldVal = document.getElementById('dd-held-val');
        if (heldVal) {
            heldVal.textContent = 'None';
            heldVal.style.color = '#718096';
        }

        // Spawn initial jewels
        this.spawnJewel('pink');
        this.spawnJewel('green');
    }

    /**
     * Cleans up all objects, events, and update callbacks for destruction
     */
    destroy() {
        if (this.arenaGroup) {
            window.engine.scene.remove(this.arenaGroup);
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
        window.engine.updateCallbacks = [];
        const hud = document.getElementById('dragondrop-hud');
        if (hud) hud.remove();
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.remove();
    }

    /**
     * Spawns physical particle bursts in the local group space
     */
    createCollisionImpact(x, z, colorHex, particleCount) {
        const particleGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        const particleMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 1.0
        });

        for (let i = 0; i < particleCount; i++) {
            const particleMesh = new THREE.Mesh(particleGeo, particleMat.clone());
            particleMesh.position.set(x, 0.5, z);
            this.arenaGroup.add(particleMesh);

            // Polar random directional vectors
            const angle = Math.random() * Math.PI * 2;
            const velocityMagnitude = 3.0 + Math.random() * 6.0;
            const vx = Math.cos(angle) * velocityMagnitude;
            const vz = Math.sin(angle) * velocityMagnitude;
            const vy = 2.0 + Math.random() * 5.0; // Eject upward

            this.particles.push({
                mesh: particleMesh,
                vx,
                vy,
                vz,
                life: 1.0,
                decay: 1.6 + Math.random() * 1.8
            });
        }
    }

    /**
     * Updates and garbage-collects expired collision particles
     */
    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;

            if (p.life <= 0) {
                // Remove from Three.js scene
                this.arenaGroup.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                // Remove from array
                this.particles.splice(i, 1);
            } else {
                // Apply velocities
                p.mesh.position.x += p.vx * dt;
                p.mesh.position.y += p.vy * dt;
                p.mesh.position.z += p.vz * dt;

                // Apply gravity
                p.vy -= 9.8 * dt;

                // Shrink and fade particles over lifetime
                p.mesh.material.opacity = p.life;
                p.mesh.scale.set(p.life, p.life, p.life);
            }
        }
    }
}

// Expose DragonDropGame globally so engine.js/index.html can instantiate it
window.DragonDropGame = DragonDropGame;
