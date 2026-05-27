import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

window.createArticulatedCharacter = function (shape, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.15,
        metalness: 0.8,
        emissive: color,
        emissiveIntensity: 0.15
    });

    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.6, 0.3);
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);

    let specificHeadGeo = headGeo;
    let specificTorsoGeo = torsoGeo;
    let specificArmGeo = armGeo;
    let specificLegGeo = legGeo;

    if (shape === 'blaze') {
        specificTorsoGeo = new THREE.BoxGeometry(0.7, 0.7, 0.4);
        specificArmGeo = new THREE.BoxGeometry(0.3, 0.7, 0.3);
    } else if (shape === 'glitch') {
        specificArmGeo = new THREE.BoxGeometry(0.1, 0.7, 0.1);
        specificLegGeo = new THREE.BoxGeometry(0.15, 0.7, 0.15);
        specificTorsoGeo = new THREE.BoxGeometry(0.35, 0.6, 0.25);
    } else if (shape === 'wave') {
        specificTorsoGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.6, 16);
        specificHeadGeo = new THREE.SphereGeometry(0.3, 16, 16);
    } else if (shape === 'shadow') {
        specificArmGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
        specificLegGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
    }

    const head = new THREE.Mesh(specificHeadGeo, mat.clone());
    head.position.y = 0.9;
    head.castShadow = true;
    head.receiveShadow = true;

    if (shape === 'wave') {
        head.material.transparent = true;
        head.material.opacity = 0.7;
        head.material.roughness = 0.05;
    }

    if (shape === 'glitch') {
        const visor = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.1, 0.1),
            new THREE.MeshBasicMaterial({ color: 0x39ff14 })
        );
        visor.position.set(0, 0, 0.2);
        head.add(visor);
    } else if (shape === 'shadow') {
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb026ff });
        const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), eyeMat);
        const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), eyeMat);
        eyeL.position.set(-0.1, 0, 0.2);
        eyeR.position.set(0.1, 0, 0.2);
        head.add(eyeL);
        head.add(eyeR);
    }

    const torso = new THREE.Mesh(specificTorsoGeo, mat);
    torso.position.y = 0.4;
    torso.castShadow = true;
    torso.receiveShadow = true;

    if (shape === 'blaze') {
        const shoulderMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
        const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), shoulderMat);
        const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), shoulderMat);
        shoulderL.position.set(-0.4, 0.3, 0);
        shoulderR.position.set(0.4, 0.3, 0);
        torso.add(shoulderL);
        torso.add(shoulderR);
    }

    const armL = new THREE.Group();
    armL.position.set(-0.4, 0.6, 0);
    const armLMesh = new THREE.Mesh(specificArmGeo, mat);
    armLMesh.position.y = -0.3;
    armLMesh.castShadow = true;
    armLMesh.receiveShadow = true;
    armL.add(armLMesh);

    const armR = new THREE.Group();
    armR.position.set(0.4, 0.6, 0);
    const armRMesh = new THREE.Mesh(specificArmGeo, mat);
    armRMesh.position.y = -0.3;
    armRMesh.castShadow = true;
    armRMesh.receiveShadow = true;
    armR.add(armRMesh);

    const legL = new THREE.Group();
    legL.position.set(-0.2, 0.1, 0);
    const legLMesh = new THREE.Mesh(specificLegGeo, mat);
    legLMesh.position.y = -0.3;
    legLMesh.castShadow = true;
    legLMesh.receiveShadow = true;
    legL.add(legLMesh);

    const legR = new THREE.Group();
    legR.position.set(0.2, 0.1, 0);
    const legRMesh = new THREE.Mesh(specificLegGeo, mat);
    legRMesh.position.y = -0.3;
    legRMesh.castShadow = true;
    legRMesh.receiveShadow = true;
    legR.add(legRMesh);

    group.add(head);
    group.add(torso);
    group.add(armL);
    group.add(armR);
    group.add(legL);
    group.add(legR);

    group.userData.head = head;
    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.legL = legL;
    group.userData.legR = legR;

    return group;
};

window.animateArticulatedCharacter = function (group, velocity, time) {
    if (!group || !group.userData.armL) return;
    const speed = Math.min(velocity, 15.0);
    if (speed > 0.1) {
        const walkSpeed = speed * 0.8;
        const maxAngle = 1.0;
        group.userData.armL.rotation.x = Math.sin(time * walkSpeed) * maxAngle;
        group.userData.legR.rotation.x = Math.sin(time * walkSpeed) * maxAngle;
        group.userData.armR.rotation.x = -Math.sin(time * walkSpeed) * maxAngle;
        group.userData.legL.rotation.x = -Math.sin(time * walkSpeed) * maxAngle;
    } else {
        group.userData.armL.rotation.x = Math.sin(time * 2) * 0.1;
        group.userData.armR.rotation.x = -Math.sin(time * 2) * 0.1;
        group.userData.legL.rotation.x = 0;
        group.userData.legR.rotation.x = 0;
    }
};
