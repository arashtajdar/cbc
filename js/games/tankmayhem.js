/**
 * TANK MAYHEM gameplay logic
 * Standalone Three.js minigame class for "Tank Mayhem".
 * 
 * Features:
 * - Miniature AABB destructible maze arena.
 * - Dual-track tank steering movement physics.
 * - Projectiles that bounce off indestructible walls up to 2 times.
 * - Line-of-sight AI checking grid vectors to target Player 1.
 * - Destructible wall fractures and tank HP bars HUD tracking.
 */

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class TankMayhemGame {
    constructor(containerId, playerColor) {
        this.containerId = containerId || 'canvas-container';
        this.playerColor = playerColor !== undefined ? playerColor : 0xff3333;

        this.gameOver = false;
        
        // Groups & Pools
        this.arenaGroup = null;
        this.players = [];
        this.walls = [];
        this.bullets = [];
        this.particles = [];

        this.originalCameraPos = null;

        // Maze Grid definition (11x11 grid)
        // #: Indestructible, D: Destructible, .: Empty, S: Spawn point
        this.mazeMap = [
            "###########",
            "#S...#...S#",
            "#.D.#.#.D.#",
            "#..D...D..#",
            "##.#####.##",
            "#....D....#",
            "##.#####.##",
            "#..D...D..#",
            "#.D.#.#.D.#",
            "#S...#...S#",
            "###########"
        ];
        this.gridSize = 11;
        this.cellSize = 1.6;
        this.gridOffset = (this.gridSize - 1) * this.cellSize / 2; // 8.0

        this.setup();
    }

    setup() {
        const engine = window.engine;
        if (!engine) {
            console.error("TankMayhem: engine.js not found in global context!");
            return;
        }

        // 1. Tactical top-down view looking down at maze
        this.originalCameraPos = engine.camera.position.clone();
        engine.camera.position.set(0, 19, 13);
        engine.camera.lookAt(0, -1, 0);

        // 2. Coordinate Group aligned to the isometric perspective
        this.arenaGroup = new THREE.Group();
        this.arenaGroup.rotation.y = -Math.PI / 4;
        engine.scene.add(this.arenaGroup);

        // 3. Floor slab
        const floorGeo = new THREE.BoxGeometry(this.gridSize * this.cellSize, 0.2, this.gridSize * this.cellSize);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x111422, // Dark cyber blue floor
            roughness: 0.8,
            metalness: 0.3
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(0, -0.1, 0);
        floor.receiveShadow = true;
        this.arenaGroup.add(floor);

        // 4. Build Maze
        this.buildMaze();

        // 5. Spawn Tanks (Human + 3 AIs)
        this.spawnTanks();

        // 6. Create HUD
        this.createHUD();

        // 7. Hook update logic into engine loops
        engine.updateCallbacks.push((dt, time) => {
            this.update(dt, engine.inputs);
        });
    }

    buildMaze() {
        const wallGeo = new THREE.BoxGeometry(this.cellSize, 1.2, this.cellSize);

        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const char = this.mazeMap[r][c];
                if (char === '#' || char === 'D') {
                    const isDestruct = (char === 'D');
                    const color = isDestruct ? 0xcc6633 : 0x4a5263; // rusty brown vs concrete grey
                    const emissive = isDestruct ? 0x331100 : 0x111622;
                    const wallMat = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: 0.7,
                        metalness: 0.3,
                        emissive: emissive,
                        emissiveIntensity: 0.3
                    });

                    const mesh = new THREE.Mesh(wallGeo, wallMat);
                    const x = c * this.cellSize - this.gridOffset;
                    const z = r * this.cellSize - this.gridOffset;
                    mesh.position.set(x, 0.6, z);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    this.arenaGroup.add(mesh);

                    this.walls.push({
                        mesh,
                        row: r,
                        col: c,
                        isDestructible: isDestruct,
                        isDestroyed: false
                    });
                }
            }
        }
    }

    spawnTanks() {
        const state = window.launcherState;
        const assignments = state.playerAssignments;
        const chars = state.characters;

        const startCoords = [
            { r: 1, c: 1, angle: 0 },
            { r: 1, c: 9, angle: Math.PI },
            { r: 9, c: 1, angle: 0 },
            { r: 9, c: 9, angle: Math.PI }
        ];

        const playerKeys = ['p1', 'p2', 'p3', 'p4'];

        playerKeys.forEach((key, idx) => {
            const charIdx = assignments[key];
            const charData = chars[charIdx];
            const start = startCoords[idx];

            const isP1 = (idx === 0);
            const pColor = isP1 ? this.playerColor : charData.color;

            // Assemble cute 3D Tank Mesh Group
            const tankGroup = new THREE.Group();

            // Tracks / Treads
            const treadMat = new THREE.MeshStandardMaterial({ color: 0x181a22, roughness: 0.9 });
            const treadL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.16), treadMat);
            treadL.position.set(0, 0.1, -0.3);
            treadL.castShadow = true;
            tankGroup.add(treadL);

            const treadR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.16), treadMat);
            treadR.position.set(0, 0.1, 0.3);
            treadR.castShadow = true;
            tankGroup.add(treadR);

            // Hull
            const hullMat = new THREE.MeshStandardMaterial({
                color: pColor,
                roughness: 0.3,
                metalness: 0.7,
                emissive: pColor,
                emissiveIntensity: 0.15
            });
            const hull = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.48), hullMat);
            hull.position.set(0, 0.23, 0);
            hull.castShadow = true;
            tankGroup.add(hull);

            // Turret
            const turret = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.34), hullMat);
            turret.position.set(-0.06, 0.45, 0);
            turret.castShadow = true;
            tankGroup.add(turret);

            // Barrel
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8e9bb0, metalness: 0.8 });
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), barrelMat);
            barrel.rotation.z = Math.PI / 2; // points forward along positive X
            barrel.position.set(0.32, 0.45, 0);
            barrel.castShadow = true;
            tankGroup.add(barrel);

            // Spotlight under turret
            const light = new THREE.PointLight(pColor, 2.0, 5);
            light.position.set(0, 0.45, 0);
            tankGroup.add(light);

            // Position tank inside maze
            const x = start.c * this.cellSize - this.gridOffset;
            const z = start.r * this.cellSize - this.gridOffset;
            tankGroup.position.set(x, 0.0, z);

            this.arenaGroup.add(tankGroup);

            this.players.push({
                id: idx + 1,
                name: idx === 0 ? "Player 1" : `Opponent ${idx}`,
                mesh: tankGroup,
                color: pColor,
                hex: isP1 ? '#' + pColor.toString(16).padStart(6, '0') : charData.hex,
                isAI: idx > 0,
                isDead: false,
                health: 100,
                facingAngle: start.angle,
                shootCooldown: 0.0,
                activeBulletsCount: 0
            });
        });
    }

    createHUD() {
        // Hide other HUD elements
        const ballistixHud = document.querySelector('.score-container');
        if (ballistixHud) ballistixHud.style.display = 'none';
        const ballistixControls = document.querySelector('.control-panel');
        if (ballistixControls) ballistixControls.style.display = 'none';

        const existing = document.getElementById('tankmayhem-hud');
        if (existing) existing.remove();

        const hud = document.createElement('div');
        hud.id = 'tankmayhem-hud';
        hud.style.position = 'absolute';
        hud.style.top = '30px';
        hud.style.left = '50%';
        hud.style.transform = 'translateX(-50%)';
        hud.style.zIndex = '10';
        hud.style.background = 'rgba(10, 12, 22, 0.7)';
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
                    
                    <!-- Health Bar BG -->
                    <div style="width: 100%; height: 8px; background: rgba(0,0,0,0.5); border-radius: 4px; overflow: hidden; margin-top: 2px;">
                        <div id="hud-hp-bar-${p.id}" style="width: 100%; height: 100%; background: ${p.hex}; box-shadow: 0 0 8px ${p.hex}; transition: width 0.2s ease;"></div>
                    </div>
                    <div id="hud-hp-text-${p.id}" style="font-size: 0.65rem; color: #ffffff; font-family: monospace; font-weight: 600;">100 HP</div>
                </div>
            `;
        });

        hud.innerHTML = innerHTML;
        document.body.appendChild(hud);

        // Update layouts in standard instructions hud
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent = "W/S to Drive. A/D to Steer Turret. Spacebar to FIRE. Projectiles bounce off concrete walls up to 2 times. Rusty walls are destructible!";
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = "Tank Mayhem";
        }
    }

    updateHUD() {
        this.players.forEach(p => {
            const hpBar = document.getElementById(`hud-hp-bar-${p.id}`);
            const hpText = document.getElementById(`hud-hp-text-${p.id}`);
            const card = document.getElementById(`hud-player-card-${p.id}`);

            if (p.isDead) {
                if (card) card.style.opacity = '0.25';
                if (hpBar) hpBar.style.width = '0%';
                if (hpText) hpText.textContent = "KO";
            } else {
                if (hpBar) {
                    const hpPercent = Math.max(0, p.health);
                    hpBar.style.width = `${hpPercent}%`;
                    if (p.health < 30) {
                        hpBar.style.background = '#ff003c';
                        hpBar.style.boxShadow = '0 0 8px #ff003c';
                    }
                }
                if (hpText) {
                    hpText.textContent = `${Math.ceil(p.health)} HP`;
                }
            }
        });
    }

    destroyWall(wall) {
        wall.isDestroyed = true;
        this.arenaGroup.remove(wall.mesh);
        wall.mesh.geometry.dispose();
        wall.mesh.material.dispose();

        // Fracture block visual particles
        this.spawnFractureParticles(wall.mesh.position.x, 0.4, wall.mesh.position.z, 0xcc6633, 12);
        this.showNotification("Rusty Wall Fractured!", "#cc6633");
    }

    checkWallCollision(x, z, radius) {
        for (const w of this.walls) {
            if (w.isDestroyed) continue;
            const wx = w.mesh.position.x;
            const wz = w.mesh.position.z;
            const sizeLimit = (this.cellSize / 2) + radius - 0.05;
            if (x > wx - sizeLimit && x < wx + sizeLimit && z > wz - sizeLimit && z < wz + sizeLimit) {
                return w; // Collides with this wall
            }
        }
        return null;
    }

    shootBullet(player) {
        if (player.activeBulletsCount >= 3) return;

        player.activeBulletsCount++;
        
        // Spawn bullet from barrel tip
        // local barrel offset points forward on positive X by 0.55
        const localTip = new THREE.Vector3(0.55, 0.45, 0);
        localTip.applyMatrix4(player.mesh.matrixWorld);

        const bGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const bMat = new THREE.MeshBasicMaterial({
            color: player.color,
            transparent: false
        });
        const mesh = new THREE.Mesh(bGeo, bMat);
        mesh.position.copy(localTip);
        this.arenaGroup.add(mesh);

        // Add glowing point light on bullet
        const light = new THREE.PointLight(player.color, 3.0, 3);
        mesh.add(light);

        const speed = 11.0;
        const vx = Math.cos(player.facingAngle) * speed;
        const vz = -Math.sin(player.facingAngle) * speed;

        this.bullets.push({
            mesh,
            vx,
            vz,
            ownerId: player.id,
            bounces: 0,
            life: 1.0,
            prevPos: mesh.position.clone()
        });

        // Muzzle fire flash particle burst
        this.spawnSparks(localTip.x, localTip.y, localTip.z, player.color, 4);
    }

    update(dt, inputs) {
        if (this.gameOver) {
            this.updateVisualEffects(dt);
            return;
        }

        // 1. Human player tank controls
        const p1 = this.players[0];
        if (p1 && !p1.isDead) {
            if (p1.shootCooldown > 0) p1.shootCooldown -= dt;

            // Hull steering (A/D tracks)
            let rotationSpeed = 2.5 * dt; // radians per second
            if (inputs.a || inputs.ArrowLeft) {
                p1.facingAngle += rotationSpeed;
            }
            if (inputs.d || inputs.ArrowRight) {
                p1.facingAngle -= rotationSpeed;
            }
            p1.mesh.rotation.y = p1.facingAngle;

            // Drive forward/backward
            let drivePower = 0;
            if (inputs.w || inputs.ArrowUp) drivePower = 3.6; // speed units
            if (inputs.s || inputs.ArrowDown) drivePower = -2.2;

            if (drivePower !== 0) {
                const dx = Math.cos(p1.facingAngle) * drivePower * dt;
                const dz = -Math.sin(p1.facingAngle) * drivePower * dt;

                const newX = p1.mesh.position.x + dx;
                const newZ = p1.mesh.position.z + dz;

                // Slide checks on collisions
                if (!this.checkWallCollision(newX, newZ, 0.32)) {
                    p1.mesh.position.x = newX;
                    p1.mesh.position.z = newZ;
                } else {
                    if (!this.checkWallCollision(newX, p1.mesh.position.z, 0.32)) {
                        p1.mesh.position.x = newX;
                    } else if (!this.checkWallCollision(p1.mesh.position.x, newZ, 0.32)) {
                        p1.mesh.position.z = newZ;
                    }
                }
            }

            // Space key firing
            const spaceTrigger = inputs.Space && !this.spacePressedLastFrame;
            this.spacePressedLastFrame = inputs.Space;

            if (spaceTrigger && p1.shootCooldown <= 0) {
                this.shootBullet(p1);
                p1.shootCooldown = 0.45; // firing delay cooldown
            }
        }

        // 2. Opponent AI steering
        this.updateAI(dt);

        // 3. Bullet travels and reflections
        this.updateBullets(dt);

        // 4. Update particle visual decays
        this.updateVisualEffects(dt);

        // 5. Update HUD state
        this.updateHUD();

        // 6. Check player survival
        this.players.forEach(p => {
            if (!p.isDead && p.health <= 0) {
                p.isDead = true;
                this.spawnFractureParticles(p.mesh.position.x, 0.4, p.mesh.position.z, p.color, 20);
                this.arenaGroup.remove(p.mesh);
                this.showNotification(`${p.name} BLOWN UP!`, p.hex);
            }
        });

        // 7. Check game status
        this.checkGameStatus();
    }

    updateBullets(dt) {
        const wSize = this.cellSize / 2;

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];

            // Store previous coordinate before step
            b.prevPos.copy(b.mesh.position);

            // Advance bullet position
            b.mesh.position.x += b.vx * dt;
            b.mesh.position.z += b.vz * dt;

            // Bounding collision checks with walls
            const hitWall = this.checkWallCollision(b.mesh.position.x, b.mesh.position.z, 0.1);
            if (hitWall) {
                if (hitWall.isDestructible) {
                    this.destroyWall(hitWall);
                    // Destroy bullet
                    b.life = 0;
                } else {
                    // Reflect on outer walls
                    b.bounces++;
                    if (b.bounces > 2) {
                        b.life = 0; // self-destruct
                    } else {
                        const wx = hitWall.mesh.position.x;
                        const wz = hitWall.mesh.position.z;
                        
                        const fromLeft = (b.prevPos.x <= wx - wSize);
                        const fromRight = (b.prevPos.x >= wx + wSize);
                        const fromTop = (b.prevPos.z <= wz - wSize);
                        const fromBottom = (b.prevPos.z >= wz + wSize);

                        if (fromLeft || fromRight) {
                            b.vx = -b.vx;
                            b.mesh.position.x = fromLeft ? (wx - wSize - 0.05) : (wx + wSize + 0.05);
                        } else if (fromTop || fromBottom) {
                            b.vz = -b.vz;
                            b.mesh.position.z = fromTop ? (wz - wSize - 0.05) : (wz + wSize + 0.05);
                        } else {
                            // general corner reflection fallback
                            b.vx = -b.vx;
                            b.vz = -b.vz;
                        }

                        // Spark feedback
                        this.spawnSparks(b.mesh.position.x, 0.45, b.mesh.position.z, 0xffaa00, 4);
                    }
                }
            }

            // Bounding hit checks with tank hulls (including own)
            if (b.life > 0) {
                for (let j = 0; j < this.players.length; j++) {
                    const p = this.players[j];
                    if (p.isDead) continue;

                    const d = p.mesh.position.distanceTo(b.mesh.position);
                    if (d < 0.45) { // hit radius
                        p.health = Math.max(0, p.health - 25);
                        this.spawnFractureParticles(b.mesh.position.x, 0.45, b.mesh.position.z, p.color, 8);
                        
                        b.life = 0; // destroy bullet
                        break;
                    }
                }
            }

            // Cleanup dead bullets
            if (b.life <= 0) {
                // Decrement active shooter count
                const shooter = this.players.find(p => p.id === b.ownerId);
                if (shooter) {
                    shooter.activeBulletsCount = Math.max(0, shooter.activeBulletsCount - 1);
                }

                this.arenaGroup.remove(b.mesh);
                b.mesh.geometry.dispose();
                b.mesh.material.dispose();
                this.bullets.splice(i, 1);
            }
        }
    }

    updateAI(dt) {
        const p1 = this.players[0];

        this.players.forEach(ai => {
            if (!ai.isAI || ai.isDead) return;

            if (ai.shootCooldown > 0) ai.shootCooldown -= dt;

            // Move forward
            const speed = 2.4;
            const dx = Math.cos(ai.facingAngle) * speed * dt;
            const dz = -Math.sin(ai.facingAngle) * speed * dt;

            const checkX = ai.mesh.position.x + Math.cos(ai.facingAngle) * 0.9;
            const checkZ = ai.mesh.position.z - Math.sin(ai.facingAngle) * 0.9;

            // Bouncing/Stray steering raycast check
            if (this.checkWallCollision(checkX, checkZ, 0.32)) {
                // Steer away randomly (turn 90 or 180 degrees)
                ai.facingAngle += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
            } else {
                ai.mesh.position.x += dx;
                ai.mesh.position.z += dz;
            }

            ai.mesh.rotation.y = ai.facingAngle;

            // Line of sight tracking to Player 1
            if (p1 && !p1.isDead) {
                const ax = ai.mesh.position.x;
                const az = ai.mesh.position.z;
                const px = p1.mesh.position.x;
                const pz = p1.mesh.position.z;

                const tdx = px - ax;
                const tdz = pz - az;
                const dist = Math.sqrt(tdx * tdx + tdz * tdz);

                if (dist < 10.0) {
                    const targetAngle = Math.atan2(-tdz, tdx);
                    
                    // Rotate towards player slowly
                    let diff = targetAngle - ai.facingAngle;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    ai.facingAngle += diff * 0.08;

                    // Digital differential check for line of sight
                    let hasLOS = true;
                    const steps = Math.floor(dist / 0.5);
                    for (let k = 1; k < steps; k++) {
                        const cx = ax + (tdx / dist) * (k * 0.5);
                        const cz = az + (tdz / dist) * (k * 0.5);
                        if (this.checkWallCollision(cx, cz, 0.28)) {
                            hasLOS = false;
                            break;
                        }
                    }

                    if (hasLOS && ai.shootCooldown <= 0 && ai.activeBulletsCount < 3) {
                        this.shootBullet(ai);
                        ai.shootCooldown = 1.4 + Math.random() * 1.0;
                    }
                }
            }
        });
    }

    spawnSparks(x, y, z, colorHex, count) {
        const pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const pMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.95
        });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(pGeo, pMat.clone());
            mesh.position.set(x, y, z);
            this.arenaGroup.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const velocity = 1.0 + Math.random() * 2.0;
            const vx = Math.cos(angle) * velocity;
            const vz = Math.sin(angle) * velocity;
            const vy = 1.2 + Math.random() * 1.8;

            this.particles.push({
                mesh,
                vx, vy, vz,
                life: 1.0,
                decay: 2.5 + Math.random() * 1.5
            });
        }
    }

    spawnFractureParticles(x, y, z, colorHex, count) {
        const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
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
            const velocity = 1.2 + Math.random() * 3.2;
            const vx = Math.cos(angle) * velocity;
            const vz = Math.sin(angle) * velocity;
            const vy = 1.8 + Math.random() * 2.8;

            this.particles.push({
                mesh,
                vx, vy, vz,
                life: 1.0,
                decay: 1.8 + Math.random() * 1.2
            });
        }
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

                p.vy -= 9.8 * dt; // gravity

                p.mesh.material.opacity = p.life;
                p.mesh.scale.set(p.life, p.life, p.life);
            }
        }
    }

    checkGameStatus() {
        if (this.gameOver) return;

        const p1 = this.players[0];
        if (p1.isDead) {
            this.triggerGameOver(false);
            return;
        }

        const opponentsAlive = this.players.slice(1).filter(p => !p.isDead);
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
                    ${isVictory ? 'You are the ultimate tank commander survivor!' : 'Your tank was blown to pieces in the maze!'}
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="tank-exit-btn" style="pointer-events: auto; cursor: pointer; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; border-radius: 25px; transition: all 0.3s ease;">
                        Exit to Menu
                    </button>
                    <button id="tank-restart-btn" style="pointer-events: auto; cursor: pointer; background: linear-gradient(135deg, #ff007f, #8b00ff); border: none; color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border-radius: 25px; box-shadow: 0 0 20px rgba(255, 0, 127, 0.35); transition: all 0.3s ease;">
                        Play Again
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('tank-exit-btn').addEventListener('click', () => {
            window.exitToLauncher();
        });
        document.getElementById('tank-restart-btn').addEventListener('click', () => {
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

        // Clean bullets
        for (const b of this.bullets) {
            this.arenaGroup.remove(b.mesh);
            b.mesh.geometry.dispose();
            b.mesh.material.dispose();
        }
        this.bullets = [];

        // Clean particles
        for (const p of this.particles) {
            this.arenaGroup.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this.particles = [];

        // Restore walls if destroyed
        this.walls.forEach(w => {
            if (w.isDestructible && w.isDestroyed) {
                w.isDestroyed = false;
                
                const color = 0xcc6633;
                const wallMat = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.7,
                    metalness: 0.3,
                    emissive: 0x331100,
                    emissiveIntensity: 0.3
                });
                const wallGeo = new THREE.BoxGeometry(this.cellSize, 1.2, this.cellSize);
                const mesh = new THREE.Mesh(wallGeo, wallMat);
                const x = w.col * this.cellSize - this.gridOffset;
                const z = w.row * this.cellSize - this.gridOffset;
                mesh.position.set(x, 0.6, z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.arenaGroup.add(mesh);
                w.mesh = mesh;
            }
        });

        // Recreate player placements
        const startCoords = [
            { r: 1, c: 1, angle: 0 },
            { r: 1, c: 9, angle: Math.PI },
            { r: 9, c: 1, angle: 0 },
            { r: 9, c: 9, angle: Math.PI }
        ];

        this.players.forEach((p, idx) => {
            if (p.isDead) {
                // Re-add to group
                this.arenaGroup.add(p.mesh);
            }
            p.isDead = false;
            p.health = 100;
            p.facingAngle = startCoords[idx].angle;
            p.shootCooldown = 0.0;
            p.activeBulletsCount = 0;

            const x = startCoords[idx].c * this.cellSize - this.gridOffset;
            const z = startCoords[idx].r * this.cellSize - this.gridOffset;
            p.mesh.position.set(x, 0.0, z);
            p.mesh.rotation.set(0, p.facingAngle, 0);
        });

        this.gameOver = false;
        this.spacePressedLastFrame = false;

        this.createHUD();
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
            this.arenaGroup.traverse((object) => {
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

        // Restore camera
        if (this.originalCameraPos && window.engine.camera) {
            window.engine.camera.position.copy(this.originalCameraPos);
            window.engine.camera.lookAt(0, 0, 0);
        }

        const hud = document.getElementById('tankmayhem-hud');
        if (hud) hud.remove();

        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.remove();
    }
}

// Expose TankMayhemGame globally
window.TankMayhemGame = TankMayhemGame;
export default TankMayhemGame;
