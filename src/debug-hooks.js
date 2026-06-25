import { getObjectSnapshot } from "./three-utils.js";

export function installDebugHooks({
  state,
  THREE,
  placeBoulders,
  reset,
  triggerFloatingObject,
  updateBoulderPlacement
}) {
  if (!new URLSearchParams(window.location.search).has("debug")) {
    return;
  }

  window.__arBoulderDebug = {
    getState() {
      return {
        modelsLoaded: state.modelsLoaded,
        modelLoadError: state.modelLoadError,
        bouldersPlaced: state.bouldersPlaced,
        animationStarted: state.animationStarted,
        animationComplete: state.animationComplete,
        floatingObjectTriggered: state.floatingObjectTriggered,
        floatingObjectY: state.floatingObject ? state.floatingObject.position.y : null,
        floatingObjectTargetWorldY: state.floatingObjectTargetWorldPosition.y
      };
    },
    placeAtOrigin() {
      if (!state.modelsLoaded) {
        return false;
      }

      if (state.bouldersPlaced) {
        reset();
      }

      placeBoulders(new THREE.Vector3(0, 0, 0));
      updateBoulderPlacement();
      return true;
    },
    triggerFloat() {
      if (!state.bouldersPlaced) {
        return false;
      }

      triggerFloatingObject();
      return true;
    },
    getAlignmentSnapshot() {
      const boulders = getObjectSnapshot(state.bouldersRoot);
      const floatingObject = getObjectSnapshot(state.floatingObject);

      return {
        boulders,
        floatingObject
      };
    }
  };
}
