import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { SceneManager } from "../core/SceneManager.js";
import { launcherState } from "../core/LauncherState.js";
import * as CharacterBuilder from "../components/CharacterBuilder.js";
import { BounceClaimConfig } from "../config/BounceClaimConfig.js";

/**
 * POGO PANDEMONIUM gameplay logic
 * Standalone Three.js minigame class for "Pogo Pandemonium".
 *
 * Features:
 * - 10x10 grid of tile meshes, starting neutral grey.
 * - Compound pogo stick player meshes that bounce rhythmically.
 * - Horizontal movement only occurs during jumps/landing.
 * - Landing on a tile paints it to the player's color, overwriting opponents.
 * - Live territory scoring HUD and 60-second countdown timer.
 * - Score Boost (Star) and Stun Hazard (Spike) spawning.
 * - Territory-seeking & Power-up hunting AI.
 * - Glassmorphic game-over results.
 */


export default class BounceClaimGame {
    constructor(containerId, playerColor) {
        this.containerId = containerId || 'canvas-container';
        this.playerColor = playerColor !== undefined ? playerColor : 0xff3333;

        this.gameOver = false;
        this.matchTimer = BounceClaimConfig.gameplay.matchTimer; // 60-second limit

        // Grid configurations
        this.gridSize = BounceClaimConfig.gameplay.gridSize;
        this.tileSpacing = BounceClaimConfig.gameplay.tileSpacing;
        this.gridOffset = ((this.gridSize - 1) * this.tileSpacing) / 2; // 5.85

        // Groups & Pools
        this.arenaGroup = null;
        this.tiles = []; // 2D Array of tile data
        this.players = []; // 4 Players
        this.items = []; // Spawned items
        this.particles = [];

        this.itemSpawnTimer = 0;
        this.itemSpawnInterval = BounceClaimConfig.gameplay.itemSpawnInterval; // Spawn item every 4.5s

        this.spacePressedLastFrame = false;
        this.originalCameraPos = null;
    }

    init() {
        const engine = SceneManager;
        if (!engine) {
            console.error('PogoPandemonium: engine.js not found in global context!');
            return;
        }

        // 1. Position camera at high-angle top-down view showing entire board
        this.originalCameraPos = engine.camera.position.clone();
        engine.camera.position.set(BounceClaimConfig.camera.position.x, BounceClaimConfig.camera.position.y, BounceClaimConfig.camera.position.z);
        engine.camera.lookAt(BounceClaimConfig.camera.lookAt.x, BounceClaimConfig.camera.lookAt.y, BounceClaimConfig.camera.lookAt.z);

        // 2. Coordinate Group aligned to the isometric perspective
        this.arenaGroup = new THREE.Group();
        this.arenaGroup.rotation.y = -Math.PI / 4;
        engine.scene.add(this.arenaGroup);

        // 3. Generate Grid of Tiles
        this.createGrid();

        // 4. Initialize Players (Human + 3 AIs)
        this.spawnPlayers();

        // 5. Create dynamic HUD
        this.createHUD();

        // Spawn initial power-ups
        this.spawnItem('boost');
        this.spawnItem('hazard');

        // 6. Hook update logic into engine loops
        engine.updateCallbacks.push((dt, time) => {
            this.update(dt, engine.inputs);
        });
    }

    createGrid() {
        const tileGeo = new THREE.BoxGeometry(1.15, 0.15, 1.15);

        for (let r = 0; r < this.gridSize; r++) {
            this.tiles[r] = [];
            for (let c = 0; c < this.gridSize; c++) {
                const tileMat = new THREE.MeshStandardMaterial({
                    color: 0x3a3d45, // Neutral dark gray
                    roughness: 0.6,
                    metalness: 0.2
                });
                const mesh = new THREE.Mesh(tileGeo, tileMat);

                // Position tile in grid space
                const x = c * this.tileSpacing - this.gridOffset;
                const z = r * this.tileSpacing - this.gridOffset;
                mesh.position.set(x, -0.075, z);
                mesh.receiveShadow = true;
                this.arenaGroup.add(mesh);

                this.tiles[r][c] = {
                    mesh: mesh,
                    material: tileMat,
                    row: r,
                    col: c,
                    ownerId: null,
                    colorHex: 0x3a3d45,
                    item: null
                };
            }
        }
    }

    spawnPlayers() {
        const state = launcherState;
        const assignments = state.playerAssignments;
        const chars = state.characters;

        // Spawn at 4 corners
        const startCoords = [
            { r: 1, c: 1 }, // P1
            { r: 1, c: 8 }, // P2
            { r: 8, c: 1 }, // P3
            { r: 8, c: 8 } // P4
        ];

        const playerKeys = ['p1', 'p2', 'p3', 'p4'];

        playerKeys.forEach((key, idx) => {
            const charIdx = assignments[key];
            const charData = chars[charIdx];
            const start = startCoords[idx];

            const isP1 = idx === 0;
            const pColor = isP1 ? this.playerColor : charData.color;

            // Assemble Compound Pogo Stick Character Group
            const pogoGroup = new THREE.Group();

            const bodyMesh = CharacterBuilder.create(charData.shape, pColor);
            bodyMesh.position.y = 0.9;
            bodyMesh.scale.set(0.65, 0.65, 0.65); // Make it fit the pogo stick
            pogoGroup.add(bodyMesh);

            // Pogo shaft
            const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.65, 8);
            const shaftMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.8 });
            const shaft = new THREE.Mesh(shaftGeo, shaftMat);
            shaft.position.y = 0.325;
            shaft.castShadow = true;
            pogoGroup.add(shaft);

            // Handlebar
            const barGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8);
            const handlebar = new THREE.Mesh(barGeo, shaftMat);
            handlebar.rotation.z = Math.PI / 2;
            handlebar.position.y = 0.55;
            handlebar.castShadow = true;
            pogoGroup.add(handlebar);

            // Glowing light on player body
            const light = new THREE.PointLight(pColor, 2.0, 5);
            light.position.y = 0.9;
            pogoGroup.add(light);

            // Initial position on board
            const x = start.c * this.tileSpacing - this.gridOffset;
            const z = start.r * this.tileSpacing - this.gridOffset;
            pogoGroup.position.set(x, 0.0, z);

            this.arenaGroup.add(pogoGroup);

            let diffSetting = launcherState?.aiDifficulty || 'normal';
            let aiBounceDuration = diffSetting === 'easy' ? 0.8 : (diffSetting === 'hard' ? 0.35 : 0.55);

            // Add the object to the array with dynamically computed bounce duration for AI
            this.players.push({
                id: idx + 1,
                name: idx === 0 ? 'Player 1' : `Opponent ${idx}`,
                mesh: pogoGroup,
                bodyMesh: bodyMesh,
                color: pColor,
                hex: isP1 ? '#' + pColor.toString(16).padStart(6, '0') : charData.hex,
                isAI: idx > 0,
                gridX: start.c,
                gridZ: start.r,
                targetGridX: start.c,
                targetGridZ: start.r,
                bounceTimer: 0.0,
                bounceDuration: (idx > 0) ? aiBounceDuration : 0.55, // Jump cycle duration
                stunTimer: 0.0,
                score: 0,
                facingAngle: idx === 0 ? 0 : Math.PI
            });
        });
    }

    createHUD() {
        // Hide other HUD elements
        const ballistixHud = document.querySelector('.score-container');
        if (ballistixHud) ballistixHud.style.display = 'none';
        const ballistixControls = document.querySelector('.control-panel');
        if (ballistixControls) ballistixControls.style.display = 'none';

        const existing = document.getElementById('pogopandemonium-hud');
        if (existing) existing.remove();

        const hud = document.createElement('div');
        hud.id = 'pogopandemonium-hud';
        hud.style.position = 'absolute';
        hud.style.top = '30px';
        hud.style.left = '50%';
        hud.style.transform = 'translateX(-50%)';
        hud.style.zIndex = '10';
        hud.style.background = 'rgba(12, 14, 22, 0.7)';
        hud.style.border = '1px solid rgba(255, 0, 127, 0.15)';
        hud.style.backdropFilter = 'blur(16px)';
        hud.style.webkitBackdropFilter = 'blur(16px)';
        hud.style.padding = '12px 28px';
        hud.style.borderRadius = '18px';
        hud.style.display = 'flex';
        hud.style.gap = '25px';
        hud.style.alignItems = 'center';
        hud.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 0, 127, 0.15)';
        hud.style.fontFamily = "'Outfit', sans-serif";
        hud.style.color = '#ffffff';

        let innerHTML = '';
        this.players.forEach(p => {
            innerHTML += `
                <div id="hud-player-card-${p.id}" style="display: flex; flex-direction: column; width: 100px; align-items: center; gap: 4px; transition: all 0.3s ease;">
                    <div style="font-size: 0.65rem; color: #a0aec0; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">${p.name}</div>
                    <div id="hud-name-${p.id}" style="font-family: 'Space Grotesk', sans-serif; font-size: 0.85rem; font-weight: 700; color: ${p.hex}; text-transform: uppercase;">${p.isAI ? 'AI' : 'Human'}</div>
                    
                    <!-- Score Display -->
                    <div id="hud-score-${p.id}" style="font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 800; text-shadow: 0 0 8px ${p.hex}77; line-height: 1.1; margin-top: 4px;">
                        0
                    </div>
                    <div style="font-size: 0.6rem; color: #718096; text-transform: uppercase; font-weight: 600;">Tiles Owned</div>
                </div>
            `;
        });

        // Add Match Timer Card at center/side
        innerHTML += `
            <div style="display: flex; flex-direction: column; width: 90px; align-items: center; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 20px; gap: 2px;">
                <div style="font-size: 0.65rem; color: #ff007f; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Time Left</div>
                <div id="pogo-timer-val" style="font-family: 'Space Grotesk', sans-serif; font-size: 1.6rem; font-weight: 800; color: #ffffff; line-height: 1.1;">
                    60.0s
                </div>
            </div>
        `;

        hud.innerHTML = innerHTML;
        document.body.appendChild(hud);

        // Update layouts in standard instructions hud
        const instructionsText = document.querySelector('.instruction-text');
        if (instructionsText) {
            instructionsText.textContent =
                'WASD/Arrows to Hop. Paint the floor tiles with your color. Pick up Stars to claim a 3x3 territory burst. Avoid Spikes that stun you!';
        }
        const instructionTag = document.querySelector('.instruction-tag');
        if (instructionTag) {
            instructionTag.textContent = 'Pogo Pandemonium';
        }
    }

    updateHUD() {
        this.players.forEach(p => {
            const scoreEl = document.getElementById(`hud-score-${p.id}`);
            if (scoreEl) {
                scoreEl.textContent = p.score;
            }

            const card = document.getElementById(`hud-player-card-${p.id}`);
            if (card) {
                if (p.stunTimer > 0) {
                    card.style.opacity = '0.5';
                    card.style.transform = 'scale(0.95)';
                } else {
                    card.style.opacity = '1.0';
                    card.style.transform = 'scale(1.0)';
                }
            }
        });

        const timerEl = document.getElementById('pogo-timer-val');
        if (timerEl) {
            const val = Math.max(0, this.matchTimer);
            timerEl.textContent = val.toFixed(1) + 's';
            if (val <= 10.0) {
                timerEl.style.color = '#ff007f';
                timerEl.style.textShadow = '0 0 8px rgba(255,0,127,0.6)';
            } else {
                timerEl.style.color = '#ffffff';
                timerEl.style.textShadow = 'none';
            }
        }
    }

    spawnItem(forceType = null) {
        // Find a random tile that doesn't have an item
        let attempts = 0;
        let r, c;
        do {
            r = Math.floor(Math.random() * this.gridSize);
            c = Math.floor(Math.random() * this.gridSize);
            attempts++;
        } while (this.tiles[r][c].item && attempts < 15);

        const tile = this.tiles[r][c];
        if (tile.item) return; // grid full

        const type = forceType || (Math.random() < 0.5 ? 'boost' : 'hazard');

        let mesh;
        if (type === 'boost') {
            // Glowing star shape
            const starGeo = new THREE.OctahedronGeometry(0.32, 0);
            const starMat = new THREE.MeshStandardMaterial({
                color: 0xffd700,
                roughness: 0.1,
                metalness: 0.9,
                emissive: 0xffd700,
                emissiveIntensity: 0.7
            });
            mesh = new THREE.Mesh(starGeo, starMat);
            const light = new THREE.PointLight(0xffd700, 2.5, 4);
            mesh.add(light);
        } else {
            // Flashing Spike
            const spikeGeo = new THREE.ConeGeometry(0.24, 0.55, 8);
            const spikeMat = new THREE.MeshStandardMaterial({
                color: 0xff003c,
                roughness: 0.4,
                metalness: 0.6,
                emissive: 0xff003c,
                emissiveIntensity: 0.6
            });
            mesh = new THREE.Mesh(spikeGeo, spikeMat);
            const light = new THREE.PointLight(0xff003c, 2.0, 4);
            mesh.add(light);
        }

        const x = c * this.tileSpacing - this.gridOffset;
        const z = r * this.tileSpacing - this.gridOffset;
        mesh.position.set(x, 0.35, z);
        this.arenaGroup.add(mesh);

        const itemObj = {
            mesh,
            type,
            row: r,
            col: c
        };

        tile.item = itemObj;
        this.items.push(itemObj);
    }

    removeItem(item) {
        const idx = this.items.indexOf(item);
        if (idx !== -1) {
            this.items.splice(idx, 1);
        }
        if (item.mesh) {
            this.arenaGroup.remove(item.mesh);
            item.mesh.geometry.dispose();
            item.mesh.material.dispose();
        }
        const tile = this.tiles[item.row][item.col];
        if (tile) tile.item = null;
    }

    landOnTile(player) {
        const tile = this.tiles[player.gridZ][player.gridX];
        if (!tile) return;

        // Trigger Paint
        if (tile.ownerId !== player.id) {
            tile.ownerId = player.id;
            tile.colorHex = player.color;
            tile.material.color.setHex(player.color);
            tile.material.emissive.setHex(player.color);
            tile.material.emissiveIntensity = 0.25;

            // Small splash spark particle burst
            this.spawnSparks(tile.mesh.position.x, 0.05, tile.mesh.position.z, player.color, 5);
        }

        // Squash animation squash on landing
        player.mesh.scale.set(1.2, 0.7, 1.2);
        setTimeout(() => {
            if (!this.gameOver) {
                player.mesh.scale.set(1.0, 1.0, 1.0);
            }
        }, 120);

        // Check Powerups / Hazards
        if (tile.item) {
            const item = tile.item;
            if (item.type === 'boost') {
                // Score Boost paints a 3x3 grid around landing point
                this.showNotification('3x3 PAINT BOOST!', player.hex);
                this.triggerPaintBoost(player.id, player.color, player.gridX, player.gridZ);
                this.removeItem(item);
            } else if (item.type === 'hazard') {
                // Stun Hazard freezes movement loop
                this.showNotification('STUNNED!', '#ff003c');
                player.stunTimer = 2.0; // stun for 2 seconds
                this.spawnSparks(tile.mesh.position.x, 0.3, tile.mesh.position.z, 0xff003c, 12);
                this.removeItem(item);
            }
        }
    }

    triggerPaintBoost(ownerId, colorHex, cx, cz) {
        // Loop over 3x3 surrounding cells
        for (let r = cz - 1; r <= cz + 1; r++) {
            if (r < 0 || r >= this.gridSize) continue;
            for (let c = cx - 1; c <= cx + 1; c++) {
                if (c < 0 || c >= this.gridSize) continue;

                const tile = this.tiles[r][c];
                if (tile && tile.ownerId !== ownerId) {
                    tile.ownerId = ownerId;
                    tile.colorHex = colorHex;
                    tile.material.color.setHex(colorHex);
                    tile.material.emissive.setHex(colorHex);
                    tile.material.emissiveIntensity = 0.25;

                    this.spawnSparks(tile.mesh.position.x, 0.05, tile.mesh.position.z, colorHex, 3);
                }
            }
        }
    }

    chooseNextHop(player) {
        if (player.isAI) {
            this.chooseNextHopAI(player);
        } else {
            // Human player controls handled via engine inputs monitored when bounce timer wraps
        }
    }

    chooseNextHopAI(ai) {
        // Priority Target mapping
        let targetTile = null;
        let minDist = Infinity;

        // 1. Scan for nearest power-up star
        const stars = this.items.filter(item => item.type === 'boost');
        if (stars.length > 0) {
            stars.forEach(s => {
                const d = Math.abs(s.col - ai.gridX) + Math.abs(s.row - ai.gridZ); // Manhattan distance
                if (d < minDist) {
                    minDist = d;
                    targetTile = this.tiles[s.row][s.col];
                }
            });
        }

        // 2. Scan for nearest enemy-owned or neutral tile
        if (!targetTile) {
            for (let r = 0; r < this.gridSize; r++) {
                for (let c = 0; c < this.gridSize; c++) {
                    const tile = this.tiles[r][c];
                    if (tile.ownerId !== ai.id) {
                        const d = Math.abs(c - ai.gridX) + Math.abs(r - ai.gridZ);
                        if (d < minDist) {
                            minDist = d;
                            targetTile = tile;
                        }
                    }
                }
            }
        }

        // If a target exists, step towards it
        if (targetTile) {
            const dc = targetTile.col - ai.gridX;
            const dr = targetTile.row - ai.gridZ;

            let nextC = ai.gridX;
            let nextR = ai.gridZ;

            // Greedy step along the axis of largest difference
            if (Math.abs(dc) >= Math.abs(dr) && dc !== 0) {
                nextC += Math.sign(dc);
            } else if (dr !== 0) {
                nextR += Math.sign(dr);
            }

            ai.targetGridX = Math.max(0, Math.min(this.gridSize - 1, nextC));
            ai.targetGridZ = Math.max(0, Math.min(this.gridSize - 1, nextR));
        } else {
            // Random adjacent step
            const dirs = [
                { c: 1, r: 0 },
                { c: -1, r: 0 },
                { c: 0, r: 1 },
                { c: 0, r: -1 }
            ];
            const choice = dirs[Math.floor(Math.random() * dirs.length)];
            ai.targetGridX = Math.max(0, Math.min(this.gridSize - 1, ai.gridX + choice.c));
            ai.targetGridZ = Math.max(0, Math.min(this.gridSize - 1, ai.gridZ + choice.r));
        }
    }

    spawnSparks(x, y, z, colorHex, count) {
        const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
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
            const velocity = 1.0 + Math.random() * 2.5;
            const vx = Math.cos(angle) * velocity;
            const vz = Math.sin(angle) * velocity;
            const vy = 1.5 + Math.random() * 2.0;

            this.particles.push({
                mesh,
                vx,
                vy,
                vz,
                life: 1.0,
                decay: 2.0 + Math.random() * 1.5
            });
        }
    }

    updateScores() {
        // Reset scores
        this.players.forEach(p => (p.score = 0));

        // Scan board
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const owner = this.tiles[r][c].ownerId;
                if (owner) {
                    const p = this.players.find(pl => pl.id === owner);
                    if (p) p.score++;
                }
            }
        }
    }

    update(dt, inputs) {
        if (this.gameOver) {
            this.updateVisualEffects(dt);
            return;
        }

        // 1. Update Match Timer
        this.matchTimer -= dt;
        if (this.matchTimer <= 0.0) {
            this.triggerGameOver();
        }

        // 2. Spawn Random Powerups / Hazards
        this.itemSpawnTimer += dt;
        if (this.itemSpawnTimer >= this.itemSpawnInterval && this.items.length < 8) {
            this.itemSpawnTimer = 0.0;
            this.spawnItem();
        }

        // Rotate items visual loop
        const elapsed = SceneManager.clock.getElapsedTime();
        this.items.forEach(item => {
            item.mesh.rotation.y += 1.8 * dt;
            if (item.type === 'boost') {
                item.mesh.position.y = 0.35 + Math.sin(elapsed * 4.0) * 0.08;
            } else {
                // Flashing red hazard spike intensity flicker
                const pointLight = item.mesh.children[0];
                if (pointLight) {
                    pointLight.intensity = 1.5 + Math.sin(elapsed * 12.0) * 0.8;
                }
            }
        });

        // 3. Update Players pogo bounce movement loop
        this.players.forEach(p => {
            // Manage stun freezing timer
            if (p.stunTimer > 0) {
                p.stunTimer -= dt;

                // Shake stun mesh in place
                p.mesh.position.x =
                    p.gridX * this.tileSpacing - this.gridOffset + (Math.random() - 0.5) * 0.08;
                p.mesh.position.z =
                    p.gridZ * this.tileSpacing - this.gridOffset + (Math.random() - 0.5) * 0.08;
                p.mesh.position.y = 0;

                // Reset bounce timer during stun
                p.bounceTimer = 0.0;
                return;
            }

            p.bounceTimer += dt;

            // Reaching bounce landing
            if (p.bounceTimer >= p.bounceDuration) {
                p.bounceTimer = 0.0;

                // Move grid location
                p.gridX = p.targetGridX;
                p.gridZ = p.targetGridZ;

                // Handle land triggers
                this.landOnTile(p);

                // Setup next hop coordinate mapping
                if (p.isAI) {
                    this.chooseNextHop(p);
                } else {
                    // Check human player inputs to target next cell
                    let hopC = p.gridX;
                    let hopR = p.gridZ;

                    if (inputs.w || inputs.ArrowUp) hopR--;
                    else if (inputs.s || inputs.ArrowDown) hopR++;
                    else if (inputs.a || inputs.ArrowLeft) hopC--;
                    else if (inputs.d || inputs.ArrowRight) hopC++;

                    // Clamp to board limits
                    p.targetGridX = Math.max(0, Math.min(this.gridSize - 1, hopC));
                    p.targetGridZ = Math.max(0, Math.min(this.gridSize - 1, hopR));
                }
            }

            // Interpolate position on X & Z, and Sine arc on Y
            const progress = p.bounceTimer / p.bounceDuration;
            const startX = p.gridX * this.tileSpacing - this.gridOffset;
            const startZ = p.gridZ * this.tileSpacing - this.gridOffset;
            const endX = p.targetGridX * this.tileSpacing - this.gridOffset;
            const endZ = p.targetGridZ * this.tileSpacing - this.gridOffset;

            p.mesh.position.x = THREE.MathUtils.lerp(startX, endX, progress);
            p.mesh.position.z = THREE.MathUtils.lerp(startZ, endZ, progress);

            // Sine wave jump arc height 1.3
            p.mesh.position.y = Math.sin(progress * Math.PI) * 1.3;

            // Rotation direction facing
            const dc = p.targetGridX - p.gridX;
            const dr = p.targetGridZ - p.gridZ;
            if (dc !== 0 || dr !== 0) {
                const targetAngle = Math.atan2(dc, dr);
                let diff = targetAngle - p.mesh.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                p.mesh.rotation.y += diff * 0.3; // rotate smoothly
            }
            if (CharacterBuilder.animate && p.bodyMesh) {
                const speed = dc !== 0 || dr !== 0 ? 10 : 0;
                CharacterBuilder.animate(
                    p.bodyMesh,
                    speed,
                    SceneManager.clock.getElapsedTime()
                );
            }
        });

        // 4. Update territory scoring details
        this.updateScores();

        // 5. Update UI values
        this.updateHUD();

        // 6. Update visual effects particles
        this.updateVisualEffects(dt);
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

    triggerGameOver() {
        this.gameOver = true;

        // Freeze all pogo stick animations and scales
        this.players.forEach(p => {
            p.mesh.scale.set(1.0, 1.0, 1.0);
            p.mesh.position.y = 0;
        });

        // Evaluate victory status (P1 score vs opponents)
        const p1Score = this.players[0].score;
        let highestOpponentScore = -1;

        this.players.slice(1).forEach(op => {
            if (op.score > highestOpponentScore) {
                highestOpponentScore = op.score;
            }
        });

        const isVictory = p1Score > highestOpponentScore;

        // Display results overlay
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
                <p style="font-size: 1.05rem; color: #ffffff; margin: 0 0 10px 0; letter-spacing: 1px;">
                    Your Score: <strong style="color: #00f0ff; font-size: 1.4rem;">${p1Score}</strong> tiles
                </p>
                <p style="font-size: 0.85rem; color: #a0aec0; margin: 0 0 30px 0;">
                    ${isVictory ? 'Outstanding territory paint dominance!' : `An opponent painted more tiles! (Highest AI: ${highestOpponentScore})`}
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="pogo-exit-btn" style="pointer-events: auto; cursor: pointer; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; border-radius: 25px; transition: all 0.3s ease;">
                        Exit to Menu
                    </button>
                    <button id="pogo-restart-btn" style="pointer-events: auto; cursor: pointer; background: linear-gradient(135deg, #ff007f, #8b00ff); border: none; color: white; padding: 12px 28px; font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border-radius: 25px; box-shadow: 0 0 20px rgba(255, 0, 127, 0.35); transition: all 0.3s ease;">
                        Play Again
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('pogo-exit-btn').addEventListener('click', () => {
            window.exitToLauncher();
        });
        document.getElementById('pogo-restart-btn').addEventListener('click', () => {
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

        // Clean up spawned items
        for (let i = this.items.length - 1; i >= 0; i--) {
            this.removeItem(this.items[i]);
        }
        this.items = [];

        // Reset grid tiles back to neutral
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const tile = this.tiles[r][c];
                tile.ownerId = null;
                tile.colorHex = 0x3a3d45;
                tile.material.color.setHex(0x3a3d45);
                tile.material.emissive.setHex(0x000000);
                tile.material.emissiveIntensity = 0.0;
            }
        }

        // Clean particles
        for (const p of this.particles) {
            this.arenaGroup.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this.particles = [];

        // Reset player positions and states
        const startCoords = [
            { r: 1, c: 1 },
            { r: 1, c: 8 },
            { r: 8, c: 1 },
            { r: 8, c: 8 }
        ];

        this.players.forEach((p, idx) => {
            const start = startCoords[idx];
            p.gridX = start.c;
            p.gridZ = start.r;
            p.targetGridX = start.c;
            p.targetGridZ = start.r;
            p.bounceTimer = 0.0;
            p.stunTimer = 0.0;
            p.score = 0;
            p.mesh.scale.set(1.0, 1.0, 1.0);

            const x = start.c * this.tileSpacing - this.gridOffset;
            const z = start.r * this.tileSpacing - this.gridOffset;
            p.mesh.position.set(x, 0.0, z);
        });

        this.matchTimer = 60.0;
        this.gameOver = false;
        this.spacePressedLastFrame = false;
        this.itemSpawnTimer = 0;

        // Recreate HUD values
        this.createHUD();
        this.spawnItem('boost');
        this.spawnItem('hazard');
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

        // Restore camera
        if (this.originalCameraPos && SceneManager.camera) {
            SceneManager.camera.position.copy(this.originalCameraPos);
            SceneManager.camera.lookAt(0, 0, 0);
        }

        const hud = document.getElementById('pogopandemonium-hud');
        if (hud) hud.remove();

        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.remove();
    }
}

// Expose BounceClaimGame globally

//export default BounceClaimGame;
