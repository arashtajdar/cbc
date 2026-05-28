import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { SceneManager } from "../core/SceneManager.js";
import { launcherState } from "../core/LauncherState.js";
import * as CharacterBuilder from "../components/CharacterBuilder.js";
import { DeflectoGameConfig } from "../config/DeflectoGameConfig.js";

/**
 * BALLISTIX GAMEPLAY LOGIC (CHAOS MULTIBALL EDITION)
 * Implements the DeflectoGame class to run a 4-sided 3D isometric breakout/pong style game.
 *
 * Features:
 * - 1 Human Player Paddle (Bottom, Cyan) controlled via WASD / Arrows
 * - 3 AI Opponent Paddles (Top, Left, Right) with closest-ball tracking AI
 * - Dynamic balls array supporting concurrent multiball chaos
 * - Spawns a new random neon-color ball every 10 seconds
 * - Clean garbage collection when individual balls go out of bounds
 * - Custom dynamic overlay notifications for score milestones and spawn events
 */


// --- CONFIGURATION ---
const aiFlawRate = 0.3; // 30% chance for AI to make a human-like flaw (lag, standstill, or misdirection)

export default class DeflectoGame {
    constructor(containerId, playerColor, arenaId) {
        this.containerId = containerId;
        this.playerColor = playerColor;
        this.arenaId = arenaId;
        this.score = DeflectoGameConfig.gameplay.score;
        this.lives = {
            player: 15,
            top: 15,
            left: 15,
            right: 15
        };
        this.gameOver = false;

        // 3D Objects
        this.arenaGroup = null;
        this.floor = null;

        // Paddles
        this.paddle = null; // Player (Bottom)
        this.topPaddle = null; // AI (Top)
        this.leftPaddle = null; // AI (Left)
        this.rightPaddle = null; // AI (Right)

        // Walls formed on elimination
        this.walls = {
            player: null,
            top: null,
            left: null,
            right: null
        };
        this.wallFlash = {
            player: 0,
            top: 0,
            left: 0,
            right: 0
        };

        // Array of active balls
        this.balls = [];

        // Arena layout size
        this.arenaWidth = DeflectoGameConfig.gameplay.arenaWidth; // Left-to-Right bounds (local X)
        this.arenaLength = DeflectoGameConfig.gameplay.arenaLength; // Top-to-Bottom bounds (local Z)
        this.paddleY = DeflectoGameConfig.gameplay.paddleY; // Horiz paddles Z offset (+/- 18)
        this.paddleXOffset = DeflectoGameConfig.gameplay.paddleXOffset; // Vert paddles X offset (+/- 13.5)

        this.paddleWidth = DeflectoGameConfig.gameplay.paddleWidth;
        this.ballRadius = DeflectoGameConfig.gameplay.ballRadius;

        // Positions
        this.paddleX = DeflectoGameConfig.gameplay.paddleX; // Player X
        this.topPaddleX = DeflectoGameConfig.gameplay.topPaddleX; // Top AI X
        this.leftPaddleZ = DeflectoGameConfig.gameplay.leftPaddleZ; // Left AI Z
        this.rightPaddleZ = DeflectoGameConfig.gameplay.rightPaddleZ; // Right AI Z

        // Physics constants
        this.baseBallSpeed = DeflectoGameConfig.gameplay.baseBallSpeed; // Very first ball starts slow
        this.lastSpawnedSpeed = DeflectoGameConfig.gameplay.lastSpawnedSpeed; // Tracks speed of the last spawned ball to escalate by 10%

        // Spawning timer (spawns new ball every 10s)
        this.spawnTimer = DeflectoGameConfig.gameplay.spawnTimer;
        this.spawnInterval = DeflectoGameConfig.gameplay.spawnInterval;

        // Pillars configuration for round boundary bounces
        this.pillarPositions = [
            { x: -15, z: -20 },
            { x: 15, z: -20 },
            { x: -15, z: 20 },
            { x: 15, z: 20 }
        ];

        // Particles pool
        this.particles = [];

        // AI behavior state tracking for human-like flaw simulation
        this.aiStates = {
            top: { state: 'normal', timer: 0.0 },
            left: { state: 'normal', timer: 0.0 },
            right: { state: 'normal', timer: 0.0 }
        };
    }

    /**
     * Initializes all 3D assets and registers the update loop
     */
    init() {
        if (this.arenaGroup) return; // Safety guard to prevent duplicate setup actions
        const engine = SceneManager;
        if (!engine) {
            console.error('DeflectoGame: engine.js not found in global context!');
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
        const floorGeo = new THREE.BoxGeometry(this.arenaWidth, 0.4, this.arenaLength);
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
        const grid = new THREE.GridHelper(this.arenaWidth, 15, 0x00f0ff, 0x181f33);
        grid.position.y = 0.01;
        this.arenaGroup.add(grid);

        // 4. Spawn 4 Corner Pillars
        const pillarGeo = new THREE.CylinderGeometry(4.0, 4.0, 2.5, 32);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x1d2235,
            roughness: 0.3,
            metalness: 0.8,
            emissive: 0x0f1322,
            emissiveIntensity: 0.5
        });

        for (const pos of this.pillarPositions) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(pos.x, 1.25, pos.z);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.arenaGroup.add(pillar);
        }

        // 5. Spawn 4 Paddles (1 Player, 3 AIs)
        const carGeoH = new THREE.SphereGeometry(1, 32, 16);
        carGeoH.scale(3.5, 0.8, 2.5); // Curvier, double-size horizontal oval
        const carGeoV = new THREE.SphereGeometry(1, 32, 16);
        carGeoV.scale(2.5, 0.8, 3.5); // Curvier, double-size vertical oval

        const state = launcherState;
        const p1Char = state && state.characters ? state.characters[state.playerAssignments.p1] : {shape: 'bumpo', color: 0x00f0ff};
        const p2Char = state && state.characters ? state.characters[state.playerAssignments.p2] : {shape: 'zippy', color: 0xffbb00};
        const p3Char = state && state.characters ? state.characters[state.playerAssignments.p3] : {shape: 'puddle', color: 0x39ff14};
        const p4Char = state && state.characters ? state.characters[state.playerAssignments.p4] : {shape: 'sly', color: 0xb026ff};

        const createPaddle = (carGeo, mat, shape, color, rotY) => {
            const group = new THREE.Group();
            const carMesh = new THREE.Mesh(carGeo, mat);
            carMesh.castShadow = true;
            carMesh.receiveShadow = true;
            group.add(carMesh);

            if (CharacterBuilder.create) {
                const char = CharacterBuilder.create(shape, color);
                char.scale.set(1.8, 1.8, 1.8); // Triple the original 0.6 size
                char.position.y = 0.8; // Sitting on top of taller car
                if (char.userData.legL) char.userData.legL.rotation.x = -Math.PI / 2;
                if (char.userData.legR) char.userData.legR.rotation.x = -Math.PI / 2;
                if (char.userData.armL) char.userData.armL.rotation.x = Math.PI / 3;
                if (char.userData.armR) char.userData.armR.rotation.x = Math.PI / 3;
                char.rotation.y = rotY;
                group.add(char);
                group.userData.char = char;
            }
            group.material = mat;
            return group;
        };

        // Player (Bottom, Cyan)
        const playerMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0x00f0ff,
            emissiveIntensity: 0.35
        });
        this.paddle = createPaddle(carGeoH, playerMat, p1Char.shape, p1Char.color, 0);
        this.paddle.position.set(this.paddleX, 0.4, this.paddleY);
        this.arenaGroup.add(this.paddle);

        // Top Opponent (AI, Yellow)
        const topMat = new THREE.MeshStandardMaterial({
            color: 0xffbb00,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0xffbb00,
            emissiveIntensity: 0.35
        });
        this.topPaddle = createPaddle(carGeoH, topMat, p2Char.shape, p2Char.color, Math.PI);
        this.topPaddle.position.set(this.topPaddleX, 0.4, -this.paddleY); // At Z = -18
        this.arenaGroup.add(this.topPaddle);

        // Left Opponent (AI, Neon Green)
        const leftMat = new THREE.MeshStandardMaterial({
            color: 0x39ff14,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0x39ff14,
            emissiveIntensity: 0.35
        });
        this.leftPaddle = createPaddle(carGeoV, leftMat, p3Char.shape, p3Char.color, Math.PI / 2);
        this.leftPaddle.position.set(-this.paddleXOffset, 0.4, this.leftPaddleZ); // At X = -13.5
        this.arenaGroup.add(this.leftPaddle);

        // Right Opponent (AI, Neon Purple)
        const rightMat = new THREE.MeshStandardMaterial({
            color: 0xb026ff,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0xb026ff,
            emissiveIntensity: 0.35
        });
        this.rightPaddle = createPaddle(carGeoV, rightMat, p4Char.shape, p4Char.color, -Math.PI / 2);
        this.rightPaddle.position.set(this.paddleXOffset, 0.4, this.rightPaddleZ); // At X = 13.5
        this.arenaGroup.add(this.rightPaddle);

        // Reset Lives HUD elements in case of game switching
        for (const side of ['player', 'top', 'left', 'right']) {
            const valEl = document.getElementById(`life-val-${side}`);
            if (valEl) {
                valEl.textContent = 15;
            }
            const panelEl = document.getElementById(`life-${side}`);
            if (panelEl) {
                panelEl.classList.remove('dead');
            }
        }

        // 6. Spawn first Ball to start the game
        this.spawnBall(true);

        // 7. Hook update logic into the engine loop callback array
        engine.updateCallbacks.push((dt, time) => {
            this.update(dt, engine.inputs);
            this.updateParticles(dt);
        });
    }

    /**
     * Spawns a new active ball into the arena with a random neon color, starting from a random corner
     */
    spawnBall(isFirstBall = false) {
        const ballGeo = new THREE.SphereGeometry(this.ballRadius, 32, 32);

        // Random neon palette
        const neonColors = [0xff007f, 0x00f0ff, 0xffbb00, 0x39ff14, 0xb026ff, 0xff5e00];
        const chosenColor = neonColors[Math.floor(Math.random() * neonColors.length)];

        const ballMat = new THREE.MeshStandardMaterial({
            color: chosenColor,
            roughness: 0.05,
            metalness: 0.9,
            emissive: chosenColor,
            emissiveIntensity: 0.5
        });

        const ballMesh = new THREE.Mesh(ballGeo, ballMat);
        ballMesh.castShadow = true;

        // Glowing light attached to the ball
        const ballLight = new THREE.PointLight(chosenColor, 3.5, 12);
        ballMesh.add(ballLight);

        this.arenaGroup.add(ballMesh);

        // Corner Spawning: Pick one of the four corners at random, slightly offset inward to avoid pillars
        const corners = [
            { x: -11.5, z: -15.5 }, // Top-Left
            { x: 11.5, z: -15.5 }, // Top-Right
            { x: -11.5, z: 15.5 }, // Bottom-Left
            { x: 11.5, z: 15.5 } // Bottom-Right
        ];
        const chosenCorner = corners[Math.floor(Math.random() * corners.length)];
        const startX = chosenCorner.x;
        const startZ = chosenCorner.z;
        ballMesh.position.set(startX, this.ballRadius + 0.1, startZ);

        // Escalating Speed: First ball starts at 15.0, each subsequent ball is 10% faster
        let speed = 15.0;
        if (!isFirstBall) {
            speed = this.lastSpawnedSpeed * 1.1;
        }
        this.lastSpawnedSpeed = speed;

        // Calculate angle facing center (0, 0)
        const angleToCenter = Math.atan2(-startZ, -startX);
        // Add random variation to launch angle (+/- 20 degrees)
        const launchAngle = angleToCenter + (Math.random() - 0.5) * (Math.PI / 4.5);

        const vx = Math.cos(launchAngle) * speed;
        const vz = Math.sin(launchAngle) * speed;

        this.balls.push({
            mesh: ballMesh,
            light: ballLight,
            x: startX,
            z: startZ,
            vx,
            vz,
            speed: speed
        });

        // Trigger dynamic overlay notification
        const hexString = '#' + chosenColor.toString(16).padStart(6, '0');
        if (isFirstBall) {
            this.showNotification(`Match Started! Speed: ${speed.toFixed(1)}`, hexString);
        } else {
            this.showNotification(`Multiball Spawned! Speed: ${speed.toFixed(1)}`, hexString);
        }

        // Burst particles at spawn point
        this.createCollisionImpact(startX, startZ, chosenColor, 12);
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
     * Updates and simulates humanly flawed AI behaviors using the aiFlawRate configuration
     */
    updateAIBehavior(side, dt, ballPosition, paddlePosition, paddleLimit) {
        const stateInfo = this.aiStates[side];
        stateInfo.timer -= dt;

        let diffSetting = launcherState?.aiDifficulty || 'normal';
        let dynamicFlawRate = diffSetting === 'easy' ? 0.6 : (diffSetting === 'hard' ? 0.05 : 0.3);

        if (stateInfo.timer <= 0) {
            // Decide new behavior state based on dynamicFlawRate
            if (Math.random() < dynamicFlawRate) {
                // Trigger a flaw! Lag/Stand still or move in the wrong direction
                const flawTypes = ['still', 'wrong'];
                stateInfo.state = flawTypes[Math.floor(Math.random() * flawTypes.length)];
                stateInfo.timer = 0.2 + Math.random() * 0.4; // 0.2 to 0.6 seconds duration
            } else {
                stateInfo.state = 'normal';
                stateInfo.timer = 0.3 + Math.random() * 0.5; // 0.3 to 0.8 seconds duration
            }
        }

        const diff = ballPosition - paddlePosition;
        let moveDir = 0;

        if (stateInfo.state === 'normal') {
            moveDir = Math.sign(diff);
        } else if (stateInfo.state === 'wrong') {
            moveDir = -Math.sign(diff); // Move slightly in the wrong direction
        } else if (stateInfo.state === 'still') {
            moveDir = 0; // Stand still / lag
        }

        let speedMult = diffSetting === 'easy' ? 0.6 : (diffSetting === 'hard' ? 1.4 : 1.0);
        const aiMovementSpeed = 17.5 * speedMult;
        let newPos = paddlePosition + moveDir * aiMovementSpeed * dt;
        newPos = Math.max(-paddleLimit, Math.min(paddleLimit, newPos));

        return {
            newPos,
            moveDir
        };
    }

    /**
     * Updates physics, detects collisions, and adjusts visual items
     */
    update(dt, inputs) {
        // If game is over, we freeze gameplay but continue updating particles/wall animations
        if (this.gameOver) {
            this.updateParticles(dt);
            for (const side in this.wallFlash) {
                this.wallFlash[side] = THREE.MathUtils.lerp(this.wallFlash[side], 0, dt * 8.0);
                if (this.walls[side]) {
                    this.walls[side].material.emissiveIntensity = 0.8 + this.wallFlash[side] * 1.7;
                    this.walls[side].material.opacity = 0.45 + this.wallFlash[side] * 0.35;
                }
            }
            return;
        }

        // --- 1. Chaos Multiball Spawner Timer ---
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0.0;
            this.spawnBall();
        }

        // --- 2. Human Paddle Movement (Player controls bottom paddle) ---
        if (this.lives.player > 0) {
            let paddleDirection = 0;
            // Left/Right arrows move left/right. Up arrow = left, Down arrow = right.
            if (inputs.ArrowLeft || inputs.ArrowUp) paddleDirection -= 1;
            if (inputs.ArrowRight || inputs.ArrowDown) paddleDirection += 1;

            const paddleMovementSpeed = 24.0; // units/sec
            this.paddleX += paddleDirection * paddleMovementSpeed * dt;

            // Constraint boundaries (arena width = 30, paddle width = 6.5)
            const horizPaddleLimit = this.arenaWidth / 2 - 4.0 - this.paddleWidth / 2 - 0.5;
            this.paddleX = Math.max(-horizPaddleLimit, Math.min(horizPaddleLimit, this.paddleX));
            if (this.paddle) {
                this.paddle.position.x = this.paddleX;
                // Dynamic visual paddle rotation on movement
                this.paddle.rotation.z = THREE.MathUtils.lerp(
                    this.paddle.rotation.z,
                    -paddleDirection * 0.12,
                    0.15
                );
            }
        }

        // --- 3. AI Opponent Target Selection & Movement ---
        const vertPaddleLimit = this.arenaLength / 2 - 4.0 - this.paddleWidth / 2 - 0.5;
        const horizPaddleLimit = this.arenaWidth / 2 - 4.0 - this.paddleWidth / 2 - 0.5;

        let closestForTop = null,
            minDistTop = Infinity;
        let closestForLeft = null,
            minDistLeft = Infinity;
        let closestForRight = null,
            minDistRight = Infinity;

        for (const ball of this.balls) {
            // Top AI (at Z = -18)
            const distTop = Math.sqrt((ball.x - this.topPaddleX) ** 2 + (ball.z - -18) ** 2);
            if (distTop < minDistTop) {
                minDistTop = distTop;
                closestForTop = ball;
            }

            // Left AI (at X = -13.5)
            const distLeft = Math.sqrt((ball.x - -13.5) ** 2 + (ball.z - this.leftPaddleZ) ** 2);
            if (distLeft < minDistLeft) {
                minDistLeft = distLeft;
                closestForLeft = ball;
            }

            // Right AI (at X = 13.5)
            const distRight = Math.sqrt((ball.x - 13.5) ** 2 + (ball.z - this.rightPaddleZ) ** 2);
            if (distRight < minDistRight) {
                minDistRight = distRight;
                closestForRight = ball;
            }
        }

        // Top AI defends Z = -18
        if (this.lives.top > 0) {
            const ballPos = closestForTop ? closestForTop.x : 0;
            const aiRes = this.updateAIBehavior(
                'top',
                dt,
                ballPos,
                this.topPaddleX,
                horizPaddleLimit
            );
            this.topPaddleX = aiRes.newPos;
            if (this.topPaddle) {
                this.topPaddle.position.x = this.topPaddleX;
                this.topPaddle.rotation.z = THREE.MathUtils.lerp(
                    this.topPaddle.rotation.z,
                    -aiRes.moveDir * 0.12,
                    0.15
                );
            }
        }

        // Left AI defends X = -13.5
        if (this.lives.left > 0) {
            const ballPos = closestForLeft ? closestForLeft.z : 0;
            const aiRes = this.updateAIBehavior(
                'left',
                dt,
                ballPos,
                this.leftPaddleZ,
                vertPaddleLimit
            );
            this.leftPaddleZ = aiRes.newPos;
            if (this.leftPaddle) {
                this.leftPaddle.position.z = this.leftPaddleZ;
                this.leftPaddle.rotation.x = THREE.MathUtils.lerp(
                    this.leftPaddle.rotation.x,
                    -aiRes.moveDir * 0.12,
                    0.15
                );
            }
        }

        // Right AI defends X = 13.5
        if (this.lives.right > 0) {
            const ballPos = closestForRight ? closestForRight.z : 0;
            const aiRes = this.updateAIBehavior(
                'right',
                dt,
                ballPos,
                this.rightPaddleZ,
                vertPaddleLimit
            );
            this.rightPaddleZ = aiRes.newPos;
            if (this.rightPaddle) {
                this.rightPaddle.position.z = this.rightPaddleZ;
                this.rightPaddle.rotation.x = THREE.MathUtils.lerp(
                    this.rightPaddle.rotation.x,
                    -aiRes.moveDir * 0.12,
                    0.15
                );
            }
        }

        // --- 4. Iterate and update all active balls ---
        const halfWidth = this.arenaWidth / 2;
        const halfLength = this.arenaLength / 2;
        const paddleHalfWidth = this.paddleWidth / 2;

        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];

            // 4a. Move ball
            ball.x += ball.vx * dt;
            ball.z += ball.vz * dt;

            ball.mesh.position.x = ball.x;
            ball.mesh.position.z = ball.z;

            // Rolling rotation
            ball.mesh.rotation.x += ball.vz * 0.1 * dt;
            ball.mesh.rotation.z -= ball.vx * 0.1 * dt;

            // 4b. Pillar Bounces
            const pillarRadius = 4.0;
            const pillarCollisionDist = this.ballRadius + pillarRadius;

            for (const pos of this.pillarPositions) {
                const dx = ball.x - pos.x;
                const dz = ball.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < pillarCollisionDist) {
                    const nx = dx / dist;
                    const nz = dz / dist;
                    const velNormal = ball.vx * nx + ball.vz * nz;

                    if (velNormal < 0) {
                        ball.vx = ball.vx - 2 * velNormal * nx;
                        ball.vz = ball.vz - 2 * velNormal * nz;
                        ball.x = pos.x + nx * pillarCollisionDist;
                        ball.z = pos.z + nz * pillarCollisionDist;

                        this.createCollisionImpact(ball.x, ball.z, 0xffffff, 6);
                    }
                }
            }

            // 4c. Paddle/Wall Collisions with Curved Deflection
            const ballColor = ball.mesh.material.color.getHex();

            // Bottom Player Paddle (or Solid Wall)
            if (this.lives.player > 0) {
                const paddleFrontBottom = this.paddleY - 0.6;
                const paddleBackBottom = this.paddleY + 0.6;
                if (ball.vz > 0) {
                    if (
                        ball.z + this.ballRadius >= paddleFrontBottom &&
                        ball.z - this.ballRadius <= paddleBackBottom
                    ) {
                        if (
                            ball.x + this.ballRadius >= this.paddleX - paddleHalfWidth &&
                            ball.x - this.ballRadius <= this.paddleX + paddleHalfWidth
                        ) {
                            // Prevent stuck: reposition ball on front of paddle
                            ball.z = paddleFrontBottom - this.ballRadius;

                            // Curved Paddle Ball Deflection
                            const dx = ball.x - this.paddleX;
                            const r = Math.max(-1, Math.min(1, dx / paddleHalfWidth));
                            const phi = r * (Math.PI / 4); // Curved normal rotated up to 45 degrees
                            const nx = Math.sin(phi);
                            const nz = -Math.cos(phi);

                            const vDot = ball.vx * nx + ball.vz * nz;
                            if (vDot < 0) {
                                let rx = ball.vx - 2 * vDot * nx;
                                let rz = ball.vz - 2 * vDot * nz;
                                const len = Math.sqrt(rx * rx + rz * rz) || 1;
                                ball.speed = Math.min(ball.speed + 1.2, 38.0);
                                ball.vx = (rx / len) * ball.speed;
                                ball.vz = (rz / len) * ball.speed;
                            }

                            if (this.paddle) this.paddle.scale.set(1.25, 0.7, 1.15);
                            ball.mesh.material.emissiveIntensity = 2.0;
                            this.createCollisionImpact(ball.x, ball.z, ballColor, 15);
                        }
                    }
                }
            } else {
                // Bottom Solid Wall
                if (ball.z + this.ballRadius >= 20.0 && ball.vz > 0) {
                    ball.z = 20.0 - this.ballRadius;
                    ball.vz = -ball.vz;
                    this.flashWall('player');
                    this.createCollisionImpact(ball.x, ball.z, 0x00f0ff, 8);
                }
            }

            // Top AI Paddle (or Solid Wall)
            if (this.lives.top > 0) {
                const paddleFrontTop = -this.paddleY + 0.6;
                const paddleBackTop = -this.paddleY - 0.6;
                if (ball.vz < 0) {
                    if (
                        ball.z - this.ballRadius <= paddleFrontTop &&
                        ball.z + this.ballRadius >= paddleBackTop
                    ) {
                        if (
                            ball.x + this.ballRadius >= this.topPaddleX - paddleHalfWidth &&
                            ball.x - this.ballRadius <= this.topPaddleX + paddleHalfWidth
                        ) {
                            // Prevent stuck: reposition ball on front of paddle
                            ball.z = paddleFrontTop + this.ballRadius;

                            // Curved Paddle Ball Deflection
                            const dx = ball.x - this.topPaddleX;
                            const r = Math.max(-1, Math.min(1, dx / paddleHalfWidth));
                            const phi = r * (Math.PI / 4); // Curved normal rotated up to 45 degrees
                            const nx = Math.sin(phi);
                            const nz = Math.cos(phi);

                            const vDot = ball.vx * nx + ball.vz * nz;
                            if (vDot < 0) {
                                let rx = ball.vx - 2 * vDot * nx;
                                let rz = ball.vz - 2 * vDot * nz;
                                const len = Math.sqrt(rx * rx + rz * rz) || 1;
                                ball.speed = Math.min(ball.speed + 0.8, 38.0);
                                ball.vx = (rx / len) * ball.speed;
                                ball.vz = (rz / len) * ball.speed;
                            }

                            if (this.topPaddle) this.topPaddle.scale.set(1.25, 0.7, 1.15);
                            ball.mesh.material.emissiveIntensity = 2.0;
                            this.createCollisionImpact(ball.x, ball.z, ballColor, 12);
                        }
                    }
                }
            } else {
                // Top Solid Wall
                if (ball.z - this.ballRadius <= -20.0 && ball.vz < 0) {
                    ball.z = -20.0 + this.ballRadius;
                    ball.vz = -ball.vz;
                    this.flashWall('top');
                    this.createCollisionImpact(ball.x, ball.z, 0xffbb00, 8);
                }
            }

            // Left AI Paddle (or Solid Wall)
            if (this.lives.left > 0) {
                const paddleFrontLeft = -this.paddleXOffset + 0.6;
                const paddleBackLeft = -this.paddleXOffset - 0.6;
                if (ball.vx < 0) {
                    if (
                        ball.x - this.ballRadius <= paddleFrontLeft &&
                        ball.x + this.ballRadius >= paddleBackLeft
                    ) {
                        if (
                            ball.z + this.ballRadius >= this.leftPaddleZ - paddleHalfWidth &&
                            ball.z - this.ballRadius <= this.leftPaddleZ + paddleHalfWidth
                        ) {
                            // Prevent stuck: reposition ball on front of paddle
                            ball.x = paddleFrontLeft + this.ballRadius;

                            // Curved Paddle Ball Deflection
                            const dz = ball.z - this.leftPaddleZ;
                            const r = Math.max(-1, Math.min(1, dz / paddleHalfWidth));
                            const phi = r * (Math.PI / 4); // Curved normal rotated up to 45 degrees
                            const nx = Math.cos(phi);
                            const nz = Math.sin(phi);

                            const vDot = ball.vx * nx + ball.vz * nz;
                            if (vDot < 0) {
                                let rx = ball.vx - 2 * vDot * nx;
                                let rz = ball.vz - 2 * vDot * nz;
                                const len = Math.sqrt(rx * rx + rz * rz) || 1;
                                ball.speed = Math.min(ball.speed + 0.8, 38.0);
                                ball.vx = (rx / len) * ball.speed;
                                ball.vz = (rz / len) * ball.speed;
                            }

                            if (this.leftPaddle) this.leftPaddle.scale.set(1.15, 0.7, 1.25);
                            ball.mesh.material.emissiveIntensity = 2.0;
                            this.createCollisionImpact(ball.x, ball.z, ballColor, 12);
                        }
                    }
                }
            } else {
                // Left Solid Wall
                if (ball.x - this.ballRadius <= -15.0 && ball.vx < 0) {
                    ball.x = -15.0 + this.ballRadius;
                    ball.vx = -ball.vx;
                    this.flashWall('left');
                    this.createCollisionImpact(ball.x, ball.z, 0x39ff14, 8);
                }
            }

            // Right AI Paddle (or Solid Wall)
            if (this.lives.right > 0) {
                const paddleFrontRight = this.paddleXOffset - 0.6;
                const paddleBackRight = this.paddleXOffset + 0.6;
                if (ball.vx > 0) {
                    if (
                        ball.x + this.ballRadius >= paddleFrontRight &&
                        ball.x - this.ballRadius <= paddleBackRight
                    ) {
                        if (
                            ball.z + this.ballRadius >= this.rightPaddleZ - paddleHalfWidth &&
                            ball.z - this.ballRadius <= this.rightPaddleZ + paddleHalfWidth
                        ) {
                            // Prevent stuck: reposition ball on front of paddle
                            ball.x = paddleFrontRight - this.ballRadius;

                            // Curved Paddle Ball Deflection
                            const dz = ball.z - this.rightPaddleZ;
                            const r = Math.max(-1, Math.min(1, dz / paddleHalfWidth));
                            const phi = r * (Math.PI / 4); // Curved normal rotated up to 45 degrees
                            const nx = -Math.cos(phi);
                            const nz = Math.sin(phi);

                            const vDot = ball.vx * nx + ball.vz * nz;
                            if (vDot < 0) {
                                let rx = ball.vx - 2 * vDot * nx;
                                let rz = ball.vz - 2 * vDot * nz;
                                const len = Math.sqrt(rx * rx + rz * rz) || 1;
                                ball.speed = Math.min(ball.speed + 0.8, 38.0);
                                ball.vx = (rx / len) * ball.speed;
                                ball.vz = (rz / len) * ball.speed;
                            }

                            if (this.rightPaddle) this.rightPaddle.scale.set(1.15, 0.7, 1.25);
                            ball.mesh.material.emissiveIntensity = 2.0;
                            this.createCollisionImpact(ball.x, ball.z, ballColor, 12);
                        }
                    }
                }
            } else {
                // Right Solid Wall
                if (ball.x + this.ballRadius >= 15.0 && ball.vx > 0) {
                    ball.x = 15.0 - this.ballRadius;
                    ball.vx = -ball.vx;
                    this.flashWall('right');
                    this.createCollisionImpact(ball.x, ball.z, 0xb026ff, 8);
                }
            }

            // Smoothly decay emissive flashes
            ball.mesh.material.emissiveIntensity = THREE.MathUtils.lerp(
                ball.mesh.material.emissiveIntensity,
                0.5,
                0.1
            );

            // 4d. Out of Bounds Check (Remove ball from array and subtract life)
            // Player Goal Miss (Bottom edge)
            if (this.lives.player > 0 && ball.z - this.ballRadius > halfLength + 1.0) {
                this.deductLife('player', ball);
                this.removeBallAt(i);
            }
            // Top AI Goal Miss
            else if (this.lives.top > 0 && ball.z + this.ballRadius < -halfLength - 1.0) {
                this.deductLife('top', ball);
                this.removeBallAt(i);
            }
            // Left AI Goal Miss
            else if (this.lives.left > 0 && ball.x + this.ballRadius < -halfWidth - 1.0) {
                this.deductLife('left', ball);
                this.removeBallAt(i);
            }
            // Right AI Goal Miss
            else if (this.lives.right > 0 && ball.x - this.ballRadius > halfWidth + 1.0) {
                this.deductLife('right', ball);
                this.removeBallAt(i);
            }
        }

        // 5. If all balls are out of bounds, spawn a new one immediately to keep game active
        if (this.balls.length === 0 && !this.gameOver) {
            this.spawnBall(true);
        }

        // Smoothly lerp all paddles back to base scales
        if (this.paddle) this.paddle.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.12);
        if (this.topPaddle) this.topPaddle.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.12);
        if (this.leftPaddle) this.leftPaddle.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.12);
        if (this.rightPaddle) this.rightPaddle.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.12);

        // Smoothly decay wall flashes
        for (const side in this.wallFlash) {
            this.wallFlash[side] = THREE.MathUtils.lerp(this.wallFlash[side], 0, dt * 8.0);
            if (this.walls[side]) {
                this.walls[side].material.emissiveIntensity = 0.8 + this.wallFlash[side] * 1.7;
                this.walls[side].material.opacity = 0.45 + this.wallFlash[side] * 0.35;
            }
        }

        // Update gravity-bound collision particles
        this.updateParticles(dt);
    }

    /**
     * Removes a ball mesh/light from Three.js scene, disposes components, and splices from array
     */
    removeBallAt(index) {
        const ball = this.balls[index];
        if (ball) {
            this.arenaGroup.remove(ball.mesh);
            ball.mesh.geometry.dispose();
            ball.mesh.material.dispose();
        }
        this.balls.splice(index, 1);
    }

    /**
     * Deducts 1 life from the target side, handles UI updates, paddle destruction, and game-over checks
     */
    deductLife(side, ball) {
        if (this.gameOver) return;

        this.lives[side]--;
        if (this.lives[side] < 0) this.lives[side] = 0;

        // Update DOM display
        const valEl = document.getElementById(`life-val-${side}`);
        if (valEl) {
            valEl.textContent = this.lives[side];

            // Pop scaling / red animation
            valEl.style.transform = 'scale(1.4)';
            valEl.style.color = '#ff0055';
            valEl.style.transition = 'none';

            setTimeout(() => {
                valEl.style.transition = 'all 0.4s ease';
                valEl.style.transform = 'scale(1.0)';
                // restore original color
                const colors = {
                    player: '#00f0ff',
                    top: '#ffbb00',
                    left: '#39ff14',
                    right: '#b026ff'
                };
                valEl.style.color = colors[side];
            }, 150);
        }

        // Flash screen red if it's the human player
        if (side === 'player') {
            const bodyEl = document.body;
            bodyEl.style.boxShadow = 'inset 0 0 80px rgba(255, 0, 127, 0.6)';
            bodyEl.style.transition = 'none';

            setTimeout(() => {
                bodyEl.style.transition = 'box-shadow 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
                bodyEl.style.boxShadow = 'none';
            }, 100);

            this.showNotification('Miss! -1 Life', '#ff007f');
        } else {
            const names = {
                top: 'Top AI',
                left: 'Left AI',
                right: 'Right AI'
            };
            const colors = {
                top: '#ffbb00',
                left: '#39ff14',
                right: '#b026ff'
            };
            this.showNotification(`${names[side]} Goal!`, colors[side]);
        }

        // Explode particles at the goal line
        const ballColor = ball.mesh.material.color.getHex();
        this.createCollisionImpact(ball.x, ball.z, ballColor, 18);

        // Check if dead
        if (this.lives[side] === 0) {
            const panelEl = document.getElementById(`life-${side}`);
            if (panelEl) {
                panelEl.classList.add('dead');
            }

            // Destroy paddle and create solid wall
            this.destroyPaddle(side);
            this.spawnSolidWall(side);

            const names = {
                player: 'Player 1',
                top: 'Top AI',
                left: 'Left AI',
                right: 'Right AI'
            };
            const colors = {
                player: '#00f0ff',
                top: '#ffbb00',
                left: '#39ff14',
                right: '#b026ff'
            };
            this.showNotification(`${names[side]} ELIMINATED!`, colors[side]);

            // Check win/loss conditions
            const survivors = Object.keys(this.lives).filter(k => this.lives[k] > 0);
            if (survivors.length <= 1) {
                this.triggerGameOver(survivors[0] || null);
            }
        }
    }

    /**
     * Destroys a player's or AI's paddle and emits particles
     */
    destroyPaddle(side) {
        let paddleMesh = null;
        if (side === 'player') {
            paddleMesh = this.paddle;
            this.paddle = null;
        } else if (side === 'top') {
            paddleMesh = this.topPaddle;
            this.topPaddle = null;
        } else if (side === 'left') {
            paddleMesh = this.leftPaddle;
            this.leftPaddle = null;
        } else if (side === 'right') {
            paddleMesh = this.rightPaddle;
            this.rightPaddle = null;
        }

        if (paddleMesh) {
            const paddleColor = paddleMesh.material.color.getHex();
            this.createCollisionImpact(
                paddleMesh.position.x,
                paddleMesh.position.z,
                paddleColor,
                35
            );

            this.arenaGroup.remove(paddleMesh);
            paddleMesh.geometry.dispose();
            paddleMesh.material.dispose();
        }
    }

    /**
     * Spawns a glowing solid neon wall barrier at the eliminated player's goal line
     */
    spawnSolidWall(side) {
        let wallGeo, posX, posZ, color;
        const wallHeight = 2.0;
        const wallThickness = 0.3;

        if (side === 'player') {
            wallGeo = new THREE.BoxGeometry(this.arenaWidth, wallHeight, wallThickness);
            posX = 0;
            posZ = 20;
            color = 0x00f0ff;
        } else if (side === 'top') {
            wallGeo = new THREE.BoxGeometry(this.arenaWidth, wallHeight, wallThickness);
            posX = 0;
            posZ = -20;
            color = 0xffbb00;
        } else if (side === 'left') {
            wallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, this.arenaLength);
            posX = -15;
            posZ = 0;
            color = 0x39ff14;
        } else if (side === 'right') {
            wallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, this.arenaLength);
            posX = 15;
            posZ = 0;
            color = 0xb026ff;
        }

        const wallMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.1,
            metalness: 0.9,
            emissive: color,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.45
        });

        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(posX, wallHeight / 2, posZ);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;

        this.arenaGroup.add(wallMesh);
        this.walls[side] = wallMesh;

        // Spawn particles along the wall
        if (side === 'player' || side === 'top') {
            for (let x = -13; x <= 13; x += 2) {
                this.createCollisionImpact(x, posZ, color, 2);
            }
        } else {
            for (let z = -18; z <= 18; z += 2) {
                this.createCollisionImpact(posX, z, color, 2);
            }
        }
    }

    /**
     * Triggers wall glow flash
     */
    flashWall(side) {
        this.wallFlash[side] = 1.0;
    }

    /**
     * Triggers game over with Victory or Game Over banner
     */
    triggerGameOver(winner) {
        this.gameOver = true;

        const existing = document.getElementById('game-over-overlay');
        if (existing) existing.remove();

        const isPlayerVictory = winner === 'player';
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

        const titleColor = isPlayerVictory ? '#00f0ff' : '#ff007f';
        const titleText = isPlayerVictory ? 'VICTORY' : 'GAME OVER';
        const glowColor = isPlayerVictory ? 'rgba(0, 240, 255, 0.6)' : 'rgba(255, 0, 127, 0.6)';

        const winnerNames = {
            player: 'Player 1',
            top: 'Top AI',
            left: 'Left AI',
            right: 'Right AI'
        };
        const winnerName = winnerNames[winner] || 'No one';

        overlay.innerHTML = `
            <div style="text-align: center; padding: 40px; border-radius: 24px; background: rgba(15, 18, 30, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1); max-width: 450px; width: 90%;">
                <h2 style="font-family: 'Space Grotesk', sans-serif; font-size: 3rem; font-weight: 800; letter-spacing: 4px; color: ${titleColor}; text-shadow: 0 0 30px ${glowColor}; margin: 0 0 10px 0; text-transform: uppercase;">
                    ${titleText}
                </h2>
                <p style="font-size: 1rem; color: #a0aec0; margin: 0 0 30px 0; letter-spacing: 1px;">
                    ${isPlayerVictory ? 'You have defeated all AI opponents!' : `${winnerName} is the last survivor.`}
                </p>
                <button id="restart-btn" style="pointer-events: auto; cursor: pointer; background: linear-gradient(135deg, ${titleColor}, #8b00ff); border: none; color: white; padding: 14px 40px; font-family: 'Space Grotesk', sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; border-radius: 30px; box-shadow: 0 0 20px ${titleColor}44; transition: all 0.3s ease;">
                    Restart Match
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        const btn = overlay.querySelector('#restart-btn');
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.05)';
            btn.style.boxShadow = `0 0 30px ${titleColor}88`;
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1.0)';
            btn.style.boxShadow = `0 0 20px ${titleColor}44`;
        });
        btn.addEventListener('click', () => {
            this.resetGame();
        });

        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 50);
    }

    /**
     * Resets the entire match dynamically without reloading the browser
     */
    resetGame() {
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 800);
        }

        for (let i = this.balls.length - 1; i >= 0; i--) {
            this.removeBallAt(i);
        }

        for (const side in this.walls) {
            if (this.walls[side]) {
                this.arenaGroup.remove(this.walls[side]);
                this.walls[side].geometry.dispose();
                this.walls[side].material.dispose();
                this.walls[side] = null;
            }
        }

        if (this.paddle) {
            this.arenaGroup.remove(this.paddle);
            this.paddle.geometry.dispose();
            this.paddle.material.dispose();
            this.paddle = null;
        }
        if (this.topPaddle) {
            this.arenaGroup.remove(this.topPaddle);
            this.topPaddle.geometry.dispose();
            this.topPaddle.material.dispose();
            this.topPaddle = null;
        }
        if (this.leftPaddle) {
            this.arenaGroup.remove(this.leftPaddle);
            this.leftPaddle.geometry.dispose();
            this.leftPaddle.material.dispose();
            this.leftPaddle = null;
        }
        if (this.rightPaddle) {
            this.arenaGroup.remove(this.rightPaddle);
            this.rightPaddle.geometry.dispose();
            this.rightPaddle.material.dispose();
            this.rightPaddle = null;
        }

        this.score = 0;
        this.lives = {
            player: 15,
            top: 15,
            left: 15,
            right: 15
        };
        this.gameOver = false;
        this.spawnTimer = 0;
        this.paddleX = 0;
        this.topPaddleX = 0;
        this.leftPaddleZ = 0;
        this.rightPaddleZ = 0;
        this.lastSpawnedSpeed = 15.0; // Reset speed

        // Reset AI states
        this.aiStates = {
            top: { state: 'normal', timer: 0.0 },
            left: { state: 'normal', timer: 0.0 },
            right: { state: 'normal', timer: 0.0 }
        };

        const carGeoH = new THREE.SphereGeometry(1, 32, 16);
        carGeoH.scale(1.75, 0.4, 0.6); // Horizontal oval car
        const carGeoV = new THREE.SphereGeometry(1, 32, 16);
        carGeoV.scale(0.6, 0.4, 1.75); // Vertical oval car

        const state = launcherState;
        const p1Char = state && state.characters ? state.characters[state.playerAssignments.p1] : {shape: 'bumpo', color: 0x00f0ff};
        const p2Char = state && state.characters ? state.characters[state.playerAssignments.p2] : {shape: 'zippy', color: 0xffbb00};
        const p3Char = state && state.characters ? state.characters[state.playerAssignments.p3] : {shape: 'puddle', color: 0x39ff14};
        const p4Char = state && state.characters ? state.characters[state.playerAssignments.p4] : {shape: 'sly', color: 0xb026ff};

        const createPaddle = (carGeo, mat, shape, color, rotY) => {
            const group = new THREE.Group();
            const carMesh = new THREE.Mesh(carGeo, mat);
            carMesh.castShadow = true;
            carMesh.receiveShadow = true;
            group.add(carMesh);

            if (CharacterBuilder.create) {
                const char = CharacterBuilder.create(shape, color);
                char.scale.set(0.6, 0.6, 0.6);
                char.position.y = 0.35; // Sitting on top
                if (char.userData.legL) char.userData.legL.rotation.x = -Math.PI / 2;
                if (char.userData.legR) char.userData.legR.rotation.x = -Math.PI / 2;
                if (char.userData.armL) char.userData.armL.rotation.x = Math.PI / 3;
                if (char.userData.armR) char.userData.armR.rotation.x = Math.PI / 3;
                char.rotation.y = rotY;
                group.add(char);
                group.userData.char = char;
            }
            group.material = mat;
            return group;
        };

        const playerMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0x00f0ff,
            emissiveIntensity: 0.35
        });
        this.paddle = createPaddle(carGeoH, playerMat, p1Char.shape, p1Char.color, 0);
        this.paddle.position.set(this.paddleX, 0.4, this.paddleY);
        this.arenaGroup.add(this.paddle);

        const topMat = new THREE.MeshStandardMaterial({
            color: 0xffbb00,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0xffbb00,
            emissiveIntensity: 0.35
        });
        this.topPaddle = createPaddle(carGeoH, topMat, p2Char.shape, p2Char.color, Math.PI);
        this.topPaddle.position.set(this.topPaddleX, 0.4, -this.paddleY);
        this.arenaGroup.add(this.topPaddle);

        const leftMat = new THREE.MeshStandardMaterial({
            color: 0x39ff14,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0x39ff14,
            emissiveIntensity: 0.35
        });
        this.leftPaddle = createPaddle(carGeoV, leftMat, p3Char.shape, p3Char.color, Math.PI / 2);
        this.leftPaddle.position.set(-this.paddleXOffset, 0.4, this.leftPaddleZ);
        this.arenaGroup.add(this.leftPaddle);

        const rightMat = new THREE.MeshStandardMaterial({
            color: 0xb026ff,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0xb026ff,
            emissiveIntensity: 0.35
        });
        this.rightPaddle = createPaddle(carGeoV, rightMat, p4Char.shape, p4Char.color, -Math.PI / 2);
        this.rightPaddle.position.set(this.paddleXOffset, 0.4, this.rightPaddleZ);
        this.arenaGroup.add(this.rightPaddle);

        for (const side of ['player', 'top', 'left', 'right']) {
            const valEl = document.getElementById(`life-val-${side}`);
            if (valEl) {
                valEl.textContent = 15;
            }
            const panelEl = document.getElementById(`life-${side}`);
            if (panelEl) {
                panelEl.classList.remove('dead');
            }
        }

        this.spawnBall(true);
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
            particleMesh.position.set(x, 0.4, z);
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

    /**
     * Cleans up all objects, events, and update callbacks for destruction
     */
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
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.remove();
    }
}

// Expose DeflectoGame globally so engine.js can instantiate it

