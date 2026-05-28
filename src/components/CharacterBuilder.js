import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

export function create(shape, playerColor) {
    const group = new THREE.Group();
    
    // Default fur materials
    const furMats = {
        bumpo: new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.8, metalness: 0.1 }), // Warm matte brown
        zippy: new THREE.MeshStandardMaterial({ color: 0xD95319, roughness: 0.7, metalness: 0.1 }), // Reddish-orange
        puddle: new THREE.MeshStandardMaterial({ color: 0x954520, roughness: 0.8, metalness: 0.1 }), // Chestnut brown
        sly: new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.6, metalness: 0.2 }), // Slate gray
    };
    
    const furMat = furMats[shape] || furMats.bumpo;
    
    // The player color material for the primary clothing asset
    const clothMat = new THREE.MeshStandardMaterial({
        color: playerColor,
        roughness: 0.9,
        metalness: 0.05
    });

    const secClothMat = new THREE.MeshStandardMaterial({
        color: 0x222222, // generic secondary dark color
        roughness: 0.9,
        metalness: 0.1
    });

    // We need articulated limbs. We will build an armature-like hierarchy.
    const headGroup = new THREE.Group();
    const torsoGroup = new THREE.Group();
    const armLGroup = new THREE.Group();
    const armRGroup = new THREE.Group();
    const legLGroup = new THREE.Group();
    const legRGroup = new THREE.Group();
    
    // Torso is the root.
    group.add(torsoGroup);
    torsoGroup.add(headGroup);
    torsoGroup.add(armLGroup);
    torsoGroup.add(armRGroup);
    group.add(legLGroup);
    group.add(legRGroup);
    
    let headGeo, torsoGeo, armGeo, legGeo;
    
    if (shape === 'bumpo') {
        // Bumpo the Bear
        headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        torsoGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.6, 16);
        armGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.5, 12);
        legGeo = new THREE.CylinderGeometry(0.18, 0.15, 0.4, 12);

        // Head
        const headMesh = new THREE.Mesh(headGeo, furMat);
        headMesh.position.y = 0.25;
        headGroup.add(headMesh);
        
        // Ears
        const earGeo = new THREE.SphereGeometry(0.1, 8, 8, 0, Math.PI*2, 0, Math.PI/2);
        const earL = new THREE.Mesh(earGeo, furMat);
        earL.position.set(-0.2, 0.5, 0);
        const earR = new THREE.Mesh(earGeo, furMat);
        earR.position.set(0.2, 0.5, 0);
        headGroup.add(earL);
        headGroup.add(earR);
        
        // T-Shirt (Player Color)
        const shirtGeo = new THREE.CylinderGeometry(0.36, 0.41, 0.45, 16);
        const shirt = new THREE.Mesh(shirtGeo, clothMat);
        shirt.position.y = 0.075;
        torsoGroup.add(shirt);
        
        // Shorts (Denim Blue)
        const denimMat = new THREE.MeshStandardMaterial({ color: 0x1A2B4C, roughness: 0.9 });
        const shortsGeo = new THREE.CylinderGeometry(0.41, 0.41, 0.2, 16);
        const shorts = new THREE.Mesh(shortsGeo, denimMat);
        shorts.position.y = -0.25;
        torsoGroup.add(shorts);
        
        // Torso body
        const bodyMesh = new THREE.Mesh(torsoGeo, furMat);
        torsoGroup.add(bodyMesh);
        
        // Arms
        const armLMesh = new THREE.Mesh(armGeo, furMat);
        armLMesh.position.y = -0.25;
        const shirtSleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 12), clothMat);
        shirtSleeveL.position.y = -0.1;
        armLGroup.add(armLMesh);
        armLGroup.add(shirtSleeveL);
        
        const armRMesh = new THREE.Mesh(armGeo, furMat);
        armRMesh.position.y = -0.25;
        const shirtSleeveR = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 12), clothMat);
        shirtSleeveR.position.y = -0.1;
        armRGroup.add(armRMesh);
        armRGroup.add(shirtSleeveR);
        
        // Legs
        const legLMesh = new THREE.Mesh(legGeo, furMat);
        legLMesh.position.y = -0.2;
        const shortLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.15, 12), denimMat);
        shortLegL.position.y = -0.05;
        legLGroup.add(legLMesh);
        legLGroup.add(shortLegL);
        
        const legRMesh = new THREE.Mesh(legGeo, furMat);
        legRMesh.position.y = -0.2;
        const shortLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.15, 12), denimMat);
        shortLegR.position.y = -0.05;
        legRGroup.add(legRMesh);
        legRGroup.add(shortLegR);
        
        // Positions
        torsoGroup.position.y = 0.5;
        headGroup.position.y = 0.3;
        armLGroup.position.set(-0.45, 0.2, 0);
        armRGroup.position.set(0.45, 0.2, 0);
        legLGroup.position.set(-0.2, 0.2, 0);
        legRGroup.position.set(0.2, 0.2, 0);

    } else if (shape === 'zippy') {
        // Zippy the Squirrel
        headGeo = new THREE.SphereGeometry(0.22, 16, 16);
        torsoGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.45, 12);
        armGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.4, 8);
        legGeo = new THREE.CylinderGeometry(0.08, 0.05, 0.4, 8);

        // Head
        const headMesh = new THREE.Mesh(headGeo, furMat);
        headMesh.position.y = 0.1;
        headGroup.add(headMesh);
        
        // Cap (Player color)
        const capGeo = new THREE.SphereGeometry(0.23, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const cap = new THREE.Mesh(capGeo, clothMat);
        cap.position.y = 0.12;
        const capBrimGeo = new THREE.BoxGeometry(0.2, 0.05, 0.2);
        const capBrim = new THREE.Mesh(capBrimGeo, clothMat);
        capBrim.position.set(0, 0.12, -0.2); // Backwards
        headGroup.add(cap);
        headGroup.add(capBrim);
        
        // Torso
        const bodyMesh = new THREE.Mesh(torsoGeo, furMat);
        torsoGroup.add(bodyMesh);
        
        // Vest (White)
        const vestMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 });
        const vestGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.4, 12, 1, true, Math.PI * 0.2, Math.PI * 1.6);
        const vest = new THREE.Mesh(vestGeo, vestMat);
        vest.material.side = THREE.DoubleSide;
        torsoGroup.add(vest);
        
        // Tail
        const tailGroup = new THREE.Group();
        const tailMat = furMat;
        let pY = -0.15;
        let pZ = -0.15;
        let rotX = -Math.PI / 4;
        for (let i = 0; i < 4; i++) {
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.15), tailMat);
            seg.position.set(0, pY, pZ);
            seg.rotation.x = rotX;
            tailGroup.add(seg);
            pY += 0.15;
            pZ -= 0.1;
            rotX -= 0.2;
        }
        torsoGroup.add(tailGroup);
        
        // Arms
        const armLMesh = new THREE.Mesh(armGeo, furMat);
        armLMesh.position.y = -0.2;
        armLGroup.add(armLMesh);
        
        const armRMesh = new THREE.Mesh(armGeo, furMat);
        armRMesh.position.y = -0.2;
        armRGroup.add(armRMesh);
        
        // Legs
        const legLMesh = new THREE.Mesh(legGeo, furMat);
        legLMesh.position.y = -0.2;
        legLGroup.add(legLMesh);
        
        const legRMesh = new THREE.Mesh(legGeo, furMat);
        legRMesh.position.y = -0.2;
        legRGroup.add(legRMesh);
        
        // Positions
        torsoGroup.position.y = 0.5;
        headGroup.position.y = 0.25;
        armLGroup.position.set(-0.25, 0.15, 0);
        armRGroup.position.set(0.25, 0.15, 0);
        legLGroup.position.set(-0.1, 0.25, 0);
        legRGroup.position.set(0.1, 0.25, 0);

    } else if (shape === 'puddle') {
        // Puddle the Beaver
        headGeo = new THREE.BoxGeometry(0.35, 0.3, 0.4);
        torsoGeo = new THREE.ConeGeometry(0.35, 0.5, 12, 1, false, 0, Math.PI * 2);
        armGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.3, 8);
        legGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.2, 8);

        // Head
        const headMesh = new THREE.Mesh(headGeo, furMat);
        headMesh.position.y = 0.15;
        headGroup.add(headMesh);
        
        // Teeth
        const toothMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
        const toothL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), toothMat);
        const toothR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), toothMat);
        toothL.position.set(-0.045, 0, 0.21);
        toothR.position.set(0.045, 0, 0.21);
        headGroup.add(toothL);
        headGroup.add(toothR);
        
        // Torso
        const bodyMesh = new THREE.Mesh(torsoGeo, furMat);
        bodyMesh.position.y = -0.1;
        torsoGroup.add(bodyMesh);
        
        // Under shirt (plaid substitute)
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0xaa2222 });
        const shirtMesh = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.4, 12), shirtMat);
        shirtMesh.position.y = -0.05;
        torsoGroup.add(shirtMesh);
        
        // Overalls (Player color)
        const overallsGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.25, 12);
        const overalls = new THREE.Mesh(overallsGeo, clothMat);
        overalls.position.y = -0.22;
        torsoGroup.add(overalls);
        
        const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.02), clothMat);
        strapL.position.set(-0.15, 0, 0.2);
        strapL.rotation.z = -0.2;
        torsoGroup.add(strapL);
        
        // Button
        const buttonMat = new THREE.MeshStandardMaterial({ color: 0xDDDDDD, metalness: 0.8 });
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), buttonMat);
        button.position.set(-0.13, -0.05, 0.22);
        button.rotation.x = Math.PI / 2;
        torsoGroup.add(button);
        
        // Tail
        const tailMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.9 });
        const tailGeo = new THREE.BoxGeometry(0.25, 0.05, 0.4);
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.set(0, -0.3, -0.3);
        tail.rotation.x = -0.2;
        torsoGroup.add(tail);
        
        // Arms
        const armLMesh = new THREE.Mesh(armGeo, furMat);
        armLMesh.position.y = -0.15;
        armLGroup.add(armLMesh);
        
        const armRMesh = new THREE.Mesh(armGeo, furMat);
        armRMesh.position.y = -0.15;
        armRGroup.add(armRMesh);
        
        // Legs
        const legLMesh = new THREE.Mesh(legGeo, furMat);
        legLMesh.position.y = -0.1;
        legLGroup.add(legLMesh);
        
        const legRMesh = new THREE.Mesh(legGeo, furMat);
        legRMesh.position.y = -0.1;
        legRGroup.add(legRMesh);
        
        // Positions
        torsoGroup.position.y = 0.4;
        headGroup.position.y = 0.2;
        armLGroup.position.set(-0.35, 0.05, 0);
        armRGroup.position.set(0.35, 0.05, 0);
        legLGroup.position.set(-0.15, 0.15, 0);
        legRGroup.position.set(0.15, 0.15, 0);

    } else if (shape === 'sly') {
        // Sly the Raccoon
        headGeo = new THREE.BoxGeometry(0.28, 0.25, 0.3);
        torsoGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12);
        armGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.45, 8);
        legGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.45, 8);

        // Head
        const headMesh = new THREE.Mesh(headGeo, furMat);
        headMesh.position.y = 0.12;
        headGroup.add(headMesh);
        
        // Ears
        const earGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
        const earL = new THREE.Mesh(earGeo, furMat);
        earL.position.set(-0.1, 0.3, 0);
        const earR = new THREE.Mesh(earGeo, furMat);
        earR.position.set(0.1, 0.3, 0);
        headGroup.add(earL);
        headGroup.add(earR);
        
        // Mask
        const maskMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const mask = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.32), maskMat);
        mask.position.y = 0.15;
        headGroup.add(mask);
        
        // Torso body
        const bodyMesh = new THREE.Mesh(torsoGeo, furMat);
        torsoGroup.add(bodyMesh);
        
        // Hoodie (Player Color)
        const hoodieGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.4, 12);
        const hoodie = new THREE.Mesh(hoodieGeo, clothMat);
        hoodie.position.y = 0.05;
        torsoGroup.add(hoodie);
        
        const hoodGeo = new THREE.TorusGeometry(0.18, 0.06, 8, 12, Math.PI);
        const hood = new THREE.Mesh(hoodGeo, clothMat);
        hood.position.set(0, 0.25, -0.1);
        hood.rotation.x = Math.PI / 2;
        torsoGroup.add(hood);
        
        // Tail
        const tailGroup = new THREE.Group();
        let py = -0.2;
        let pz = -0.1;
        let rx = -Math.PI/6;
        for (let i=0; i<6; i++) {
            const isBlack = i % 2 !== 0;
            const tMat = isBlack ? maskMat : furMat;
            const tSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 8), tMat);
            tSeg.position.set(0, py, pz);
            tSeg.rotation.x = rx;
            tailGroup.add(tSeg);
            py -= 0.1;
            pz -= 0.1;
            rx -= 0.1;
        }
        torsoGroup.add(tailGroup);
        
        // Arms
        const armLMesh = new THREE.Mesh(armGeo, furMat);
        armLMesh.position.y = -0.22;
        const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.25, 8), clothMat);
        sleeveL.position.y = -0.12;
        armLGroup.add(armLMesh);
        armLGroup.add(sleeveL);
        
        const armRMesh = new THREE.Mesh(armGeo, furMat);
        armRMesh.position.y = -0.22;
        const sleeveR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.25, 8), clothMat);
        sleeveR.position.y = -0.12;
        armRGroup.add(armRMesh);
        armRGroup.add(sleeveR);
        
        // Legs
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C }); // Beige
        const legLMesh = new THREE.Mesh(legGeo, furMat);
        legLMesh.position.y = -0.22;
        const pantsL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), pantsMat);
        pantsL.position.y = -0.15;
        legLGroup.add(legLMesh);
        legLGroup.add(pantsL);
        
        const legRMesh = new THREE.Mesh(legGeo, furMat);
        legRMesh.position.y = -0.22;
        const pantsR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), pantsMat);
        pantsR.position.y = -0.15;
        legRGroup.add(legRMesh);
        legRGroup.add(pantsR);
        
        // Positions
        torsoGroup.position.y = 0.55;
        headGroup.position.y = 0.25;
        armLGroup.position.set(-0.28, 0.15, 0);
        armRGroup.position.set(0.28, 0.15, 0);
        legLGroup.position.set(-0.12, 0.22, 0);
        legRGroup.position.set(0.12, 0.22, 0);
    }
    
    // Enable shadows
    group.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    group.userData.head = headGroup;
    group.userData.armL = armLGroup;
    group.userData.armR = armRGroup;
    group.userData.legL = legLGroup;
    group.userData.legR = legRGroup;
    
    return group;
}

export function animate(group, velocity, time) {
    if (!group || !group.userData.armL) return;
    const speed = Math.min(velocity, 15.0);
    if (speed > 0.1) {
        const walkSpeed = speed * 0.8;
        const maxAngle = 0.8;
        group.userData.armL.rotation.x = Math.sin(time * walkSpeed) * maxAngle;
        group.userData.legR.rotation.x = Math.sin(time * walkSpeed) * maxAngle;
        group.userData.armR.rotation.x = -Math.sin(time * walkSpeed) * maxAngle;
        group.userData.legL.rotation.x = -Math.sin(time * walkSpeed) * maxAngle;
        group.userData.head.rotation.y = Math.sin(time * walkSpeed * 0.5) * 0.1;
    } else {
        group.userData.armL.rotation.x = Math.sin(time * 2) * 0.1;
        group.userData.armR.rotation.x = -Math.sin(time * 2) * 0.1;
        group.userData.legL.rotation.x = 0;
        group.userData.legR.rotation.x = 0;
        group.userData.head.rotation.y = 0;
    }
}
