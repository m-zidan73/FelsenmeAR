import * as THREE from "three";
import { EventBus } from "./event-bus.js";

export function createTapRaycaster({ getCamera, shouldBlockTarget }) {
  const targets = new Map();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function addTarget(name, objs) {
    targets.set(name, objs);
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
      return { target: hit.target, meshName: hit.meshName };
    }
    return null;
  }

  function handleTouchEnd() {
  }

  function doRaycast(screenX, screenY, width, height) {
    const camera = getCamera();
    if (!camera) return null;

    ndc.x = (screenX / width) * 2 - 1;
    ndc.y = -(screenY / height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    let bestHit = null;

    for (const [name, objs] of targets) {
      if (shouldBlockTarget && shouldBlockTarget(name)) continue;
      const visible = objs.filter(o => o.visible);
      if (visible.length === 0) continue;
      const hits = raycaster.intersectObjects(visible, false);
      if (hits.length > 0) {
        const pz = hits[0].point.clone().project(camera).z;
        if (!bestHit || pz < bestHit.z) {
          bestHit = { target: name, meshName: hits[0].object.name, point: hits[0].point, z: pz };
        }
      }
    }

    return bestHit ? { target: bestHit.target, meshName: bestHit.meshName, point: bestHit.point } : null;
  }

  return { addTarget, removeTarget, handleTap, handleTouchStart, handleTouchEnd };
}
