import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createFormationModelLoader({
  config,
  state,
  ui,
  THREE,
  setMenuLoading,
  refreshReadyState,
  setPlacementReticleModel,
  setXRDebug,
  validateGelifluctionAsset
}) {
  async function loadModels() {
    const loader = new GLTFLoader();
    const assetUrl = (path, version) => "Assets/" + path + "?v=" + encodeURIComponent(version);

    try {
      setMenuLoading(18, "Loading", "Downloading assets.");
      const [gelifluction, reticleRock] = await Promise.all([
        loader.loadAsync(
          assetUrl("Models/Gelifluction.glb", config.modelAssetVersions.gelifluction),
          (event) => {
            if (!event.lengthComputable || !event.total) {
              setMenuLoading(42, "Loading", "Downloading assets.");
              return;
            }

            state.assetProgress = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
            setMenuLoading(18 + state.assetProgress * 62, "Loading", "Downloading assets.");
          }
        ),
        loader.loadAsync(
          assetUrl("Models/PolyCam%20Rock%20Sample.glb", config.modelAssetVersions.reticle)
        )
      ]);

      validateGelifluctionAsset(gelifluction);
      state.modelAssets = { gelifluction };
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

  return { loadModels };
}
