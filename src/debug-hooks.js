import { getObjectSnapshot } from "./three-utils.js";

export function installDebugHooks({
  state,
  THREE,
  getCurrentStage,
  placeFormation,
  reset,
  updateFormationPlacement
}) {
  if (!new URLSearchParams(window.location.search).has("debug")) {
    return;
  }

  window.__arFormationDebug = {
    getState() {
      return {
        modelsLoaded: state.modelsLoaded,
        modelLoadError: state.modelLoadError,
        formationPlaced: state.formationPlaced,
        currentStage: getCurrentStage()
      };
    },
    placeAtOrigin() {
      if (!state.modelsLoaded) {
        return false;
      }
      if (state.formationPlaced) {
        reset();
      }
      placeFormation(new THREE.Vector3(0, 0, 0));
      updateFormationPlacement();
      return true;
    },
    getAlignmentSnapshot() {
      return getObjectSnapshot(state.formationRoot);
    }
  };
}
