import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createBoulderModelLoader({ state, ui, THREE, setMenuLoading, refreshReadyState, setXRDebug }) {
  async function loadBoulderModel() {
    const loader = new GLTFLoader();
    const assetVersion = Date.now();
    const assetUrl = (fileName) => "Assets/" + fileName + "?v=" + assetVersion;

    try {
      setMenuLoading(18, "Loading", "Downloading assets.");
      const boulders = await loader.loadAsync(
        assetUrl("Boulders%20on%20Ground.glb"),
        (event) => {
          if (!event.lengthComputable || !event.total) {
            setMenuLoading(42, "Loading", "Downloading assets.");
            return;
          }

          state.assetProgress = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
          setMenuLoading(18 + state.assetProgress * 62, "Loading", "Downloading assets.");
        }
      );

      state.modelAssets = {
        boulders
      };
      state.modelsLoaded = true;
      ui.startArButton.disabled = false;
      refreshReadyState();
    } catch (error) {
      state.modelLoadError = true;
      ui.startArButton.disabled = true;
      setXRDebug("model load failed");
      setMenuLoading(100, "Error", "Could not load the boulder model. Check the Assets folder and refresh.");
      window.__runtimeErrors.push("Boulder model load failed: " + error.message);
    }
  }

  return {
    loadBoulderModel
  };
}
