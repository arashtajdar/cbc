/**
 * CRATE CRUSH gameplay logic
 * Standalone Three.js minigame class for "Crate Crush".
 *
 * Features:
 * - 1 Human Player (controlled via WASD/Arrows + Space)
 * - 3 AI Opponent characters (wander, lift crates, aim, and throw)
 * - Dynamic Crate Dropper (Wood crates deal direct hit damage, TNT crates detonate)
 * - Explosion physics with Area-of-Effect damage and Knockback forces!
 * - Clean visual warning indicators for falling objects
 * - Dynamic HUD and Victory/Game-over templates
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class CrateCrushGame {
    constructor(containerId, playerColor) {
        this.containerId = containerId || 'canvas-container';
        this.playerColor = playerColor !== undefined ? playerColor : 0xff3333;

        this.gameOver = false;
        this.arenaSize = 20;

        // Groups & Pools
        this.arenaGroup = null;
        this.players = [];
        this.crates = [];
        this.particles = [];
        this.explosions = [];

        // Spawning timer
        this.crateSpawnTimer = 0.0;
        this.crateSpawnInterval = 3.0;

        this.spacePressedLastFrame = false;

        this.setup();
    }

    setup() {
        const engine = window.engine;
        if (!engine) {
            console.error('CrateCrush: engine.js not found in global context!');
            return;
        }

        // 1. Coordinate Group aligned to the isometric perspective
        this.arenaGroup = new THREE.Group();
        this.arenaGroup.rotation.y = -Math.PI / 4;
        engine.scene.add(this.arenaGroup);

        // 2. Floor Slab
        const floorGeo = new THREE.BoxGeometry(this.arenaSize, 0.4, this.arenaSize);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x0e111a, // Dark cyber slab
            roughness: 0.75,
            metalness: 0.5
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(0, -0.2, 0);
        floor.receiveShadow = true;
        this.arenaGroup.add(floor);

        // Grid overlay
        const grid = new THREE.GridHelper(this.arenaSize, 10, 0x00f0ff, 0x181f33);
        grid.position.y = 0.01;
        this.arenaGroup.add(grid);

        // 3. Boundary Invisible Walls
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1d2235,
            roughness: 0.8,
            metalness: 0.2,
            transparent: true,
            opacity: 0.2
        });
        const wThick = 0.5;
        const wHeight = 1.6;
        const wallGeoH = new THREE.BoxGeometry(this.arenaSize + wThick, wHeight, wThick);
        const wallGeoV = new THREE.BoxGeometry(wThick, wHeight, this.arenaSize + wThick);

        const wTop = new THREE.Mesh(wallGeoH, wallMat);
        wTop.position.set(0, wHeight / 2, -this.arenaSize / 2 - wThick / 2);
        this.arenaGroup.add(wTop);

        const wBottom = new THREE.Mesh(wallGeoH, wallMat);
        wBottom.position.set(0, wHeight / 2, this.arenaSize / 2 + wThick / 2);
        this.arenaGroup.add(wBottom);

        const wLeft = new THREE.Mesh(wallGeoV, wallMat);
        wLeft.position.set(-this.arenaSize / 2 - wThick / 2, wHeight / 2, 0);
        this.arenaGroup.add(wLeft);

        const wRight = new THREE.Mesh(wallGeoV, wallMat);
        wRight.position.set(this.arenaSize / 2 + wThick / 2, wHeight / 2, 0);
        this.arenaGroup.add(wRight);

        // 4. Initialize Players (Human + 3 AIs)
        this.spawnPlayers();

        // 5. Create health bar HUD overlay
        this.createHUD();

        // Spawn initial 2 crates
        this.spawnCrate('wood');
        this.spawnCrate('tnt');

        // 6. Hook update logic into engine loops
        engine.updateCallbacks.push((dt, time) => {
            this.update(dt, engine.inputs);
        });
    }

    spawnPlayers() {
        const state = window.launcherState;
        const assignments = state.playerAssignments;
        const chars = state.characters;

        const positions = [
            { x: -8, z: 8 }, // P1 (Bottom Left)
            { x: -8, z: -8 }, // P2 (Top Left, AI)
            { x: 8, z: -8 }, // P3 (Top Right, AI)
            { x: 8, z: 8 } // P4 (Bottom Right, AI)
        ];

        const playerKeys = ['p1', 'p2', 'p3', 'p4'];

        playerKeys.forEach((key, idx) => {
            const charIdx = assignments[key];
            const charData = chars[charIdx];
            const pos = positions[idx];

            const isP1 = idx === 0;
            const pColor = isP1 ? this.playerColor : charData.color;

            let meshY = 0;
            const mesh = window.createArticulatedCharacter(charData.shape, pColor);
            mesh.position.set(pos.x, meshY, pos.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.arenaGroup.add(mesh);

            // Add glowing point light on players
            const light = new THREE.PointLight(pColor, 2.0, 6);
            mesh.add(light);

            this.players.push({
                id: idx + 1,
                name: idx === 0 ? 'Player 1' : `Opponent ${idx}`,
                mesh: mesh,
                shape: charData.shape,
                color: pColor,
                hex: isP1 ? '#' + pColor.toString(16).padStart(6, '0') : charData.hex,
                health: 100,
                isAI: idx > 0,
                isDead: false,
                facingAngle: idx === 0 ? 0 : Math.PI,
                carryingCrate: null,
                throwCooldown: 0.0,
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

        const existing = document.getElementById('cratecrush-hud');
        if (existing) existing.remove();

        const hud = document.createElement('div');
        hud.id = 'cratecrush-hud';
        hud.style.position = 'absolute';
        hud.style.top = '30px';
        hud.style.left = '50%';
        hud.style.transform = 'translateX(-50%)';
        hud.style.zIndex = '10';
        hud.style.background = 'rgba(15, 18, 30, 0.7)';
        hud.style.border = '1px solid rgba(255, 255, 255, 0.08)';
        hud.style.backdropFilter = 'blur(16px)';
        hud.style.webkitBackdropFilter = 'blur(16px)';
        hud.style.padding = '12px 28px';
        hud.style.borderRadius = '18px';
        hud.style.display = 'flex';
        hud.style.gap = '25px';
        hud.style.alignItems = 'center';
        hud.style.boxShadow =
            '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255,255,255,0.1)';
        hud.style.fontFamily = "'Outfit', sans-serif";
        hud.style.color = '#ffffff';

        let innerHTML = '';
        this.players.forEach(p => {
            innerHTML += `
                <div id="hud-player-card-${p.id}" style="display: flex; flex-direction: column; width: 110px; align-items: center; gap: 4px; transition: opacity 0.5s ease;">
                    <div style="font-size: 0.65rem; color: #a0aec0; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">${p.name}</div>
                    <div id="hud-name-${p.id}" style="font-family: 'Space Grotesk', sans-serif; font-size: 0.85rem; font-weight: 700; color: ${p.hex}; text-transform: uppercase;">${p.isAI ? 'AI' : 'Human'}</div>
                    
                    <!-- Health Bar BG -->
                    <div style="width: 100%; height: 8px; background: rgba(0,0,0,0.5); border-radius: 4px; overflow: hidden; margin-top: 2px;">
                        <!-- Health Bar Fill -->
                        <div id="hud-hp-bar-${p.id}" style="width: 100%; height: 100%; background: ${p.hex}; box-shadow: 0 0 8px ${p.hex}; transition: width 0.2s ease;"></div>
                    </div>
                    <div id="hud-hp-text-${p.id}" style="font-size: 0.65rem; color: #ffffff; font-family: monospace; font-weight: 600;">100 HP</div>
                </div>
            `;
        });

        hud.innerHTML = innerHTML;
        document.body.appendChild(hud);
    }

    updateHUD() {
        this.players.forEach(p => {
            const hpBar = document.getElementById(`hud-hp-bar-${p.id}`);
            const hpText = document.getElementById(`hud-hp-text-${p.id}`);
            const card = document.getElementById(`hud-player-card-${p.id}`);

            if (hpBar) {
                const hpPercent = Math.max(0, p.health);
                hpBar.style.width = `${hpPercent}%`;
                if (p.health < 30) {
                    hpBar.style.background = '#ff3333';
                    hpBar.style.boxShadow = '0 0 8px #ff3333';
                }
            }
            if (hpText) {
                hpText.textContent = `${Math.ceil(p.health)} HP`;
            }
            if (p.isDead && card) {
                card.style.opacity = '0.25';
                if (hpText) hpText.textContent = 'KO';
            }
        });
    }

    spawnCrate(forceType = null) {
        // Grid size 20 (bounds: -9 to 9)
        let rx, rz, duplicate;
        let attempts = 0;

        do {
            rx = Math.floor((Math.random() - 0.5) * 18);
            rz = Math.floor((Math.random() - 0.5) * 18);
            duplicate = false;

            // Check if crate already exists nearby
            for (const c of this.crates) {
                const dist = Math.sqrt(
                    (c.mesh.position.x - rx) ** 2 + (c.mesh.position.z - rz) ** 2
                );
                if (dist < 1.8) duplicate = true;
            }
            attempts++;
        } while (duplicate && attempts < 10);

        const type = forceType || (Math.random() < 0.25 ? 'tnt' : 'wood');

        // Create Cube mesh representation of crate
        const crateGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);

        let crateMat;
        if (type === 'tnt') {
            crateMat = new THREE.MeshStandardMaterial({
                color: 0xcc1111, // Bright warning red
                roughness: 0.4,
                metalness: 0.6,
                emissive: 0xcc1111,
                emissiveIntensity: 0.3
            });
        } else {
            crateMat = new THREE.MeshStandardMaterial({
                color: 0x8b5a2b, // Woody brown
                roughness: 0.85,
                metalness: 0.1
            });
        }

        const mesh = new THREE.Mesh(crateGeo, crateMat);
        mesh.position.set(rx, 15.0, rz); // drops from height Y = 15
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.arenaGroup.add(mesh);

        // Add MENACING point light for TNT
        if (type === 'tnt') {
            const light = new THREE.PointLight(0xff3300, 2.0, 4);
            mesh.add(light);
        }

        // Ground Warning Indicator Ring
        const indGeo = new THREE.RingGeometry(0.85, 1.0, 32);
        const indMat = new THREE.MeshBasicMaterial({
            color: type === 'tnt' ? 0xff0000 : 0x8b5a2b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const indicator = new THREE.Mesh(indGeo, indMat);
        indicator.rotation.x = Math.PI / 2;
        indicator.position.set(rx, 0.02, rz);
        this.arenaGroup.add(indicator);

        this.crates.push({
            mesh,
            type,
            state: 'falling',
            carryPlayer: null,
            vx: 0,
            vy: -7.0, // downward falling speed
            vz: 0,
            indicator,
            throwerId: null
        });
    }

    throwCrate(player) {
        const crate = player.carryingCrate;
        if (!crate) return;

        const angle = player.facingAngle;
        const throwSpeed = 15.5;

        // Propel forward relative to facing direction
        crate.vx = Math.cos(angle) * throwSpeed;
        crate.vz = -Math.sin(angle) * throwSpeed;
        crate.vy = 4.8; // arc upwards velocity
        crate.throwerId = player.id;
        crate.state = 'thrown';
        crate.carryPlayer = null;

        player.carryingCrate = null;

        this.showNotification('CRATE LAUNCHED!', player.hex);
    }

    triggerExplosion(x, z) {
        // 1. Exploding visual sphere
        const expGeo = new THREE.SphereGeometry(1.2, 16, 16);
        const expMat = new THREE.MeshBasicMaterial({
            color: 0xff3b00,
            transparent: true,
            opacity: 0.85
        });
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expMesh.position.set(x, 0.6, z);
        this.arenaGroup.add(expMesh);

        const expLight = new THREE.PointLight(0xff3b00, 8.0, 12);
        expMesh.add(expLight);

        this.explosions.push({
            mesh: expMesh,
            light: expLight,
            life: 1.0,
            decay: 3.8
        });

        // Fire particle burst
        this.spawnExplosionParticles(x, z, 0xff5500, 24);

        // 2. Deal AoE damage and knockback force to players
        const maxRadius = 5.0;
        this.players.forEach(p => {
            if (p.isDead) return;

            const px = p.mesh.position.x;
            const pz = p.mesh.position.z;
            const dx = px - x;
            const dz = pz - z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < maxRadius) {
                // AoE damage formula: scaling linearly down from epicenter (50 max)
                const dmg = 50 * (1.0 - dist / maxRadius);
                p.health = Math.max(0, p.health - dmg);

                // Knockback vectors (pushes players away from detonation point)
                if (dist > 0.1) {
                    const force = 4.2 * (1.0 - dist / maxRadius);
                    p.mesh.position.x += (dx / dist) * force;
                    p.mesh.position.z += (dz / dist) * force;

                    // Clamps inside wall boundary
                    const boundary = 9.4;
                    p.mesh.position.x = Math.max(-boundary, Math.min(boundary, p.mesh.position.x));
                    p.mesh.position.z = Math.max(-boundary, Math.min(boundary, p.mesh.position.z));
                }

                this.flashPlayerColor(p);
            }
        });
    }

    flashPlayerColor(player) {
        const originalCol = player.color;
        player.mesh.material.color.setHex(0xffffff);
        player.mesh.material.emissive.setHex(0xff0000);
        player.mesh.material.emissiveIntensity = 1.8;

        setTimeout(() => {
            if (!player.isDead) {
                player.mesh.material.color.setHex(originalCol);
                player.mesh.material.emissive.setHex(originalCol);
                player.mesh.material.emissiveIntensity = 0.25;
            }
        }, 150);
    }

    updateCrates(dt) {
        for (let i = this.crates.length - 1; i >= 0; i--) {
            const c = this.crates[i];

            if (c.state === 'falling') {
                c.mesh.position.y += c.vy * dt;

                // Spin warning rings
                if (c.indicator) {
                    c.indicator.rotation.z += 1.2 * dt;
                    c.indicator.material.opacity =
                        0.35 + Math.sin(window.engine.clock.getElapsedTime() * 12.0) * 0.2;
                }

                // Check landing
                if (c.mesh.position.y <= 0.6) {
                    c.mesh.position.y = 0.6;
                    c.state = 'ground';
                    c.vy = 0;

                    this.cleanupIndicator(c);
                    this.spawnWoodShatterParticles(
                        c.mesh.position.x,
                        0.1,
                        c.mesh.position.z,
                        c.type === 'tnt' ? 0xcc1111 : 0x8b5a2b,
                        8
                    );

                    if (c.type === 'tnt') {
                        this.triggerExplosion(c.mesh.position.x, c.mesh.position.z);
                        this.removeCrateAt(i);
                        continue;
                    }
                }

                // Crush player if lands directly on them
                let crushed = null;
                this.players.forEach(p => {
                    if (p.isDead) return;
                    const d = p.mesh.position.distanceTo(c.mesh.position);
                    if (d < 1.05 && c.mesh.position.y < p.mesh.position.y + 0.8) {
                        crushed = p;
                    }
                });

                if (crushed) {
                    this.cleanupIndicator(c);

                    if (c.type === 'tnt') {
                        this.triggerExplosion(c.mesh.position.x, c.mesh.position.z);
                    } else {
                        crushed.health = Math.max(0, crushed.health - 25);
                        this.flashPlayerColor(crushed);
                        this.spawnWoodShatterParticles(
                            c.mesh.position.x,
                            c.mesh.position.y,
                            c.mesh.position.z,
                            0x8b5a2b,
                            15
                        );
                    }
                    this.removeCrateAt(i);
                    continue;
                }
            } else if (c.state === 'lifted') {
                const p = c.carryPlayer;
                if (p.isDead) {
                    c.state = 'falling';
                    c.vy = -6.0;
                    p.carryingCrate = null;
                    c.carryPlayer = null;
                } else {
                    c.mesh.position.set(
                        p.mesh.position.x,
                        p.mesh.position.y + 1.25,
                        p.mesh.position.z
                    );
                    c.mesh.rotation.copy(p.mesh.rotation);
                }
            } else if (c.state === 'thrown') {
                c.mesh.position.x += c.vx * dt;
                c.mesh.position.z += c.vz * dt;
                c.vy -= 9.8 * dt; // gravity
                c.mesh.position.y += c.vy * dt;

                c.mesh.rotation.x += 3.2 * dt;
                c.mesh.rotation.y += 2.0 * dt;

                // Floor boundary collision
                if (c.mesh.position.y <= 0.6) {
                    if (c.type === 'tnt') {
                        this.triggerExplosion(c.mesh.position.x, c.mesh.position.z);
                    } else {
                        this.spawnWoodShatterParticles(
                            c.mesh.position.x,
                            0.1,
                            c.mesh.position.z,
                            0x8b5a2b,
                            12
                        );
                    }
                    this.removeCrateAt(i);
                    continue;
                }

                // Intersection hits with other players
                let hitTarget = null;
                this.players.forEach(p => {
                    if (p.isDead) return;
                    if (p.id === c.throwerId) return; // ignore thrower

                    const dist = p.mesh.position.distanceTo(c.mesh.position);
                    if (dist < 1.05) {
                        hitTarget = p;
                    }
                });

                if (hitTarget) {
                    if (c.type === 'tnt') {
                        this.triggerExplosion(c.mesh.position.x, c.mesh.position.z);
                    } else {
                        hitTarget.health = Math.max(0, hitTarget.health - 20);
                        this.flashPlayerColor(hitTarget);
                        this.spawnWoodShatterParticles(
                            c.mesh.position.x,
                            c.mesh.position.y,
                            c.mesh.position.z,
                            0x8b5a2b,
                            15
                        );
                    }
                    this.removeCrateAt(i);
                    continue;
                }

                // Arena bounds checks
                const boundLimit = this.arenaSize / 2 + 1.0;
                if (
                    Math.abs(c.mesh.position.x) > boundLimit ||
                    Math.abs(c.mesh.position.z) > boundLimit
                ) {
                    if (c.type === 'tnt') {
                        this.triggerExplosion(c.mesh.position.x, c.mesh.position.z);
                    } else {
                        this.spawnWoodShatterParticles(
                            c.mesh.position.x,
                            c.mesh.position.y,
                            c.mesh.position.z,
                            0x8b5a2b,
                            8
                        );
                    }
                    this.removeCrateAt(i);
                    continue;
                }
            }
        }
    }

    cleanupIndicator(crate) {
        if (crate.indicator) {
            this.arenaGroup.remove(crate.indicator);
            crate.indicator.geometry.dispose();
            crate.indicator.material.dispose();
            crate.indicator = null;
        }
    }

    removeCrateAt(idx) {
        const c = this.crates[idx];
        if (c) {
            this.cleanupIndicator(c);
            this.arenaGroup.remove(c.mesh);
            c.mesh.geometry.dispose();
            c.mesh.material.dispose();
            this.crates.splice(idx, 1);
        }
    }

    updateAI(dt) {
        const boundary = 9.4;
        this.players.forEach(ai => {
            if (!ai.isAI || ai.isDead) return;

            ai.throwCooldown -= dt;

            // Speed reduction while carrying
            const speed = ai.carryingCrate ? 6.3 : 9.0;

            if (!ai.carryingCrate) {
                // Find closest grounded crate
                let target = null;
                let minDist = Infinity;

                this.crates.forEach(c => {
                    if (c.state === 'ground' || c.state === 'falling') {
                        const dist = ai.mesh.position.distanceTo(c.mesh.position);
                        if (dist < minDist) {
                            minDist = dist;
                            target = c;
                        }
                    }
                });

                if (target) {
                    const dx = target.mesh.position.x - ai.mesh.position.x;
                    const dz = target.mesh.position.z - ai.mesh.position.z;
                    const d = Math.sqrt(dx * dx + dz * dz);

                    if (d > 1.1) {
                        const dirX = dx / d;
                        const dirZ = dz / d;

                        ai.facingAngle = Math.atan2(-dirZ, dirX);
                        ai.mesh.rotation.y = ai.facingAngle;

                        ai.mesh.position.x += dirX * speed * dt;
                        ai.mesh.position.z += dirZ * speed * dt;
                    } else if (ai.throwCooldown <= 0) {
                        // Lift Crate!
                        target.state = 'lifted';
                        target.carryPlayer = ai;
                        ai.carryingCrate = target;
                        ai.throwCooldown = 0.6 + Math.random() * 0.7; // delay before launch
                    }
                } else {
                    // Wander randomly
                    if (!ai.wanderTarget) {
                        ai.wanderTarget = {
                            x: (Math.random() - 0.5) * 18,
                            z: (Math.random() - 0.5) * 18
                        };
                    }

                    const dx = ai.wanderTarget.x - ai.mesh.position.x;
                    const dz = ai.wanderTarget.z - ai.mesh.position.z;
                    const d = Math.sqrt(dx * dx + dz * dz);

                    if (d > 1.0) {
                        const dirX = dx / d;
                        const dirZ = dz / d;

                        ai.facingAngle = Math.atan2(-dirZ, dirX);
                        ai.mesh.rotation.y = ai.facingAngle;

                        ai.mesh.position.x += dirX * speed * dt;
                        ai.mesh.position.z += dirZ * speed * dt;
                    } else {
                        ai.wanderTarget = null;
                    }
                }
            } else {
                // Wait to throw at alive player
                if (ai.throwCooldown <= 0) {
                    const targets = this.players.filter(p => p.id !== ai.id && !p.isDead);
                    if (targets.length > 0) {
                        const targetOpponent = targets[Math.floor(Math.random() * targets.length)];

                        const dx = targetOpponent.mesh.position.x - ai.mesh.position.x;
                        const dz = targetOpponent.mesh.position.z - ai.mesh.position.z;

                        ai.facingAngle = Math.atan2(-dz, dx);
                        ai.mesh.rotation.y = ai.facingAngle;

                        this.throwCrate(ai);
                        ai.throwCooldown = 1.0 + Math.random() * 1.5;
                        ai.wanderTarget = null;
                    }
                }
            }

            ai.mesh.position.x = Math.max(-boundary, Math.min(boundary, ai.mesh.position.x));
            ai.mesh.position.z = Math.max(-boundary, Math.min(boundary, ai.mesh.position.z));
        });
    }

    updateVisualEffects(dt) {
        // Visual particles decay
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

                p.vy -= 9.8 * dt; // gravity

                p.mesh.material.opacity = p.life;
                p.mesh.scale.set(p.life, p.life, p.life);
            }
        }

        // Exploding visual sphere scaling and fadeout
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.life -= exp.decay * dt;

            if (exp.life <= 0) {
                this.arenaGroup.remove(exp.mesh);
                exp.mesh.geometry.dispose();
                exp.mesh.material.dispose();
                this.explosions.splice(i, 1);
            } else {
                const s = (1.0 - exp.life) * 4.0 + 1.0;
                exp.mesh.scale.set(s, s, s);
                exp.mesh.material.opacity = exp.life;
                if (exp.light) {
                    exp.light.intensity = exp.life * 8.0;
                }
            }
        }
    }

    spawnExplosionParticles(x, z, colorHex, count) {
        const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        const pMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 1.0
        });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(pGeo, pMat.clone());
            mesh.position.set(x, 0.5 + Math.random() * 0.8, z);
            this.arenaGroup.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const velocity = 2.5 + Math.random() * 5.5;
            const vx = Math.cos(angle) * velocity;
            const vz = Math.sin(angle) * velocity;
            const vy = 2.5 + Math.random() * 4.5;

            this.particles.push({
                mesh,
                vx,
                vy,
                vz,
                life: 1.0,
                decay: 1.6 + Math.random() * 1.5
            });
        }
    }

    spawnWoodShatterParticles(x, y, z, colorHex, count) {
        const pGeo = new THREE.BoxGeometry(0.2, 0.1, 0.1);
        const pMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.85
        });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(pGeo, pMat.clone());
            mesh.position.set(x, y, z);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            this.arenaGroup.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const velocity = 1.2 + Math.random() * 2.8;
            const vx = Math.cos(angle) * velocity;
            const vz = Math.sin(angle) * velocity;
            const vy = 1.5 + Math.random() * 3.0;

            this.particles.push({
                mesh,
                vx,
                vy,
                vz,
                life: 1.0,
                decay: 1.4 + Math.random() * 1.0
            });
        }
    }

    checkGameStatus() {
        if (this.gameOver) return;

        const p1 = this.players[0];
        if (p1.isDead) {
            this.triggerGameOver(false);
            return;
        }

        const aliveOpponents = this.players.slice(1).filter(p => !p.isDead);
        if (aliveOpponents.length === 0) {
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
                    ${isVictory ? 'You crushed all your opponents!' : 'You got smashed! Better luck next time.'}
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="crush-exit-btn" style="pointer-events: auto; cursor: pointer; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; border-radius: 25px; transition: all 0.3s ease;">
                        Exit to Menu
                    </button>
                    <button id="crush-restart-btn" style="pointer-events: auto; cursor: pointer; background: linear-gradient(135deg, #00f0ff, #0072ff); border: none; color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border-radius: 25px; box-shadow: 0 0 20px rgba(0, 240, 255, 0.35); transition: all 0.3s ease;">
                        Play Again
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('crush-exit-btn').addEventListener('click', () => {
            window.exitToLauncher();
        });
        document.getElementById('crush-restart-btn').addEventListener('click', () => {
            this.resetGame();
        });

        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 50);
    }

    update(dt, inputs) {
        if (this.gameOver) {
            this.updateVisualEffects(dt);
            return;
        }

        // 1. Spawning system logic
        this.crateSpawnTimer += dt;
        if (this.crateSpawnTimer >= this.crateSpawnInterval && this.crates.length < 15) {
            this.crateSpawnTimer = 0.0;
            this.spawnCrate();
        }

        // 2. Human player controls
        const p1 = this.players[0];
        if (p1 && !p1.isDead) {
            let moveX = 0;
            let moveZ = 0;
            if (inputs.w || inputs.ArrowUp) moveZ -= 1;
            if (inputs.s || inputs.ArrowDown) moveZ += 1;
            if (inputs.a || inputs.ArrowLeft) moveX -= 1;
            if (inputs.d || inputs.ArrowRight) moveX += 1;

            const speed = p1.carryingCrate ? 6.3 : 9.0;

            if (moveX !== 0 || moveZ !== 0) {
                const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
                const dirX = moveX / len;
                const dirZ = moveZ / len;

                const isoX = dirZ;
                const isoZ = -dirX;

                p1.facingAngle = Math.atan2(-isoZ, isoX);
                p1.mesh.rotation.y = p1.facingAngle;

                p1.mesh.position.x += isoX * speed * dt;
                p1.mesh.position.z += isoZ * speed * dt;

                const boundary = 9.4;
                p1.mesh.position.x = Math.max(-boundary, Math.min(boundary, p1.mesh.position.x));
                p1.mesh.position.z = Math.max(-boundary, Math.min(boundary, p1.mesh.position.z));
            }

            // Human player action key binding Space
            const spaceTrigger = inputs.Space && !this.spacePressedLastFrame;
            this.spacePressedLastFrame = inputs.Space;

            if (spaceTrigger) {
                if (!p1.carryingCrate) {
                    let nearest = null;
                    let minDist = 1.3;
                    this.crates.forEach(c => {
                        if (c.state === 'ground') {
                            const d = p1.mesh.position.distanceTo(c.mesh.position);
                            if (d < minDist) {
                                minDist = d;
                                nearest = c;
                            }
                        }
                    });

                    if (nearest) {
                        nearest.state = 'body'; // placeholder block to lock state change
                        nearest.state = 'lifted';
                        nearest.carryPlayer = p1;
                        p1.carryingCrate = nearest;
                    }
                } else {
                    this.throwCrate(p1);
                }
            }
        }

        // 3. Opponent AI behaviours
        this.updateAI(dt);

        // 4. Phys/Collision updates
        this.updateCrates(dt);

        // 5. FX/Particles updates
        this.updateVisualEffects(dt);

        // 6. HUD rendering updates
        this.updateHUD();

        // 7. Check player health and statuses
        this.players.forEach(p => {
            if (!p.isDead) {
                if (p.lastPosition) {
                    const dist = p.mesh.position.distanceTo(p.lastPosition);
                    const speed = dist / dt;
                    if (window.animateArticulatedCharacter) {
                        window.animateArticulatedCharacter(
                            p.mesh,
                            speed,
                            window.engine.clock.getElapsedTime()
                        );
                    }
                }
                if (!p.lastPosition) p.lastPosition = new THREE.Vector3();
                p.lastPosition.copy(p.mesh.position);
            }
            if (!p.isDead && p.health <= 0) {
                p.isDead = true;
                this.spawnExplosionParticles(p.mesh.position.x, p.mesh.position.z, p.color, 15);
                this.arenaGroup.remove(p.mesh);
                if (p.carryingCrate) {
                    p.carryingCrate.state = 'falling';
                    p.carryingCrate.vy = -6.0;
                    p.carryingCrate.carryPlayer = null;
                    p.carryingCrate = null;
                }
            }
        });

        // 8. Victory conditions check
        this.checkGameStatus();
    }

    showNotification(text, colorHex) {
        const notif = document.createElement('div');
        notif.textContent = text;
        notif.style.position = 'absolute';
        notif.style.top = '110px';
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

        const hud = document.getElementById('cratecrush-hud');
        if (hud) hud.remove();

        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.remove();
    }
}

// Expose CrateCrushGame globally
window.CrateCrushGame = CrateCrushGame;
