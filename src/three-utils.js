import * as THREE from "three";

export function cloneModelForScene(source) {
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    if (child.geometry) {
      child.geometry = child.geometry.clone();
    }

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
    } else if (child.material) {
      child.material = child.material.clone();
    }
  });

  return clone;
}

export function getImportedObjectByName(root, name) {
  return root.getObjectByName(name) || root.getObjectByName(name.replaceAll(" ", "_"));
}

export function applyModelShadowSettings(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if ("envMapIntensity" in material) {
            material.envMapIntensity = 0.25;
          }
        });
      }
    }
  });
}

export function getSelfMeshes(object) {
  return object && object.isMesh ? [object] : [];
}

export function getDescendantMeshes(object) {
  const meshes = [];
  if (!object) {
    return meshes;
  }

  object.traverse((child) => {
    if (child.isMesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

export function getDirectChildMeshesExcept(object, excludedObjects) {
  const meshes = [];
  if (!object) {
    return meshes;
  }

  const excluded = new Set(excludedObjects.filter(Boolean));
  object.children.forEach((child) => {
    if (excluded.has(child)) {
      return;
    }

    child.traverse((descendant) => {
      if (descendant.isMesh) {
        meshes.push(descendant);
      }
    });
  });
  return meshes;
}

export function setMeshesOpacity(meshes, opacity) {
  meshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) {
        return;
      }

      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
      material.needsUpdate = true;
    });
  });
}

export function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

export function removeAndDisposeMeshes(meshes, retainedMeshes) {
  const retained = new Set((retainedMeshes || []).filter(Boolean));
  Array.from(new Set(meshes.filter(Boolean)))
    .sort((a, b) => getObjectDepth(b) - getObjectDepth(a))
    .forEach((mesh) => {
      if (!retained.has(mesh) && mesh.parent) {
        mesh.parent.remove(mesh);
      }
      if (mesh.geometry) {
        mesh.geometry.dispose();
        if (retained.has(mesh)) {
          mesh.geometry = null;
        }
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.filter(Boolean).forEach((material) => material.dispose());
      if (retained.has(mesh)) {
        mesh.geometry = new THREE.BufferGeometry();
        mesh.material = new THREE.MeshBasicMaterial({ visible: false });
      }
    });
}

export function getObjectDepth(object) {
  let depth = 0;
  let parent = object.parent;
  while (parent) {
    depth += 1;
    parent = parent.parent;
  }
  return depth;
}

export function getObjectSnapshot(object) {
  if (!object) {
    return null;
  }

  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const child = object.children[0] || null;

  return {
    position: vectorToPlainObject(object.position),
    scale: vectorToPlainObject(object.scale),
    childPosition: child ? vectorToPlainObject(child.position) : null,
    childScale: child ? vectorToPlainObject(child.scale) : null,
    boundsCenter: vectorToPlainObject(center),
    boundsSize: vectorToPlainObject(size),
    localXWorldDirection: vectorToPlainObject(
      new THREE.Vector3(1, 0, 0).applyQuaternion(object.quaternion).normalize()
    )
  };
}

export function vectorToPlainObject(vector) {
  return {
    x: Number(vector.x.toFixed(6)),
    y: Number(vector.y.toFixed(6)),
    z: Number(vector.z.toFixed(6))
  };
}
