import * as THREE from "three";
import { createArController } from "./ar-controller.js";
import { CONFIG } from "./config.js";
import { installDebugHooks } from "./debug-hooks.js";
import { getUiElements } from "./dom.js";
import { createFormationModelLoader } from "./formation/model-loader.js";
import { createGelifluctionModelFactory } from "./formation/model-factory.js";
import { createPlacementController } from "./formation/placement-controller.js";
import { createGelifluctionStageController } from "./formation/stage-controller.js";
import { createCanvasInteractionController } from "./interaction-controller.js";
import { createLocationController } from "./location-controller.js";
import { installRuntimeErrorCapture } from "./runtime-errors.js";
import { createSceneController } from "./scene.js";
import { createAppState } from "./state.js";
import { disposeObject } from "./three-utils.js";
import { createArHud } from "./ui/ar-hud.js";
import { createFormationSlider } from "./ui/formation-slider.js";
import { createHudUi } from "./ui/hud.js";
import { createMenuUi } from "./ui/menu.js";

(function () {
  installRuntimeErrorCapture();

  const state = createAppState();
  const ui = getUiElements();
  const hudUi = createHudUi({ ui });
  const { setXRDebug, updateHud } = hudUi;
  let formationSliderUi;
  let interactionController;
  let placementController;

  const arHud = createArHud({
    state,
    THREE,
    onMenuSelected: () => placementController && placementController.returnToMainMenu(),
    onSliderGestureStart: () => formationSliderUi && formationSliderUi.beginFormationSliderGesture(),
    onSliderPreview: (value) => formationSliderUi && formationSliderUi.previewFormationSliderValue(value),
    onSliderCommit: (value) => formationSliderUi && formationSliderUi.commitFormationSliderGesture(value)
  });

  const menuUi = createMenuUi({
    arHud,
    state,
    ui,
    clamp: THREE.MathUtils.clamp,
    updateHud
  });
  const {
    bounceScanPrompt,
    refreshReadyState,
    setFormationSliderVisible,
    setGeoStatusVisible,
    setMenuButtonVisible,
    setMenuLoading,
    setScanPromptVisible
  } = menuUi;

  const stageController = createGelifluctionStageController({
    config: CONFIG,
    THREE,
    updateHud
  });
  const {
    getCurrentStage,
    preparePlacement: prepareFormationPlacement,
    requestStage,
    reset: resetFormationState,
    setPinchActive,
    update: updateFormationAnimation
  } = stageController;

  formationSliderUi = createFormationSlider({
    ui,
    clamp: THREE.MathUtils.clamp,
    onPromptingChange: (isPrompting) => arHud.setSliderPrompting(isPrompting),
    onRender: (value, displayStep) => arHud.setSliderValue(value, displayStep),
    onStepSelected(stepIndex) {
      return requestStage(stepIndex + 1);
    }
  });
  const { initFormationSlider, resetFormationSlider } = formationSliderUi;

  const sceneController = createSceneController({
    state,
    ui,
    THREE,
    disposeObject
  });
  const { createShadowReceiver, initializeScene, onResize, setPlacementReticleModel } = sceneController;

  const modelFactory = createGelifluctionModelFactory({ THREE });
  const { createGelifluctionInstance, validateGelifluctionAsset } = modelFactory;

  const modelLoader = createFormationModelLoader({
    config: CONFIG,
    state,
    ui,
    THREE,
    setMenuLoading,
    refreshReadyState,
    setPlacementReticleModel,
    setXRDebug,
    validateGelifluctionAsset
  });
  const { loadModels } = modelLoader;

  const locationController = createLocationController({
    state,
    ui,
    config: CONFIG,
    THREE,
    setXRDebug
  });
  const {
    captureCompassHeading,
    getPlacementGateStatus,
    positionSunLightAt,
    startLocationTracking,
    stopLocationTracking,
    updateGeoStatus,
    updateSunLightFromDeviceLocation
  } = locationController;

  const arController = createArController({
    state,
    ui,
    THREE,
    bounceScanPrompt,
    captureCompassHeading,
    getPlacementGateStatus,
    placeFormation: (center, anchor) => placementController.placeFormation(center, anchor),
    refreshReadyState,
    resetInput: () => interactionController && interactionController.reset(),
    setInputSession: (session) => interactionController && interactionController.setXrSession(session),
    setFormationSliderVisible,
    setGeoStatusVisible,
    setMenuButtonVisible,
    setMenuLoading,
    setScanPromptVisible,
    setXRDebug,
    startLocationTracking,
    stopLocationTracking,
    updateFormationPlacement: () => placementController.updateFormationPlacement(),
    updateGeoStatus,
    updateHud,
    updateSunLightFromDeviceLocation
  });
  const {
    checkARSupport,
    placeAtDetectedPlane,
    releasePlacementAnchor,
    startARSession,
    updateFrame: updateArFrame
  } = arController;

  interactionController = createCanvasInteractionController({
    pinchActivityTimeoutMs: CONFIG.pinchActivityTimeoutMs,
    pinchDistanceThresholdPixels: CONFIG.pinchDistanceThresholdPixels,
    onHudPointerInput: (event) => arHud.handlePointerEvent(event),
    onHudSelectInput: (event) => arHud.handleSelect(event),
    onPinchChange: setPinchActive,
    onPlacementTap: placeAtDetectedPlane
  });

  placementController = createPlacementController({
    state,
    createGelifluctionInstance,
    createShadowReceiver,
    disposeObject,
    positionSunLightAt,
    prepareFormationPlacement,
    refreshReadyState,
    releasePlacementAnchor,
    resetFormationSlider,
    resetFormationState,
    resetInput: interactionController.reset,
    setFormationSliderVisible,
    setMenuButtonVisible,
    setScanPromptVisible,
    setXRDebug,
    updateHud
  });
  const { placeFormation, reset, returnToMainMenu, updateFormationPlacement } = placementController;

  init();

  function init() {
    initializeScene();
    arHud.initialize();
    interactionController.attach(state.renderer.domElement);
    loadModels();

    window.addEventListener("resize", onResize);
    ui.startArButton.addEventListener("click", startARSession);
    ui.resetButton.addEventListener("click", reset);
    ui.menuButton.addEventListener("click", returnToMainMenu);
    initFormationSlider();

    ui.startArButton.disabled = true;
    setFormationSliderVisible(false);
    setMenuLoading(0, "Checking", "Checking AR capability.");
    checkARSupport();
    installDebugHooks({
      state,
      THREE,
      getCurrentStage,
      placeFormation,
      reset,
      updateFormationPlacement
    });
    state.renderer.setAnimationLoop(render);
  }

  function render(time, frame) {
    const deltaSeconds = state.lastTime ? Math.min((time - state.lastTime) / 1000, 0.05) : 0;
    state.lastTime = time;
    interactionController.update(performance.now());

    if (frame) {
      updateArFrame(frame);
    }
    if (state.xrSession) {
      updateGeoStatus();
    }
    if (state.formationPlaced) {
      updateFormationAnimation(deltaSeconds);
    }
    arHud.update();

    state.renderer.render(state.scene, state.camera);
  }
})();
