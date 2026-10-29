import { Matrix4, Vector3 } from 'three';

                                                                               
                                                                               
                                                                                   
export function collectFramePoints(root) {
  root.updateWorldMatrix(true, true);
  const points = [], instance = new Matrix4(), transform = new Matrix4();
  const append = (box, matrix) => {
    if (!box || box.isEmpty()) return;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) points.push(new Vector3(x, y, z).applyMatrix4(matrix));
  };
  root.traverseVisible(node => {
    if (!node.isMesh) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    if (node.isInstancedMesh) {
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, instance);
        append(node.geometry.boundingBox, transform.multiplyMatrices(node.matrixWorld, instance));
      }
    } else append(node.geometry.boundingBox, node.matrixWorld);
  });
  return points;
}

                                                                                
                                                                                
export function centerCameraHorizontally(camera, target, points) {
  if (!points.length) return null;
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  let min = Infinity, max = -Infinity;
  for (const point of points) {
    const x = point.dot(right);
    min = Math.min(min, x); max = Math.max(max, x);
  }
  const midpoint = (min + max) / 2;
  const shift = midpoint - target.dot(right);
  camera.position.addScaledVector(right, shift);
  camera.updateMatrixWorld();
  const halfSpan = (max - min) / 2;
  return { left: -halfSpan, right: halfSpan, shift };
}
