import * as THREE from "three";
import { createArController } from "./ar-controller.js";
import { createFormationController } from "./boulders/formation-controller.js";
import { createBoulderModelFactory } from "./boulders/model-factory.js";
import { createBoulderModelLoader } from "./boulders/model-loader.js";
import { CONFIG } from "./config.js";
import { getUiElements } from "./dom.js";
import { createLocationController } from "./location-controller.js";
import { installRuntimeErrorCapture } from "./runtime-errors.js";
import { createAppState } from "./state.js";
import { createSceneController } from "./scene.js";
import {
  disposeObject,
  getObjectSnapshot
} from "./three-utils.js";
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
  const formationSliderUi = createFormationSlider({
    state,
    ui,
    clamp: THREE.MathUtils.clamp,
    onStepSelected: onFormationStepSelected
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

  const arController = createArController({
    state,
    ui,
    THREE,
    bounceScanPrompt,
    captureCompassHeading,
    getPlacementGateStatus,
    placeBoulders,
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
    updateBoulderPlacement,
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
    installDebugHooks();
    state.renderer.setAnimationLoop(render);
  }

  function onFormationStepSelected(stepIndex, previousStep) {
    window.__formationSliderStep = stepIndex;
    if (stepIndex === 3) {
      startFloatingObjectChildrenReveal();
    } else if (stepIndex < previousStep) {
      processFormationStage();
    }
  }

  function installDebugHooks() {
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

    state.reticle.visible = false;
    state.planeIndicator.visible = false;
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
  }})();
