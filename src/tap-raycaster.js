import * as THREE from "three";
import { EventBus } from "./event-bus.js";

export function createTapRaycaster({ getCamera }) {
  const targets = new Map();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function addTarget(name, meshes) {
    targets.set(name, meshes);
  }

  function removeTarget(name) {
    targets.delete(name);
  }

  function handleTap(screenX, screenY, width, height) {
    const hit = doRaycast(screenX, screenY, width, height);
    if (hit) {
      EventBus.raise("raycast_hit", {
        target: hit.target,
        meshName: hit.meshName,
        point: hit.point.clone()
      });
    }
  }

  function handleTouchStart(screenX, screenY, width, height) {
    const hit = doRaycast(screenX, screenY, width, height);
    if (hit) {
      EventBus.raise("grab_start", {
        target: hit.target,
        meshName: hit.meshName,
        point: hit.point.clone()
      });
      return { meshName: hit.meshName };
    }
    return null;
  }

  function handleTouchEnd() {
    // grab_end is emitted by app_Revised with specific meshName
  }

  function doRaycast(screenX, screenY, width, height) {
    const camera = getCamera();
    if (!camera) return null;

    ndc.x = (screenX / width) * 2 - 1;
    ndc.y = -(screenY / height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    for (const [name, meshes] of targets) {
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        return {
          target: name,
          meshName: hits[0].object.name,
          point: hits[0].point
        };
      }
    }
    return null;
  }

  return { addTarget, removeTarget, handleTap, handleTouchStart, handleTouchEnd };
}
