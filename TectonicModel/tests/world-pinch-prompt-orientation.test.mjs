import assert from "node:assert/strict";
import * as THREE from "three";
import { createWorldPinchPrompt } from "../src/world-pinch-prompt.js";

const parent = new THREE.Group();
parent.rotation.set(0.2, Math.PI * 0.85, -0.1);
parent.scale.setScalar(0.7);
parent.updateMatrixWorld(true);

const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 30);
camera.position.set(0.5, 1.8, 4);
camera.rotation.set(-0.18, 0.32, 0, "YXZ");
camera.updateMatrixWorld(true);

const bounds = new THREE.Box3(
  new THREE.Vector3(-1, 0, -0.8),
  new THREE.Vector3(1, 1.2, 0.8)
);
const textureLoader = {
  load() {
    return new THREE.Texture();
  }
};
const prompt = createWorldPinchPrompt({ parent, bounds, textureLoader });
prompt.setVisible(true);

function assertPairMatchesCameraHorizontal(message) {
  prompt.update(0.016, camera);
  parent.updateMatrixWorld(true);

  const left = prompt.group.getObjectByName("Tectonic Pinch Left");
  const right = prompt.group.getObjectByName("Tectonic Pinch Right");
  const leftWorld = left.getWorldPosition(new THREE.Vector3());
  const rightWorld = right.getWorldPosition(new THREE.Vector3());
  const pairDirection = rightWorld.sub(leftWorld).normalize();
  const cameraQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion).normalize();
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion).normalize();

  assert.ok(pairDirection.dot(cameraRight) > 0.999, message + " should follow camera right");
  assert.ok(Math.abs(pairDirection.dot(cameraUp)) < 0.001, message + " should remain perpendicular to camera up");
}

assertPairMatchesCameraHorizontal("portrait camera");
camera.rotation.set(-0.18, 0.32, Math.PI / 2, "YXZ");
camera.updateMatrixWorld(true);
assertPairMatchesCameraHorizontal("landscape camera");

prompt.dispose();
console.log("world pinch prompt orientation checks passed");