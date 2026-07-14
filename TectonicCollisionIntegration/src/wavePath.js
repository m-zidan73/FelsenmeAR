import * as THREE from "three";

// Blender Z-up → Three.js Y-up: X'=X, Y'=Z, Z'=-Y
export const WAVE_POINTS = [
  [-0.004,  1.689,  0.180],
  [-0.003,  1.590, -0.181],
  [-0.004,  1.445, -0.519],
  [ 0.002,  1.234, -0.778],
  [-0.004,  0.949, -1.002],
  [-0.047,  0.635, -1.190],
  [-0.119,  0.293, -1.281],
  [-0.207, -0.054, -1.292],
];

export function createWaveCurve() {
  const pts = WAVE_POINTS.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  return new THREE.CatmullRomCurve3(pts);
}
