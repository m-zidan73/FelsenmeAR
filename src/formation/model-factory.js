import {
  applyModelShadowSettings,
  cloneModelForScene,
  getDescendantMeshes,
  getImportedObjectByName
} from "../three-utils.js";

const STARTING_ROCK_OUTLINE_SCALE = 1.025;
const STARTING_ROCK_OUTLINE_OPACITY = 0.3;

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
      clip.name !== "Starting_RockAction" && clip.name !== "Subduction_Animation"
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

    model.scale.setScalar(1);

    const nodes = Object.fromEntries(
      REQUIRED_NODE_NAMES.map((name) => [name, getImportedObjectByName(root, name)])
    );
    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    const startingRockBounds = new THREE.Box3().setFromObject(nodes.Starting_Rock);
    model.position.set(-center.x, -startingRockBounds.min.y, -center.z);
    root.updateMatrixWorld(true);
    applyModelShadowSettings(root);
    addStartingRockOutline(nodes.Starting_Rock);

    return {
      root,
      model,
      nodes,
      stageFourClips,
      subductionClip
    };
  }

  function addStartingRockOutline(startingRock) {
    getDescendantMeshes(startingRock).forEach((mesh) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xa8efff,
        blending: THREE.AdditiveBlending,
        opacity: STARTING_ROCK_OUTLINE_OPACITY,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        toneMapped: false
      });
      material.userData.opacityScale = STARTING_ROCK_OUTLINE_OPACITY;

      const outline = new THREE.Mesh(mesh.geometry.clone(), material);
      outline.name = mesh.name + " Outline";
      outline.scale.setScalar(STARTING_ROCK_OUTLINE_SCALE);
      outline.castShadow = false;
      outline.receiveShadow = false;
      outline.renderOrder = 1;
      mesh.add(outline);
    });
  }

  return { createGelifluctionInstance, validateGelifluctionAsset };
}
