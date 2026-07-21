import * as THREE from "three";

const DEFAULT_TEXTURE_URLS = {
  left: "Assets/Swipe%20Right%20White.png",
  right: "Assets/Swipe%20Left%20White.png",
};

const CYCLE_SECONDS = 1.6;

export function createWorldPinchPrompt({
  parent,
  bounds,
  textureLoader = new THREE.TextureLoader(),
  textureUrls = DEFAULT_TEXTURE_URLS,
}) {
  if (!parent || !bounds || bounds.isEmpty()) {
    throw new Error("World pinch prompt requires a parent and non-empty bounds");
  }

  const group = new THREE.Group();
  group.name = "Tectonic World Pinch Prompt";
  group.visible = false;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 0.001);
  const iconSize = span * 0.11;
  const startSeparation = span * 0.34;
  const travel = span * 0.18;
  const frontOffset = span * 0.34;
  const basePosition = new THREE.Vector3(center.x, center.y + size.y * 0.08, center.z);

  const left = createPromptSprite(textureLoader, textureUrls.left, "Tectonic Pinch Left");
  const right = createPromptSprite(textureLoader, textureUrls.right, "Tectonic Pinch Right");
  left.baseScale = iconSize;
  right.baseScale = iconSize;
  group.add(left, right);

  parent.add(group);

  const cameraWorldPosition = new THREE.Vector3();
  const cameraWorldQuaternion = new THREE.Quaternion();
  const promptWorldPosition = new THREE.Vector3();
  const cameraLocalPosition = new THREE.Vector3();
  const forwardLocal = new THREE.Vector3();
  const parentWorldQuaternionInverse = new THREE.Quaternion();
  const cameraRightLocal = new THREE.Vector3();
  const cameraUpLocal = new THREE.Vector3();
  const cameraBackLocal = new THREE.Vector3();
  const cameraBasis = new THREE.Matrix4();
  let elapsedSeconds = 0;
  let disposed = false;

  function setVisible(visible) {
    if (disposed) return;
    group.visible = Boolean(visible);
    if (!group.visible) {
      elapsedSeconds = 0;
      positionGroup(null);
      positionSprites(0);
    }
  }

  function update(deltaSeconds, camera = null) {
    if (disposed || !group.visible) return;

    const delta = Number.isFinite(deltaSeconds) ? Math.max(deltaSeconds, 0) : 0;
    elapsedSeconds = (elapsedSeconds + delta) % CYCLE_SECONDS;
    const cycle = elapsedSeconds / CYCLE_SECONDS;
    const inwardAmount = easeOutCubic(cycle);
    positionGroup(camera);
    positionSprites(inwardAmount, cycle);
  }

  function positionGroup(camera) {
    group.position.copy(basePosition);
    alignGroupToCamera(camera);

    if (camera && typeof camera.getWorldPosition === "function") {
      parent.localToWorld(promptWorldPosition.copy(basePosition));
      camera.getWorldPosition(cameraWorldPosition);
      cameraLocalPosition.copy(cameraWorldPosition);
      parent.worldToLocal(cameraLocalPosition);
      forwardLocal.subVectors(cameraLocalPosition, basePosition);
      forwardLocal.y = 0;
      if (forwardLocal.lengthSq() > 0.000001) {
        group.position.add(forwardLocal.normalize().multiplyScalar(frontOffset));
        return;
      }
    }

    group.position.z = bounds.min.z - frontOffset;
  }

  function alignGroupToCamera(camera) {
    group.quaternion.identity();
    if (!camera || typeof camera.getWorldQuaternion !== "function") return;

    camera.getWorldQuaternion(cameraWorldQuaternion);
    parent.getWorldQuaternion(parentWorldQuaternionInverse).invert();

    cameraRightLocal
      .set(1, 0, 0)
      .applyQuaternion(cameraWorldQuaternion)
      .applyQuaternion(parentWorldQuaternionInverse)
      .normalize();
    cameraUpLocal
      .set(0, 1, 0)
      .applyQuaternion(cameraWorldQuaternion)
      .applyQuaternion(parentWorldQuaternionInverse)
      .normalize();
    cameraBackLocal.crossVectors(cameraRightLocal, cameraUpLocal).normalize();
    cameraUpLocal.crossVectors(cameraBackLocal, cameraRightLocal).normalize();
    cameraBasis.makeBasis(cameraRightLocal, cameraUpLocal, cameraBackLocal);
    group.quaternion.setFromRotationMatrix(cameraBasis);
  }

  function positionSprites(inwardAmount, cycle = 0) {
    const offset = travel * inwardAmount;
    const scale = iconSize * (1 - inwardAmount * 0.15);
    const opacity = getCycleOpacity(cycle);

    left.position.set(-startSeparation + offset, 0, 0);
    right.position.set(startSeparation - offset, 0, 0);
    left.scale.set(scale, scale, 1);
    right.scale.set(scale, scale, 1);
    left.material.opacity = opacity;
    right.material.opacity = opacity;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    parent.remove(group);
    [left, right].forEach((sprite) => {
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    });
    group.clear();
  }

  positionGroup(null);
  positionSprites(0);

  return {
    dispose,
    group,
    setVisible,
    update,
  };
}

function createPromptSprite(textureLoader, textureUrl, name) {
  const texture = textureLoader.load(textureUrl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    opacity: 0,
    transparent: true,
    toneMapped: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = name;
  sprite.center.set(0.5, 0.5);
  sprite.frustumCulled = false;
  sprite.renderOrder = 1000;
  return sprite;
}

function easeOutCubic(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

function smoothstep(edge0, edge1, value) {
  const clamped = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function getCycleOpacity(progress) {
  const fadeIn = smoothstep(0, 0.18, progress);
  const fadeOut = 1 - smoothstep(0.68, 1, progress);
  return Math.min(fadeIn, fadeOut) * 0.92;
}
