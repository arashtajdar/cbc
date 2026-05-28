import { launcherState } from "../core/LauncherState.js";
let playerPreviewsAnimationFrame = null;
import { create, animate } from "./CharacterBuilder.js";
import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

export const playerPreviews = {
    p1: { renderer: null, scene: null, camera: null, meshes: [], group: null },
    p2: { renderer: null, scene: null, camera: null, meshes: [], group: null },
    p3: { renderer: null, scene: null, camera: null, meshes: [], group: null },
    p4: { renderer: null, scene: null, camera: null, meshes: [], group: null }
};


export function initCharPreviews () {
    const players = ['p1', 'p2', 'p3', 'p4'];

    // Clear any existing previews
    players.forEach(pKey => {
        const container = document.getElementById(`${pKey}-char-list`);
        if (container) {
            // Keep overlay if exists, clear canvas elements
            const canvases = container.querySelectorAll('canvas');
            canvases.forEach(c => c.remove());
        }

        const preview = playerPreviews[pKey];
        if (preview && preview.renderer) {
            preview.renderer.dispose();
        }
        playerPreviews[pKey] = {
            renderer: null,
            scene: null,
            camera: null,
            meshes: [],
            group: null
        };
    });

    if (playerPreviewsAnimationFrame) {
        cancelAnimationFrame(playerPreviewsAnimationFrame);
        
    }

    players.forEach(pKey => {
        const container = document.getElementById(`${pKey}-char-list`);
        if (!container) return;

        const width = container.clientWidth || 160;
        const height = container.clientHeight || 250;

        const scene = new THREE.Scene();

        // Transparent renderer background to match glass cards
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // Position camera to look at the vertical stack of 4 characters
        const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        camera.position.set(0, 0, 5.8);
        camera.lookAt(0, 0, 0);

        // Light Setup
        const ambientLight = new THREE.AmbientLight(0x2a3350, 1.4);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffedd8, 2.0);
        dirLight.position.set(3, 4, 3);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const rimLight = new THREE.DirectionalLight(0x8833ff, 1.2);
        rimLight.position.set(-3, 1, -3);
        scene.add(rimLight);

        const group = new THREE.Group();
        scene.add(group);

        playerPreviews[pKey] = { renderer, scene, camera, meshes: [], group };
    });

    buildPlayerPreviews();

    const clock = new THREE.Clock();

    function animatePlayerPreviews() {
        playerPreviewsAnimationFrame = requestAnimationFrame(animatePlayerPreviews);
        const elapsed = clock.getElapsedTime();
        const dt = Math.min(clock.getDelta(), 0.1);

        players.forEach(pKey => {
            const preview = playerPreviews[pKey];
            if (!preview || !preview.renderer) return;

            if (pKey !== 'p1' && !launcherState.p1LockedIn) {
                // Ensure background is cleared while waiting
                preview.renderer.render(preview.scene, preview.camera);
                return;
            }

            const selectedIdx = launcherState.playerAssignments[pKey];
            const numChars = launcherState.characters.length;
            const prevIdx = selectedIdx - 1;
            const nextIdx = selectedIdx + 1;

            preview.meshes.forEach((item, index) => {
                let isSelected = false;
                let targetScale = 0;
                let targetY = 0;
                let visible = false;

                if (index === selectedIdx) {
                    isSelected = true;
                    targetScale = 0.45;
                    targetY = 0.0;
                    visible = true;
                } else if (index === prevIdx && prevIdx >= 0) {
                    targetScale = 0.25;
                    targetY = 1.7;
                    visible = true;
                } else if (index === nextIdx && nextIdx < numChars) {
                    targetScale = 0.25;
                    targetY = -1.7;
                    visible = true;
                }

                if (item.baseY === undefined) item.baseY = targetY;

                if (item.mesh) {
                    item.mesh.visible = visible;
                    if (visible) {
                        item.baseY = THREE.MathUtils.lerp(item.baseY, targetY, 0.15);
                        item.mesh.position.y =
                            item.baseY + Math.sin(elapsed * 2.0 + index * 1.0) * 0.1;
                        item.mesh.rotation.y += 0.8 * dt;
                        item.mesh.scale.lerp(
                            new THREE.Vector3(targetScale, targetScale, targetScale),
                            0.12
                        );

                        if (
                            item.mesh.material &&
                            item.mesh.material.emissiveIntensity !== undefined
                        ) {
                            item.mesh.material.emissiveIntensity = isSelected
                                ? 0.6 + Math.sin(elapsed * 6.0) * 0.15
                                : 0.15;
                        }
                    }
                }
                if (item.pedestal) {
                    item.pedestal.visible = visible;
                    if (visible) item.pedestal.position.y = item.baseY - 0.2;
                }
                if (item.pedestalGlow) {
                    item.pedestalGlow.visible = visible;
                    if (visible) {
                        item.pedestalGlow.position.y = item.baseY - 0.17;
                        const scaleVal = isSelected ? 1.0 + Math.sin(elapsed * 6.0) * 0.06 : 0.55;
                        item.pedestalGlow.scale.set(scaleVal, scaleVal, scaleVal);
                        item.pedestalGlow.material.opacity = isSelected ? 0.85 : 0.2;
                    }
                }
            });

            preview.renderer.render(preview.scene, preview.camera);
        });
    }

    animatePlayerPreviews();
};

export function buildPlayerPreviews () {
    const players = ['p1', 'p2', 'p3', 'p4'];

    players.forEach(pKey => {
        const preview = playerPreviews[pKey];
        if (!preview || !preview.renderer || !preview.group) return;

        // Clean up existing meshes
        preview.meshes.forEach(item => {
            if (item.mesh) {
                preview.group.remove(item.mesh);
                item.mesh.traverse(child => {
                    if (child.isMesh) {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    }
                });
            }
            if (item.pedestalGlow) {
                preview.group.remove(item.pedestalGlow);
                item.pedestalGlow.geometry.dispose();
                item.pedestalGlow.material.dispose();
            }
            if (item.pedestal) {
                preview.group.remove(item.pedestal);
                item.pedestal.geometry.dispose();
                item.pedestal.material.dispose();
            }
        });

        preview.meshes = [];
        preview.group.clear();

        if (pKey !== 'p1' && !launcherState.p1LockedIn) {
            return; // Leave empty until locked in
        }

        const selectedIdx = launcherState.playerAssignments[pKey];
        const numChars = launcherState.characters.length;
        const prevIdx = selectedIdx - 1;
        const nextIdx = selectedIdx + 1;

        launcherState.characters.forEach((charData, cIdx) => {
            let initialY = 0;
            if (cIdx === prevIdx && prevIdx >= 0) initialY = 1.7;
            else if (cIdx === nextIdx && nextIdx < numChars) initialY = -1.7;

            const xPos = -0.55;

            // 1. Pedestal Base
            const pedGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.06, 16);
            const pedMat = new THREE.MeshStandardMaterial({
                color: 0x1c1f30,
                roughness: 0.5,
                metalness: 0.8
            });
            const pedestal = new THREE.Mesh(pedGeo, pedMat);
            pedestal.position.set(xPos, initialY - 0.2, 0);
            pedestal.receiveShadow = true;
            preview.group.add(pedestal);

            // Pedestal Glow Ring
            const ringGeo = new THREE.RingGeometry(0.32, 0.36, 16);
            const ringMat = new THREE.MeshBasicMaterial({
                color: charData.color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(xPos, initialY - 0.17, 0);
            preview.group.add(ring);

            // 2. Character Geometry Setup
            const charMesh = create(charData.shape, charData.color);
            charMesh.scale.set(0.35, 0.35, 0.35);
            charMesh.position.set(xPos, initialY - 0.1, 0);
            preview.group.add(charMesh);

            preview.meshes.push({
                mesh: charMesh,
                pedestal: pedestal,
                pedestalGlow: ring,
                baseY: initialY
            });
        });
    });
};

export function stopPlayerPreviewsAnimation() {
    if (playerPreviewsAnimationFrame) {
        cancelAnimationFrame(playerPreviewsAnimationFrame);
        playerPreviewsAnimationFrame = null;
    }
}
