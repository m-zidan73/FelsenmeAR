import {
  applyModelShadowSettings,
  cloneModelForScene,
  getImportedObjectByName
} from "../three-utils.js";

export function createBoulderModelFactory({ config, THREE }) {
  function createBoulderInstance(gltf, modelScale) {
    const root = new THREE.Group();
    root.name = "Boulders Root";

    const model = cloneModelForScene(gltf.scene);
    model.name = "Boulders on Ground";
    root.add(model);
    model.scale.setScalar(modelScale);

    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.y -= bounds.min.y;
    model.position.z -= center.z;
    root.updateMatrixWorld(true);

    applyModelShadowSettings(root);
    const dustObject = getImportedObjectByName(root, "Dust and Grus");
    const stageRockObjects = {
      1: getImportedObjectByName(root, "1st Stage Rock"),
      2: getImportedObjectByName(root, "2nd Stage Rock"),
      3: getImportedObjectByName(root, "3rd Stage Rock")
    };
    return {
      root,
      floatingObject: root.getObjectByName("Object_3"),
      dustObject,
      stageRockObjects
    };
  }

  function getModelScale(referenceScene) {
    const bounds = new THREE.Box3().setFromObject(referenceScene);
    const size = bounds.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z, 0.001);

    return config.modelFootprintMeters / footprint;
  }

  return {
    createBoulderInstance,
    getModelScale
  };
}
