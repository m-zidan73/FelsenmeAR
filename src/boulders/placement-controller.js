export function createPlacementController({
  state,
  createBoulderInstance,
  createShadowReceiver,
  disposeObject,
  getModelScale,
  positionSunLightAt,
  prepareFormationPlacement,
  refreshReadyState,
  releasePlacementAnchor,
  resetFormationSlider,
  resetFormationState,
  setFormationSliderVisible,
  setMenuButtonVisible,
  setScanPromptVisible,
  setStartFromHereReady,
  setStartFromHereVisible,
  setXRDebug,
  updateHud
}) {
  function placeBoulders(center, anchor) {
    state.placementCenter.copy(center);
    state.planeHeight = center.y;
    state.xrPlacementAnchor = anchor || null;
    state.xrPlacementAnchorSpace = anchor ? anchor.anchorSpace : null;

    const modelScale = getModelScale(state.modelAssets.boulders.scene);
    const boulders = createBoulderInstance(state.modelAssets.boulders, modelScale);
    state.bouldersRoot = boulders.root;
    state.floatingObject = boulders.floatingObject;
    state.dustObject = boulders.dustObject;
    state.stageRockObjects = boulders.stageRockObjects;

    state.scene.add(state.bouldersRoot);
    createShadowReceiver(center, state.latestHit ? state.latestHit.quaternion : null);

    state.placementReticle.visible = false;
    setScanPromptVisible(false);
    setStartFromHereVisible(false);
    resetFormationSlider();
    setFormationSliderVisible(true);
    positionSunLightAt(center);

    updateBoulderPlacement();
    state.bouldersRoot.updateMatrixWorld(true);
    prepareFormationPlacement();
    updateHud(state.floatingObject
      ? "Boulders placed. Object_3 will rise in 5 seconds."
      : "Boulders placed, but Object_3 was not found in the model.");
    setXRDebug(anchor ? "anchored placement" : "raw world-space placement");
  }

  function updateBoulderPlacement() {
    if (!state.bouldersRoot) {
      return;
    }

    state.bouldersRoot.position.copy(state.placementCenter);
    state.bouldersRoot.position.y = state.planeHeight;
  }

  function returnToMainMenu() {
    reset();
    if (state.xrSession && typeof state.xrSession.end === "function") {
      state.xrSession.end();
    } else {
      document.body.classList.remove("in-camera-ar");
      setMenuButtonVisible(false);
      setFormationSliderVisible(false);
      setScanPromptVisible(false);
      setStartFromHereVisible(false);
      refreshReadyState();
    }
  }

  function reset() {
    releasePlacementAnchor();

    if (state.bouldersRoot) {
      state.scene.remove(state.bouldersRoot);
      disposeObject(state.bouldersRoot);
    }
    if (state.shadowReceiver) {
      state.scene.remove(state.shadowReceiver);
      disposeObject(state.shadowReceiver);
    }

    resetFormationState();
    state.shadowReceiver = null;
    state.placementCenter.set(0, 0, 0);
    state.planeHeight = 0;
    state.bouldersPlaced = false;
    state.animationStarted = false;
    state.animationComplete = false;
    setScanPromptVisible(false);
    setStartFromHereVisible(false);
    setStartFromHereReady(false);
    setFormationSliderVisible(false);
    resetFormationSlider();
    updateHud("Move the iPad to detect a plane, then press Start From Here.");
  }

  return {
    placeBoulders,
    reset,
    returnToMainMenu,
    updateBoulderPlacement
  };
}
