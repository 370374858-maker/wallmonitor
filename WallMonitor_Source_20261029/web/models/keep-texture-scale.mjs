                                                                                 
                                                                          
                                                                             
   
export function createMeterUVUpdater(THREE) {
  const owned = new WeakSet();
  const anchor = new THREE.Vector3();
  const inverseRotation = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  return function updateMeterUV(root, {tileMeters = 2, upAxis = 'y'} = {}) {
    if (!(tileMeters > 0) || !Number.isFinite(tileMeters)) {
      throw new Error('tileMeters must be a positive finite meter value.');
    }
    if (upAxis !== 'y' && upAxis !== 'z') throw new Error('upAxis must be y or z.');
    root.updateWorldMatrix(true, true);
    root.getWorldPosition(anchor);
    root.getWorldQuaternion(inverseRotation).invert();
    let meshes = 0;

    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (mesh.isInstancedMesh || mesh.isSkinnedMesh) {
        throw new Error('Use ordinary static cuboid meshes for this updater.');
      }
      if (!owned.has(mesh)) {
                                                                                    
        mesh.geometry = mesh.geometry.clone();
        owned.add(mesh);
      }
      const geometry = mesh.geometry;
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      if (!position || !normal) throw new Error('Position and face normals are required.');
      let uv = geometry.getAttribute('uv');
      if (!uv || uv.count !== position.count) {
        uv = new THREE.BufferAttribute(new Float32Array(position.count * 2), 2);
        geometry.setAttribute('uv', uv);
      }
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
                                                                                  
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
          .sub(anchor).applyQuaternion(inverseRotation);
        n.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix)
          .applyQuaternion(inverseRotation).normalize();
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        let u, v;
        if (upAxis === 'y') {
          if (ay >= ax && ay >= az) { u = p.x; v = -p.z; }
          else if (ax >= az) { u = -p.z; v = p.y; }
          else { u = p.x; v = p.y; }
        } else {
          if (az >= ax && az >= ay) { u = p.x; v = p.y; }
          else if (ax >= ay) { u = p.y; v = p.z; }
          else { u = p.x; v = p.z; }
        }
                                                                        
        uv.setXY(i, u / tileMeters, 1 - v / tileMeters);
      }
      uv.needsUpdate = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        for (const key of ['map', 'roughnessMap', 'metalnessMap']) {
          const texture = material?.[key];
          if (texture && (texture.wrapS !== THREE.RepeatWrapping || texture.wrapT !== THREE.RepeatWrapping)) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.needsUpdate = true;
          }
        }
      }
      meshes++;
    });
    return meshes;
  };
}
