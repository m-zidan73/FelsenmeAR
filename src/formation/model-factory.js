import {
  applyModelShadowSettings,
  cloneModelForScene,
  getDescendantMeshes,
  getImportedObjectByName
} from "../three-utils.js";

const STARTING_ROCK_OUTLINE_THICKNESS = 0.035;
const STARTING_ROCK_OUTLINE_HUE = 0x39ff14;
const STARTING_ROCK_OUTLINE_BRIGHTNESS = 1.6;
const STARTING_ROCK_OUTLINE_OPACITY = 0.85;
const STARTING_ROCK_OUTLINE_RIM_WIDTH = 0.18;
const STARTING_ROCK_OUTLINE_RIM_SOFTNESS = 0.12;
const STARTING_ROCK_OUTLINE_RENDER_ORDER = 10000;

const REQUIRED_NODE_NAMES = [
  "Starting_Rock",
  "Surrounding_Rocks",
  "Slope",
  "Earth_Crust_Right",
  "Earth_Crust_Left",
  "3rd Stage Rock",
  "2nd Stage Rock",
  "1st Stage Rock"
];

const LABEL_MATERIALS = {
  "1st Stage Rock": "Rock Composition: Mantle + Crustal Melts\nDepth: ~12 km below surface",
  "2nd Stage Rock": "Rock Composition: Quartz Diorite\nDepth: ~10–15 km",
  "3rd Stage Rock": "Rock Composition: Quartz Diorite\nDepth: ~10 km",
  "__rock_comp": "Rock Composition: Granodiorite\nSurface Level"
};
const LABEL_ROCK_COMP_KEY = "__rock_comp";

const LABEL_VISIBILITY = {
  5: [LABEL_ROCK_COMP_KEY],
  4: [LABEL_ROCK_COMP_KEY],
  3: ["3rd Stage Rock"],
  2: ["2nd Stage Rock"],
  1: ["1st Stage Rock"]
};

export function setLabelVisibilityByStage(labels, stage) {
  const visibleKeys = LABEL_VISIBILITY[stage] || [];
  for (const key in labels) {
    if (!Object.prototype.hasOwnProperty.call(labels, key)) continue;
    labels[key].visible = visibleKeys.indexOf(key) !== -1;
  }
}

export function createGelifluctionModelFactory({ THREE }) {
  function validateGelifluctionAsset(gltf) {
    const missingNodes = REQUIRED_NODE_NAMES.filter((name) => !getImportedObjectByName(gltf.scene, name));
    if (missingNodes.length) {
      throw new Error("Gelifluction model is missing nodes: " + missingNodes.join(", "));
    }


    const subductionClip = gltf.animations.find((clip) => clip.name === "Subduction_Animation");
    if (!subductionClip) {
      throw new Error("Gelifluction model is missing Subduction_Animation");
    }

    const stageFourClips = gltf.animations.filter((clip) => (
      clip.name !== "Subduction_Animation"
      && !clip.tracks.some((track) => track.name.startsWith("Starting_Rock"))
    ));
    if (stageFourClips.length !== 23) {
      throw new Error("Expected 23 Stage 4 animation clips, found " + stageFourClips.length);
    }

    return { stageFourClips, subductionClip };
  }

  function createGelifluctionInstance(gltf) {
    const { stageFourClips, subductionClip } = validateGelifluctionAsset(gltf);
    const root = new THREE.Group();
    root.name = "Gelifluction Root";

    const model = cloneModelForScene(gltf.scene);
    model.name = "Gelifluction";
    root.add(model);

    model.scale.setScalar(0.5);

    const nodes = Object.fromEntries(
      REQUIRED_NODE_NAMES.map((name) => [name, getImportedObjectByName(root, name)])
    );
    const startingRockBounds = new THREE.Box3().setFromObject(nodes.Starting_Rock);
    const startingRockCenter = startingRockBounds.getCenter(new THREE.Vector3());
    model.position.set(-startingRockCenter.x, -startingRockBounds.min.y, -startingRockCenter.z);
    root.updateMatrixWorld(true);
    applyModelShadowSettings(root);
    addStartingRockOutline(nodes.Starting_Rock);
    const labels = addFormationLabels(root, nodes);

    return {
      root,
      model,
      nodes,
      labels,
      stageFourClips,
      subductionClip
    };
  }

  function addStartingRockOutline(startingRock) {
    const outlineScale = 1 + STARTING_ROCK_OUTLINE_THICKNESS;

    getDescendantMeshes(startingRock).forEach((mesh) => {
      const outline = new THREE.Mesh(mesh.geometry.clone(), createStartingRockOutlineMaterial());
      outline.name = mesh.name + " Silhouette";
      outline.scale.setScalar(outlineScale);
      outline.castShadow = false;
      outline.receiveShadow = false;
      outline.renderOrder = STARTING_ROCK_OUTLINE_RENDER_ORDER;
      mesh.add(outline);
    });
  }

  function createStartingRockOutlineMaterial() {
    const outlineColor = new THREE.Color(STARTING_ROCK_OUTLINE_HUE)
      .multiplyScalar(STARTING_ROCK_OUTLINE_BRIGHTNESS);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        outlineColor: { value: outlineColor },
        outlineOpacity: { value: STARTING_ROCK_OUTLINE_OPACITY },
        rimWidth: { value: STARTING_ROCK_OUTLINE_RIM_WIDTH },
        rimSoftness: { value: STARTING_ROCK_OUTLINE_RIM_SOFTNESS }
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 outlineColor;
        uniform float outlineOpacity;
        uniform float rimWidth;
        uniform float rimSoftness;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float facing = abs(dot(normalize(vWorldNormal), viewDirection));
          float rim = 1.0 - smoothstep(rimWidth, rimWidth + rimSoftness, facing);
          if (rim <= 0.01) discard;
          gl_FragColor = vec4(outlineColor, rim * outlineOpacity);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    });
    material.userData.opacityScale = STARTING_ROCK_OUTLINE_OPACITY;
    return material;
  }

  function addFormationLabels(root, nodes) {
    const offsetY = 0.12;
    const labelHeight = 0.1;
    const labels = {};

    for (const name in LABEL_MATERIALS) {
      if (!Object.prototype.hasOwnProperty.call(LABEL_MATERIALS, name)) continue;
      if (name === LABEL_ROCK_COMP_KEY) {
        const startNode = nodes.Starting_Rock;
        const surroundNode = nodes.Surrounding_Rocks;
        let pos;
        if (startNode && surroundNode) {
          const b1 = new THREE.Box3().setFromObject(startNode);
          const b2 = new THREE.Box3().setFromObject(surroundNode);
          const union = b1.union(b2);
          const center = union.getCenter(new THREE.Vector3());
          const size = union.getSize(new THREE.Vector3());
          pos = new THREE.Vector3(center.x, center.y + size.y * 0.5 + offsetY, center.z);
        } else {
          const fallback = startNode || surroundNode;
          if (!fallback) continue;
          const bounds = new THREE.Box3().setFromObject(fallback);
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          pos = new THREE.Vector3(center.x, center.y + size.y * 0.5 + offsetY, center.z);
        }
        const sprite = makeLabel(LABEL_MATERIALS[name], pos, labelHeight);
        root.add(sprite);
        sprite.visible = false;
        labels[name] = sprite;
        continue;
      }
      const target = nodes[name];
      if (!target) continue;
      const bounds = new THREE.Box3().setFromObject(target);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const pos = new THREE.Vector3(center.x, center.y + size.y * 0.5 + offsetY, center.z);
      const sprite = makeLabel(LABEL_MATERIALS[name], pos, labelHeight);
      root.add(sprite);
      sprite.visible = false;
      labels[name] = sprite;
    }

    return labels;
  }

  function makeLabel(text, worldPos, height) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontSize = 64;
    const lineHeight = fontSize * 1.3;
    const lines = text.split("\n");
    ctx.font = "bold " + fontSize + "px system-ui, sans-serif";
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
    const padding = 20;
    canvas.width = maxWidth + padding * 2;
    canvas.height = lines.length * lineHeight + padding * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(8, 10, 12, 0.85)";
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 14);
    ctx.fill();

    ctx.strokeStyle = "rgba(246, 239, 230, 0.2)";
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, canvas.width - 2, canvas.height - 2, 14);
    ctx.stroke();

    ctx.fillStyle = "#f6efe6";
    ctx.font = "bold " + fontSize + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, padding + lineHeight * (i + 0.5));
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 999;
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(height * aspect, height, 1);
    sprite.position.copy(worldPos);
    sprite.name = "Label: " + text;
    return sprite;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return { createGelifluctionInstance, validateGelifluctionAsset };
}
