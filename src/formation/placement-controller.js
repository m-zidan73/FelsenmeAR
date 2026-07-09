export function createPlacementController({
  state,
  THREE,
  createGelifluctionInstance,
  createShadowReceiver,
  disposeObject,
  positionSunLightAt,
  prepareFormationPlacement,
  refreshReadyState,
  releasePlacementAnchor,
  resetFormationSlider,
  resetFormationState,
  resetInput,
  setFormationSliderVisible,
  setMenuButtonVisible,
  setScanPromptVisible,
  setXRDebug,
  updateHud
}) {
  function placeFormation(center, anchor) {
    state.placementCenter.copy(center);
    state.planeHeight = center.y;
    state.xrPlacementAnchor = anchor || null;
    state.xrPlacementAnchorSpace = anchor ? anchor.anchorSpace : null;

    const formation = createGelifluctionInstance(state.modelAssets.gelifluction);
    state.formationRoot = formation.root;
    state.formationLabels = formation.labels;
    orientFormationToCameraHeading();
    state.formationPlaced = true;
    state.scene.add(state.formationRoot);
    createShadowReceiver(center, state.latestHit ? state.latestHit.quaternion : null);

    state.placementReticle.visible = false;
    setScanPromptVisible(false);
    resetFormationSlider();
    setFormationSliderVisible(true);
    positionSunLightAt(center);

    updateFormationPlacement();
    state.formationRoot.updateMatrixWorld(true);
    prepareFormationPlacement(formation);
    setXRDebug(anchor ? "anchored placement" : "raw world-space placement");
  }

  function updateFormationPlacement() {
    if (!state.formationRoot) {
      return;
    }

    state.formationRoot.position.copy(state.placementCenter);
    state.formationRoot.position.y = state.planeHeight;
  }

  function orientFormationToCameraHeading() {
    const cameraDirection = new THREE.Vector3();
    state.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    if (cameraDirection.lengthSq() <= 0.000001) {
      return;
    }

    cameraDirection.normalize();
    state.formationRoot.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      cameraDirection
    );
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
      refreshReadyState();
    }
  }

  function reset() {
    releasePlacementAnchor();
    resetInput();
    resetFormationState();

    if (state.formationRoot) {
      state.scene.remove(state.formationRoot);
      disposeObject(state.formationRoot);
    }
    if (state.shadowReceiver) {
      state.scene.remove(state.shadowReceiver);
      disposeObject(state.shadowReceiver);
    }

    state.formationRoot = null;
    state.formationLabels = null;
    state.shadowReceiver = null;
    state.placementCenter.set(0, 0, 0);
    state.planeHeight = 0;
    state.formationPlaced = false;
    setScanPromptVisible(false);
    setFormationSliderVisible(false);
    resetFormationSlider();
    updateHud("Move the iPad to detect a plane, then tap the screen to place the model.");
    var badge = document.getElementById("rockInfoBadge");
    if (badge) { badge.hidden = true; }
  }

  return {
    placeFormation,
    reset,
    returnToMainMenu,
    updateFormationPlacement
  };
}
