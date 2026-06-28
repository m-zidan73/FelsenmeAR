import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createBoulderModelLoader({ state, ui, THREE, setMenuLoading, refreshReadyState, setPlacementReticleModel, setXRDebug }) {
  async function loadBoulderModel() {
    const loader = new GLTFLoader();
    const assetVersion = Date.now();
    const assetUrl = (fileName) => "Assets/" + fileName + "?v=" + assetVersion;

    try {
      setMenuLoading(18, "Loading", "Downloading assets.");
      const [boulders, reticleRock] = await Promise.all([
        loader.loadAsync(
          assetUrl("Boulders%20on%20Ground.glb"),
          (event) => {
            if (!event.lengthComputable || !event.total) {
              setMenuLoading(42, "Loading", "Downloading assets.");
              return;
            }

            state.assetProgress = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
            setMenuLoading(18 + state.assetProgress * 62, "Loading", "Downloading assets.");
          }
        ),
        loader.loadAsync(assetUrl("Models/PolyCam%20Rock%20Sample.glb"))
      ]);

      state.modelAssets = {
        boulders
      };
      setPlacementReticleModel(reticleRock.scene);
      state.modelsLoaded = true;
      ui.startArButton.disabled = false;
      refreshReadyState();
    } catch (error) {
      state.modelLoadError = true;
      ui.startArButton.disabled = true;
      setXRDebug("model load failed");
      setMenuLoading(100, "Error", "Could not load the 3D models. Check the Assets folder and refresh.");
      window.__runtimeErrors.push("3D model load failed: " + error.message);
    }
  }

  return {
    loadBoulderModel
  };
}
