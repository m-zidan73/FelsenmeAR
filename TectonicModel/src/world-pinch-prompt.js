import * as THREE from "three";

const DEFAULT_TEXTURE_URLS = {
  left: "Assets/Swipe%20Right%20White.png",
  right: "Assets/Swipe%20Left%20White.png",
};

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
  const iconSize = span * 0.22;
  const separation = span * 0.22;
  const travel = span * 0.12;

  const left = createPromptSprite(textureLoader, textureUrls.left, "Tectonic Pinch Left");
  const right = createPromptSprite(textureLoader, textureUrls.right, "Tectonic Pinch Right");
  left.scale.set(iconSize, iconSize, 1);
  right.scale.set(iconSize, iconSize, 1);
  group.add(left, right);

  group.position.set(
    center.x,
    bounds.max.y + iconSize * 0.65,
    bounds.min.z - span * 0.08
  );
  parent.add(group);

  let elapsedSeconds = 0;
  let disposed = false;

  function setVisible(visible) {
    if (disposed) return;
    group.visible = Boolean(visible);
    if (!group.visible) {
      elapsedSeconds = 0;
      positionSprites(0);
    }
  }

  function update(deltaSeconds) {
    if (disposed || !group.visible) return;

    const delta = Number.isFinite(deltaSeconds) ? Math.max(deltaSeconds, 0) : 0;
    elapsedSeconds = (elapsedSeconds + delta) % 1.6;
    const cycle = elapsedSeconds / 1.6;
    const inwardAmount = 0.5 - Math.cos(cycle * Math.PI * 2) * 0.5;
    positionSprites(inwardAmount);
  }

  function positionSprites(inwardAmount) {
    const offset = travel * inwardAmount;
    left.position.x = -separation + offset;
    right.position.x = separation - offset;
    const opacity = 1 - inwardAmount * 0.7;
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
