import * as THREE from "three";
import { createArController } from "./ar-controller.js";
import { createFormationController } from "./boulders/formation-controller.js";
import { createBoulderModelFactory } from "./boulders/model-factory.js";
import { createBoulderModelLoader } from "./boulders/model-loader.js";
import { createPlacementController } from "./boulders/placement-controller.js";
import { CONFIG } from "./config.js";
import { installDebugHooks } from "./debug-hooks.js";
import { getUiElements } from "./dom.js";
import { createLocationController } from "./location-controller.js";
import { installRuntimeErrorCapture } from "./runtime-errors.js";
import { createAppState } from "./state.js";
import { createSceneController } from "./scene.js";
import { disposeObject } from "./three-utils.js";
import { createFormationSlider } from "./ui/formation-slider.js";
import { createHudUi } from "./ui/hud.js";
import { createMenuUi } from "./ui/menu.js";

(function () {
  installRuntimeErrorCapture();

  const state = createAppState();
  const ui = getUiElements();
  const hudUi = createHudUi({ state, ui, THREE });
  const {
    createXrFallbackHud,
    refreshXrHudTexture,
    setXRDebug,
    setXrHudVisible,
    shouldUseXrFallbackHud,
    updateHud,
    updateXrHudLayout
  } = hudUi;

  const menuUi = createMenuUi({
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
    setScanPromptVisible,
    setStartFromHereReady,
    setStartFromHereVisible
  } = menuUi;

  const formationController = createFormationController({
    state,
    config: CONFIG,
    THREE,
    updateHud
  });
  const {
    preparePlacement: prepareFormationPlacement,
    processStage: processFormationStage,
    reset: resetFormationState,
    startChildrenReveal: startFloatingObjectChildrenReveal,
    triggerFloatingObject,
    update: updateFormationAnimation
  } = formationController;

  const formationSliderUi = createFormationSlider({
    state,
    ui,
    clamp: THREE.MathUtils.clamp,
    onStepSelected(stepIndex, previousStep) {
      window.__formationSliderStep = stepIndex;
      if (stepIndex === 3) {
        startFloatingObjectChildrenReveal();
      } else if (stepIndex < previousStep) {
        processFormationStage();
      }
    }
  });
  const { initFormationSlider, resetFormationSlider } = formationSliderUi;

  const sceneController = createSceneController({
    state,
    ui,
    THREE,
    disposeObject
  });
  const { createShadowReceiver, initializeScene, onResize } = sceneController;

  const boulderModelFactory = createBoulderModelFactory({
    config: CONFIG,
    THREE
  });
  const { createBoulderInstance, getModelScale } = boulderModelFactory;

  const boulderModelLoader = createBoulderModelLoader({
    state,
    ui,
    THREE,
    setMenuLoading,
    refreshReadyState,
    setXRDebug
  });
  const { loadBoulderModel } = boulderModelLoader;

  const locationController = createLocationController({
    state,
    ui,
    config: CONFIG,
    THREE,
    refreshXrHudTexture,
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

  let placementController;
  const arController = createArController({
    state,
    ui,
    THREE,
    bounceScanPrompt,
    captureCompassHeading,
    getPlacementGateStatus,
    placeBoulders: (center, anchor) => placementController.placeBoulders(center, anchor),
    refreshReadyState,
    setFormationSliderVisible,
    setGeoStatusVisible,
    setMenuButtonVisible,
    setMenuLoading,
    setScanPromptVisible,
    setStartFromHereReady,
    setStartFromHereVisible,
    setXRDebug,
    setXrHudVisible,
    shouldUseXrFallbackHud,
    startLocationTracking,
    stopLocationTracking,
    updateBoulderPlacement: () => placementController.updateBoulderPlacement(),
    updateGeoStatus,
    updateHud,
    updateSunLightFromDeviceLocation
  });
  const {
    checkARSupport,
    releasePlacementAnchor,
    startARSession,
    startFromDetectedPlane,
    updateFrame: updateArFrame
  } = arController;

  placementController = createPlacementController({
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
  });
  const { placeBoulders, reset, returnToMainMenu, updateBoulderPlacement } = placementController;

  init();

  function init() {
    initializeScene();
    createXrFallbackHud();
    loadBoulderModel();

    window.addEventListener("resize", onResize);
    ui.startArButton.addEventListener("click", startARSession);
    ui.startFromHereButton.addEventListener("click", startFromDetectedPlane);
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
      placeBoulders,
      reset,
      triggerFloatingObject,
      updateBoulderPlacement
    });
    state.renderer.setAnimationLoop(render);
  }

  function render(time, frame) {
    const deltaSeconds = state.lastTime ? Math.min((time - state.lastTime) / 1000, 0.05) : 0;
    state.lastTime = time;

    if (frame) {
      updateArFrame(frame);
    }

    if (state.xrSession) {
      updateGeoStatus();
      updateXrHudLayout();
    }

    if (state.bouldersPlaced) {
      updateFormationAnimation(deltaSeconds);
    }

    state.renderer.render(state.scene, state.camera);
  }
})();
