import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

export class MeltDownGame {
    constructor(containerId, p1Color) {
        this.containerId = containerId;
        this.p1Color = p1Color || 0xff3333;

        window.MeltDownGame = this.constructor;

        this.scene = window.engine.scene;
        this.camera = window.engine.camera;
        this.renderer = window.engine.renderer;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.players = [];
        this.arenaRadius = 18;
        this.isGameOver = false;

        this.baseAngularVelocity = 1.0;
        this.angularVelocity = this.baseAngularVelocity;
        this.matchTime = 0;

        // Custom inputs for ducking
        this.customInputs = { duck: false };
        this.handleKeyDown = e => {
            if (e.key === 'Shift' || e.key === 'Control') this.customInputs.duck = true;
        };
        this.handleKeyUp = e => {
            if (e.key === 'Shift' || e.key === 'Control') this.customInputs.duck = false;
        };
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        this.originalCameraPos = this.camera.position.clone();
        this.originalCameraRot = this.camera.rotation.clone();
        this.setupCamera();

        this.createEnvironment();
        this.createPlayers();

        this.updateCallbackId =
            window.engine.updateCallbacks.push((dt, time) => {
                // Wait for activeGame update
            }) - 1;

        console.log('Melt Down initialized!');
    }

    setupCamera() {
        this.camera.position.set(0, 30, 35);
        this.camera.lookAt(0, 0, 0);
    }

    createEnvironment() {
        // Main Circular Platform
        const platGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 2, 64);
        const platMat = new THREE.MeshStandardMaterial({
            color: 0x223355,
            roughness: 0.7,
            metalness: 0.2
        });
        const platform = new THREE.Mesh(platGeo, platMat);
        platform.position.y = -1;
        platform.receiveShadow = true;
        this.group.add(platform);

        // Void plane
        const voidGeo = new THREE.PlaneGeometry(200, 200);
        const voidMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
        const voidMesh = new THREE.Mesh(voidGeo, voidMat);
        voidMesh.rotation.x = -Math.PI / 2;
        voidMesh.position.y = -15;
        this.group.add(voidMesh);

        // Sweeping Beams Pivot
        this.pivot = new THREE.Group();
        this.group.add(this.pivot);

        // Center Pillar
        const pillarGeo = new THREE.CylinderGeometry(1.5, 1.5, 6, 16);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.y = 3;
        this.pivot.add(pillar);

        // Low Beam (Jump over) - Red
        const lowBeamGeo = new THREE.CylinderGeometry(0.8, 0.8, this.arenaRadius, 16);
        const lowBeamMat = new THREE.MeshStandardMaterial({ color: 0xff3300 });
        this.lowBeam = new THREE.Mesh(lowBeamGeo, lowBeamMat);
        this.lowBeam.rotation.z = Math.PI / 2;
        this.lowBeam.position.set(this.arenaRadius / 2, 1.2, 0); // Y=1.2 so bottom is 0.4
        this.lowBeam.castShadow = true;
        this.pivot.add(this.lowBeam);

        // High Beam (Duck under) - Blue
        const highBeamGeo = new THREE.CylinderGeometry(0.8, 0.8, this.arenaRadius, 16);
        const highBeamMat = new THREE.MeshStandardMaterial({ color: 0x00aaff });
        this.highBeam = new THREE.Mesh(highBeamGeo, highBeamMat);
        this.highBeam.rotation.z = Math.PI / 2;
        this.highBeam.position.set(-this.arenaRadius / 2, 3.5, 0); // Y=3.5 so bottom is 2.7
        this.highBeam.castShadow = true;
        this.pivot.add(this.highBeam);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.group.add(ambientLight);
    }

    createPlayers() {
        const startPositions = [
            new THREE.Vector3(0, 1.5, 10),
            new THREE.Vector3(0, 1.5, -10),
            new THREE.Vector3(10, 1.5, 0),
            new THREE.Vector3(-10, 1.5, 0)
        ];

        const colors = [this.p1Color, 0x39ff14, 0x00f0ff, 0xb026ff];

        for (let i = 0; i < 4; i++) {
            const isHuman = i === 0;

            // Using a Box geometry so shrinking the Y scale looks like ducking
            const width = 1.0;
            const height = 2.0;
            const depth = 1.0;
            const geo = new THREE.BoxGeometry(width, height, depth);
            const mat = new THREE.MeshStandardMaterial({
                color: colors[i],
                roughness: 0.3,
                metalness: 0.5,
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
                width: width,
                height: height,
                depth: depth,
                isDead: false,
                isGrounded: true,
                isDucking: false,
                jumpForce: 18.0,
                radius: 1.0 // For collision approximation
            });
        }
    }

    update(dt, inputs) {
        if (this.isGameOver) return;

        this.matchTime += dt;

        // Increase angular velocity slowly over time (cap at 3.5 rad/s)
        this.angularVelocity = Math.min(3.5, this.baseAngularVelocity + this.matchTime * 0.05);

        // Rotate beams
        this.pivot.rotation.y += this.angularVelocity * dt;

        let aliveCount = 0;
        let lastAliveId = -1;

        this.players.forEach(p => {
            if (p.isDead) return;
            aliveCount++;
            lastAliveId = p.id;

            let moveDir = new THREE.Vector3();
            let wantJump = false;
            let wantDuck = false;

            if (p.isHuman) {
                if (inputs.w || inputs.ArrowUp) moveDir.z -= 1;
                if (inputs.s || inputs.ArrowDown) moveDir.z += 1;
                if (inputs.a || inputs.ArrowLeft) moveDir.x -= 1;
                if (inputs.d || inputs.ArrowRight) moveDir.x += 1;

                if (moveDir.length() > 0) moveDir.normalize();

                wantJump = inputs.Space;
                wantDuck = this.customInputs.duck;
            } else {
                this.updateAI(p, dt);
                // AI handles its own duck/jump state internal to AI method, but we can read it
                wantJump = p.wantJump;
                wantDuck = p.wantDuck;
                moveDir.copy(p.moveDir);
            }

            // Apply Ducking
            if (wantDuck && p.isGrounded) {
                p.isDucking = true;
                p.mesh.scale.y = 0.5; // Shrink to half height
                // Offset Y to keep on ground
                if (p.isGrounded) p.mesh.position.y = 0.5;
            } else {
                p.isDucking = false;
                p.mesh.scale.y = 1.0;
                if (p.isGrounded) p.mesh.position.y = 1.0;
            }

            // Ground checking
            if (p.mesh.position.y <= (p.isDucking ? 0.5 : 1.0) && p.velocity.y <= 0) {
                // Determine if we are still on platform
                const distFromCenter = Math.sqrt(p.mesh.position.x ** 2 + p.mesh.position.z ** 2);
                if (distFromCenter <= this.arenaRadius) {
                    p.isGrounded = true;
                    p.velocity.y = 0;
                    p.mesh.position.y = p.isDucking ? 0.5 : 1.0;
                } else {
                    p.isGrounded = false; // fall off
                }
            } else {
                p.isGrounded = false;
            }

            // Jumping
            if (wantJump && p.isGrounded && !p.isDucking) {
                p.velocity.y = p.jumpForce;
                p.isGrounded = false;
            }

            // Horizontal Movement (only control if not knocked in the air heavily)
            // If they got hit, let them fly. If grounded or jumping on purpose, allow control.
            if (p.isGrounded || Math.abs(p.velocity.x) < p.speed * 1.5) {
                const currentY = p.velocity.y; // preserve vertical
                // Reduce speed if ducking
                const currentSpeed = p.isDucking ? p.speed * 0.4 : p.speed;

                // Smooth velocity
                p.velocity.x = THREE.MathUtils.lerp(
                    p.velocity.x,
                    moveDir.x * currentSpeed,
                    10 * dt
                );
                p.velocity.z = THREE.MathUtils.lerp(
                    p.velocity.z,
                    moveDir.z * currentSpeed,
                    10 * dt
                );
                p.velocity.y = currentY;
            }

            // Gravity
            if (!p.isGrounded) {
                p.velocity.y -= 40 * dt;
            }

            // Apply physics
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

            // Elimination
            if (p.mesh.position.y < -10) {
                p.isDead = true;
                this.group.remove(p.mesh);
            }
        });

        this.checkBeamCollisions();

        if (aliveCount <= 1) {
            this.triggerGameOver(lastAliveId);
        }
    }

    checkBeamCollisions() {
        // The low beam is along positive X axis of pivot
        // The high beam is along negative X axis of pivot
        // Let's get their world positions/orientations

        const pivotRot = this.pivot.rotation.y;

        // Low beam direction in world space
        const lowDir = new THREE.Vector3(Math.cos(pivotRot), 0, -Math.sin(pivotRot));
        // High beam direction in world space
        const highDir = new THREE.Vector3(-Math.cos(pivotRot), 0, Math.sin(pivotRot));

        this.players.forEach(p => {
            if (p.isDead) return;

            // Simple line-point distance check in XZ plane
            const pPos = p.mesh.position.clone();
            pPos.y = 0; // Project to XZ

            // Check Low Beam (jump over)
            let lowDot = pPos.dot(lowDir);
            if (lowDot > 0 && lowDot < this.arenaRadius) {
                // Player is on the low beam side
                const proj = lowDir.clone().multiplyScalar(lowDot);
                const distToLine = pPos.distanceTo(proj);

                // Beam radius = 0.8, player approx radius = 0.8
                if (distToLine < 1.6) {
                    // Check Y bounds
                    // Low beam Y is 1.2, radius 0.8 -> goes from Y=0.4 to Y=2.0
                    // Player Y is position.y. Scale affects height.
                    const pBottom = p.mesh.position.y - (p.isDucking ? 0.5 : 1.0);
                    const pTop = p.mesh.position.y + (p.isDucking ? 0.5 : 1.0);

                    if (pBottom < 2.0 && pTop > 0.4) {
                        // Collision!
                        this.applyKnockback(p, lowDir, pivotRot);
                    }
                }
            }

            // Check High Beam (duck under)
            let highDot = pPos.dot(highDir);
            if (highDot > 0 && highDot < this.arenaRadius) {
                const proj = highDir.clone().multiplyScalar(highDot);
                const distToLine = pPos.distanceTo(proj);

                if (distToLine < 1.6) {
                    // High beam Y is 3.5, radius 0.8 -> goes from Y=2.7 to Y=4.3
                    const pBottom = p.mesh.position.y - (p.isDucking ? 0.5 : 1.0);
                    const pTop = p.mesh.position.y + (p.isDucking ? 0.5 : 1.0);

                    if (pBottom < 4.3 && pTop > 2.7) {
                        // Collision!
                        this.applyKnockback(p, highDir, pivotRot + Math.PI); // offset rotation
                    }
                }
            }
        });
    }

    applyKnockback(player, beamDir, beamAngle) {
        // Normal vector is perpendicular to beamDir in direction of rotation
        const normal = new THREE.Vector3(-Math.sin(beamAngle), 0, -Math.cos(beamAngle)).normalize();

        // Push outward and forward
        const outward = player.mesh.position.clone().setY(0).normalize();

        const force = normal
            .multiplyScalar(this.angularVelocity * 15)
            .add(outward.multiplyScalar(15));

        player.velocity.x = force.x;
        player.velocity.z = force.z;
        player.velocity.y = 15; // knock up

        player.isGrounded = false;
        player.isDucking = false;
    }

    updateAI(p, dt) {
        p.wantJump = false;
        p.wantDuck = false;
        p.moveDir = new THREE.Vector3();

        const pivotRot = this.pivot.rotation.y;

        // Low beam direction
        const lowDir = new THREE.Vector3(Math.cos(pivotRot), 0, -Math.sin(pivotRot));
        // High beam direction
        const highDir = new THREE.Vector3(-Math.cos(pivotRot), 0, Math.sin(pivotRot));

        const pPos = p.mesh.position.clone();
        pPos.y = 0;

        const distFromCenter = pPos.length();

        // 1. Stay on platform
        if (distFromCenter > this.arenaRadius * 0.6) {
            p.moveDir.copy(pPos).negate().normalize();
        } else if (distFromCenter < 3.0) {
            // Don't hug center pillar
            p.moveDir.copy(pPos).normalize();
        }

        // 2. Dodge Beams
        // Find angle to each beam
        // The beam rotates CCW or CW? Y rotation increases -> counter-clockwise if looking from top
        // Normal of the low beam pushing forward:
        const lowNormal = new THREE.Vector3(-Math.sin(pivotRot), 0, -Math.cos(pivotRot));
        const highNormal = new THREE.Vector3(
            -Math.sin(pivotRot + Math.PI),
            0,
            -Math.cos(pivotRot + Math.PI)
        );

        // Distance of player ahead of the beam = dot product of position and beam normal
        const lowDistAhead = pPos.dot(lowNormal);
        const lowDistAlong = pPos.dot(lowDir);

        if (lowDistAlong > 0 && lowDistAhead > 0 && lowDistAhead < 5.0) {
            // Low beam is approaching within 5 units
            // AI should jump right before it hits
            if (lowDistAhead < 2.5 && p.isGrounded) {
                p.wantJump = true;
            }
        }

        const highDistAhead = pPos.dot(highNormal);
        const highDistAlong = pPos.dot(highDir);

        if (highDistAlong > 0 && highDistAhead > 0 && highDistAhead < 5.0) {
            // High beam approaching
            if (highDistAhead < 3.5 && p.isGrounded) {
                p.wantDuck = true;
                p.moveDir.set(0, 0, 0); // Stop moving while ducking
            }
        }

        // Sometimes AI gets confused or misses, let's add a small reaction delay flaw
        // For simplicity, we just use precise distances above.
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
            <h1 style="font-size: 4rem; margin-bottom: 10px; text-shadow: 0 0 20px ${winnerColor}; color: ${winnerColor}">MELTDOWN CHAMPION!</h1>
            <h2 style="font-size: 2rem; margin-bottom: 30px;">${winnerName} avoided the sweep!</h2>
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

        this.players.forEach(p => {
            if (!p.isDead) this.group.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.players = [];

        this.matchTime = 0;
        this.angularVelocity = this.baseAngularVelocity;
        this.pivot.rotation.y = 0;

        this.createPlayers();
        this.isGameOver = false;
        this.setupCamera();
    }

    destroy() {
        if (this.updateCallbackId !== undefined) {
            window.engine.updateCallbacks.splice(this.updateCallbackId, 1);
        }

        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

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

        console.log('Melt Down destroyed');
    }
}

window.MeltDownGame = MeltDownGame;
