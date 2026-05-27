import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

export class SkyHighGame {
    constructor(containerId, p1Color) {
        this.containerId = containerId;
        this.p1Color = p1Color || 0xff3333;

        window.SkyHighGame = this.constructor;

        this.scene = window.engine.scene;
        this.camera = window.engine.camera;
        this.renderer = window.engine.renderer;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.players = [];
        this.tiles = [];

        this.isGameOver = false;

        this.originalCameraPos = this.camera.position.clone();
        this.originalCameraRot = this.camera.rotation.clone();
        this.setupCamera();

        this.createEnvironment();
        this.createPlayers();

        this.updateCallbackId =
            window.engine.updateCallbacks.push((dt, time) => {
                // Usually update is called directly by engine if window.activeGame == this
            }) - 1;

        console.log('Sky High initialized!');
    }

    setupCamera() {
        this.camera.position.set(0, 35, 30);
        this.camera.lookAt(0, -5, 0);
    }

    createEnvironment() {
        const layers = [0, -8, -16];
        const colors = [0x44aaff, 0x44ffaa, 0xffaa44];

        this.hexRadius = 1.6;
        const hexWidth = this.hexRadius * Math.sqrt(3);
        const hexHeight = this.hexRadius * 2;

        const gridRadius = 4; // Rings of hexes

        const geo = new THREE.CylinderGeometry(
            this.hexRadius - 0.05,
            this.hexRadius - 0.05,
            0.5,
            6
        );

        layers.forEach((yPos, layerIdx) => {
            const mat = new THREE.MeshStandardMaterial({
                color: colors[layerIdx],
                roughness: 0.3,
                metalness: 0.1
            });
            const warnMat = new THREE.MeshStandardMaterial({
                color: 0xff1111,
                roughness: 0.3,
                metalness: 0.1,
                emissive: 0xff0000,
                emissiveIntensity: 0.5
            });

            for (let q = -gridRadius; q <= gridRadius; q++) {
                const r1 = Math.max(-gridRadius, -q - gridRadius);
                const r2 = Math.min(gridRadius, -q + gridRadius);
                for (let r = r1; r <= r2; r++) {
                    const mesh = new THREE.Mesh(geo, mat);

                    const cx = hexWidth * (q + r / 2);
                    const cz = ((hexHeight * 3) / 4) * r;

                    mesh.position.set(cx, yPos, cz);
                    mesh.receiveShadow = true;
                    mesh.castShadow = true;
                    this.group.add(mesh);

                    this.tiles.push({
                        mesh: mesh,
                        x: cx,
                        y: yPos,
                        z: cz,
                        layer: layerIdx,
                        isStepped: false,
                        timer: 0,
                        isGone: false,
                        baseMat: mat,
                        warnMat: warnMat
                    });
                }
            }
        });

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.group.add(ambientLight);
    }

    createPlayers() {
        const startPositions = [
            new THREE.Vector3(0, 2, 6),
            new THREE.Vector3(0, 2, -6),
            new THREE.Vector3(6, 2, 0),
            new THREE.Vector3(-6, 2, 0)
        ];

        const colors = [this.p1Color, 0x39ff14, 0x00f0ff, 0xb026ff];

        for (let i = 0; i < 4; i++) {
            const isHuman = i === 0;
            const radius = 0.6;
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
                speed: 12.0,
                radius: radius,
                isDead: false,
                isGrounded: false,
                jumpForce: 15.0,
                currentLayer: 0
            });
        }
    }

    update(dt, inputs) {
        if (this.isGameOver) return;

        let aliveCount = 0;
        let lastAliveId = -1;

        // Update Tiles
        this.tiles.forEach(t => {
            if (t.isGone) return;
            if (t.isStepped) {
                t.timer -= dt;

                // Flash effect
                if (Math.floor(t.timer * 10) % 2 === 0) {
                    t.mesh.material = t.warnMat;
                } else {
                    t.mesh.material = t.baseMat;
                }

                if (t.timer <= 0) {
                    t.isGone = true;
                    this.group.remove(t.mesh);
                }
            }
        });

        // Track center of group for camera
        let groupCenter = new THREE.Vector3();
        let centerCount = 0;

        // Update Players
        this.players.forEach(p => {
            if (p.isDead) return;

            aliveCount++;
            lastAliveId = p.id;

            groupCenter.add(p.mesh.position);
            centerCount++;

            let moveDir = new THREE.Vector3();

            if (p.isHuman) {
                if (inputs.w || inputs.ArrowUp) moveDir.z -= 1;
                if (inputs.s || inputs.ArrowDown) moveDir.z += 1;
                if (inputs.a || inputs.ArrowLeft) moveDir.x -= 1;
                if (inputs.d || inputs.ArrowRight) moveDir.x += 1;

                if (moveDir.length() > 0) moveDir.normalize();

                if (inputs.Space && p.isGrounded) {
                    p.velocity.y = p.jumpForce;
                    p.isGrounded = false;
                }
            } else {
                this.updateAI(p, dt);
            }

            p.velocity.x = moveDir.x * p.speed;
            p.velocity.z = moveDir.z * p.speed;

            // Gravity
            p.velocity.y -= 30 * dt;

            // Apply movement
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

            // Check collision with tiles (only downward)
            p.isGrounded = false;
            let onTile = null;

            if (p.velocity.y <= 0) {
                // Find nearest tile under player
                let nearestDist = Infinity;
                let nearestTile = null;

                this.tiles.forEach(t => {
                    if (t.isGone) return;
                    // Fast height check
                    const dy = p.mesh.position.y - p.radius - (t.y + 0.25);
                    if (dy >= -0.5 && dy <= 0.5) {
                        const distSq =
                            (p.mesh.position.x - t.x) ** 2 + (p.mesh.position.z - t.z) ** 2;
                        if (distSq < nearestDist) {
                            nearestDist = distSq;
                            nearestTile = t;
                        }
                    }
                });

                // Hex inner radius roughly hexRadius * 0.866
                if (nearestTile && nearestDist < (this.hexRadius * 0.8) ** 2) {
                    p.mesh.position.y = nearestTile.y + 0.25 + p.radius;
                    p.velocity.y = 0;
                    p.isGrounded = true;
                    onTile = nearestTile;
                }
            }

            if (onTile) {
                if (!onTile.isStepped) {
                    onTile.isStepped = true;
                    onTile.timer = 0.8; // 0.8 seconds before falling
                }
                p.currentLayer = onTile.layer;
            }

            // Elimination
            if (p.mesh.position.y < -30) {
                p.isDead = true;
                this.group.remove(p.mesh);
            }
        });

        // Update Camera slightly
        if (centerCount > 0) {
            groupCenter.divideScalar(centerCount);
            const targetCamPos = new THREE.Vector3(
                groupCenter.x * 0.3,
                this.originalCameraPos.y + groupCenter.y,
                this.originalCameraPos.z + groupCenter.z * 0.3
            );
            this.camera.position.lerp(targetCamPos, dt * 2.0);
            this.camera.lookAt(groupCenter.x * 0.5, groupCenter.y, groupCenter.z * 0.5);
        }

        if (aliveCount <= 1) {
            this.triggerGameOver(lastAliveId);
        }
    }

    updateAI(p, dt) {
        if (!p.isGrounded) return; // Only steer when on ground

        // AI Logic: Find safe tile nearby
        let currentTile = null;
        let minDist = Infinity;

        const activeTiles = this.tiles.filter(
            t => !t.isGone && Math.abs(t.y - (p.mesh.position.y - p.radius - 0.25)) < 1.0
        );

        activeTiles.forEach(t => {
            const distSq = (p.mesh.position.x - t.x) ** 2 + (p.mesh.position.z - t.z) ** 2;
            if (distSq < minDist) {
                minDist = distSq;
                currentTile = t;
            }
        });

        if (!currentTile) {
            // Falling or no tiles, try jumping
            if (p.isGrounded) {
                p.velocity.y = p.jumpForce;
                p.isGrounded = false;
            }
            return;
        }

        // Steer away from crumbling tiles
        let targetTile = null;
        if (currentTile.isStepped) {
            // Find an adjacent safe tile
            let bestSafeTile = null;
            let minSafeDist = Infinity;
            activeTiles.forEach(t => {
                if (t === currentTile) return;
                const distSq = (currentTile.x - t.x) ** 2 + (currentTile.z - t.z) ** 2;
                if (distSq < (this.hexRadius * 2.5) ** 2) {
                    // Adjacent
                    if (!t.isStepped) {
                        const distToCenter = t.x ** 2 + t.z ** 2; // Prefer center
                        if (distToCenter < minSafeDist) {
                            minSafeDist = distToCenter;
                            bestSafeTile = t;
                        }
                    }
                }
            });

            if (bestSafeTile) {
                targetTile = bestSafeTile;
            } else {
                // Find further safe tile to jump to
                activeTiles.forEach(t => {
                    if (t === currentTile) return;
                    if (!t.isStepped) {
                        const distSq =
                            (p.mesh.position.x - t.x) ** 2 + (p.mesh.position.z - t.z) ** 2;
                        if (distSq < (this.hexRadius * 5) ** 2) {
                            // Jumpable
                            targetTile = t;
                        }
                    }
                });
                if (targetTile && p.isGrounded) {
                    p.velocity.y = p.jumpForce;
                    p.isGrounded = false;
                }
            }
        } else {
            // Randomly roam safely or stay
            targetTile = currentTile;
        }

        if (targetTile) {
            const dir = new THREE.Vector3(
                targetTile.x - p.mesh.position.x,
                0,
                targetTile.z - p.mesh.position.z
            );
            if (dir.length() > 0.5) {
                dir.normalize();
                p.velocity.x = dir.x * p.speed * 0.8;
                p.velocity.z = dir.z * p.speed * 0.8;
            } else {
                p.velocity.x = 0;
                p.velocity.z = 0;
            }
        }
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
            <h1 style="font-size: 4rem; margin-bottom: 10px; text-shadow: 0 0 20px ${winnerColor}; color: ${winnerColor}">SURVIVOR!</h1>
            <h2 style="font-size: 2rem; margin-bottom: 30px;">${winnerName} outlasted the fall!</h2>
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

        this.tiles.forEach(t => {
            if (!t.isGone) this.group.remove(t.mesh);
            t.mesh.geometry.dispose();
            if (Array.isArray(t.mesh.material)) {
                t.mesh.material.forEach(m => m.dispose());
            } else {
                t.mesh.material.dispose();
            }
        });
        this.tiles = [];

        this.players.forEach(p => {
            if (!p.isDead) this.group.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.players = [];

        this.createEnvironment();
        this.createPlayers();
        this.isGameOver = false;
        this.setupCamera();
    }

    destroy() {
        if (this.updateCallbackId !== undefined) {
            window.engine.updateCallbacks.splice(this.updateCallbackId, 1);
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

        console.log('Sky High destroyed');
    }
}

window.SkyHighGame = SkyHighGame;
