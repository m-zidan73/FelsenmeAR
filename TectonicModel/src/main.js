import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { FelsenmeARModel } from "./FelsenmeARModel.js";
import { buildUI } from "./ui.js";
import { createWaveCurve } from "./wavePath.js";

// ── Scene ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);

// ── Camera ──
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5, 4, 6);

// ── Renderer ──
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// ── Controls ──
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// ── Lights ──
scene.add(new THREE.AmbientLight(0x404060, 0.5));
const dir = new THREE.DirectionalLight(0xffffff, 1.5);
dir.position.set(5, 10, 7);
scene.add(dir);
const fill = new THREE.DirectionalLight(0x8888ff, 0.5);
fill.position.set(-5, 0, 5);
scene.add(fill);

// ── Model ──
const model = new FelsenmeARModel(scene);
buildUI(model);

// ── Helpers ──
const pts = createWaveCurve().getPoints(50);
scene.add(new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(pts),
  new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.5 }),
));
const grid = new THREE.GridHelper(10, 10, 0x444466, 0x333355);
grid.position.y = -0.5;
scene.add(grid);

// ── Animation Loop ──
renderer.setAnimationLoop(() => {
  model.update();
  controls.update();
  renderer.render(scene, camera);
});

// ── Resize ──
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
