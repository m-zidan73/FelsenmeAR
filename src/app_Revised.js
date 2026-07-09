import * as THREE from "three";
import { createArController } from "./ar-controller.js";
import { CONFIG } from "./config.js";
import { installDebugHooks } from "./debug-hooks.js";
import { getUiElements } from "./dom.js";
import { createFormationModelLoader } from "./formation/model-loader.js";
import { createGelifluctionModelFactory, setLabelVisibilityByStage } from "./formation/model-factory.js";
import { createPlacementController } from "./formation/placement-controller.js";
import { createGelifluctionStageController } from "./formation/stage-controller.js";
import { createCanvasInteractionController } from "./interaction-controller.js";
import { createLocationController } from "./location-controller.js";
import { installRuntimeErrorCapture } from "./runtime-errors.js";
import { createSceneController } from "./scene.js";
import { createAppState } from "./state.js";
import { disposeObject } from "./three-utils.js";
import { createFormationSlider } from "./ui/formation-slider.js";
import { createHudUi } from "./ui/hud.js";
import { createMenuUi } from "./ui/menu.js";

import { EventBus } from "./event-bus.js";
import { ExperienceState, ExperienceStateManager } from "./state-manager.js";
import { createUIPromptController } from "./ui-prompt-controller.js";
import { createAudioManager } from "./audio-manager.js";
import { createDataOverlayController } from "./data-overlay-controller.js";

const STAGE_DATA = [
  { stage: 1, name: "Magma Generation", epoch: "~340 Ma", era: "Subduction Zone", rock: "Mantle + Crustal Melts" },
  { stage: 2, name: "Pluton Formation", epoch: "~340–330 Ma", era: "Variscan Orogeny", rock: "Quartz Diorite" },
  { stage: 3, name: "Cooling Joints (Diaclasas)", epoch: "~300 Ma", era: "", rock: "Quartz Diorite" },
  { stage: 4, name: "Woolsack Weathering (Rounding)", epoch: "~50 Ma", era: "Tertiary Period", rock: "Quartz Diorite" },
  { stage: 5, name: "Gelifluction (Sorting)", epoch: "~2.6 Ma – 10,000 years ago", era: "Quaternary Period", rock: "Granodiorite" }
];

(function () {
  installRuntimeErrorCapture();

  const state = createAppState();
  const ui = getUiElements();
  const hudUi = createHudUi({ ui });
  const { setXRDebug, updateHud } = hudUi;

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
    requestStage: originalRequestStage,
    reset: resetFormationState,
    setPinchActive,
    update: updateFormationAnimation
  } = stageController;

  function requestStageWrapped(targetStage, previousStage) {
    const accepted = originalRequestStage(targetStage);
    if (accepted) {
      const stageNames = {
        5: ExperienceState.Stage5,
        4: ExperienceState.Stage4,
        3: ExperienceState.Stage3,
        2: ExperienceState.Stage2,
        1: ExperienceState.Stage1
      };
      const newState = stageNames[targetStage];
      if (newState) {
        ExperienceStateManager.setState(newState);
      }
      EventBus.raise("stage_changed", {
        stage: targetStage,
        previousStage: previousStage + 1,
        stageIndex: targetStage - 1
      });
    }
    return accepted;
  }

  const formationSliderUi = createFormationSlider({
    ui,
    clamp: THREE.MathUtils.clamp,
    onStepSelected(stepIndex, previousStep) {
      return requestStageWrapped(stepIndex + 1, previousStep);
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

  let interactionController;
  let placementController;
  let pinchActive = false;
  let subductionElapsed = 0;
  let lastEmittedSubductionThreshold = 0;
  let emittedPinchPhase = 0;
  let wasReticleVisible = false;
  let hadSession = false;
  let readyEmitted = false;

  function reportPinchDebug(debug) {
    const distance = Number.isFinite(debug.distance) ? " distance=" + debug.distance.toFixed(1) : "";
    const delta = Number.isFinite(debug.distanceDelta) ? " delta=" + debug.distanceDelta.toFixed(1) : "";
    setXRDebug(
      "pinch " + debug.eventName +
      " touches=" + debug.touchCount +
      " active=" + (debug.pinchActive ? "yes" : "no") +
      distance +
      delta +
      " stage=" + getCurrentStage()
    );
  }

  const arController = createArController({
    state,
    ui,
    THREE,
    bounceScanPrompt,
    captureCompassHeading,
    getPlacementGateStatus,
    placeFormation: (center, anchor) => {
      placementController.placeFormation(center, anchor);
      ExperienceStateManager.setState(ExperienceState.FormationPlaced);
      EventBus.raise("formation_placed", {});
    },
    refreshReadyState: () => {
      refreshReadyState();
      if (!readyEmitted && !state.modelLoadError && state.modelsLoaded && state.arSupported && !ui.startArButton.disabled) {
        readyEmitted = true;
        ExperienceStateManager.setState(ExperienceState.Ready);
      }
    },
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
    onPinchChange: (active) => {
      setPinchActive(active);
      pinchActive = active;
      EventBus.raise("pinch_progress", { active });
      if (active && getCurrentStage() === 1) {
        ExperienceStateManager.setState(ExperienceState.PinchActive);
      }
    },
    onPinchDebug: reportPinchDebug,
    onPlacementTap: placeAtDetectedPlane
  });

  placementController = createPlacementController({
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
    resetInput: interactionController.reset,
    setFormationSliderVisible,
    setMenuButtonVisible,
    setScanPromptVisible,
    setXRDebug,
    updateHud
  });
  const { placeFormation, reset, returnToMainMenu, updateFormationPlacement } = placementController;

  const tutorialBarEl = document.getElementById("tutorialBar");
  const tutorialTextEl = document.getElementById("tutorialText");
  const sliderTimeLabel = document.getElementById("sliderTimeLabel");
  const rockBadge = document.getElementById("rockInfoBadge");
  const rockBadgeMaterial = document.getElementById("rockBadgeMaterial");
  const rockBadgeEra = document.getElementById("rockBadgeEra");

  const promptController = createUIPromptController({
    barElement: tutorialBarEl,
    textElement: tutorialTextEl
  });

  const audioManager = createAudioManager({
    audioMapUrl: "config/audio-map.json"
  });

  const dataOverlayController = createDataOverlayController({
    stageDataUrl: "config/stage-data.json",
    nameElement: document.getElementById("stageName"),
    eraElement: document.getElementById("stageEra"),
    epochElement: document.getElementById("stageEpoch"),
    rockTypeElement: document.getElementById("stageRockType"),
    plateElement: document.getElementById("stagePlate"),
    descriptionElement: document.getElementById("stageDescription")
  });

  function updateSliderTimeLabel(rawSliderValue) {
    const numericValue = THREE.MathUtils.clamp(Number(rawSliderValue) || 0, 0, 4);
    const stepIndex = Math.round(numericValue);
    const data = STAGE_DATA[stepIndex];
    if (!sliderTimeLabel || !data) return;
    sliderTimeLabel.hidden = false;
    sliderTimeLabel.textContent = data.epoch;
    const percent = 10 + (numericValue / 4) * 80;
    sliderTimeLabel.style.left = percent + "%";
  }

  function updateRockBadge(stageIndex) {
    const data = STAGE_DATA.find(s => s.stage === stageIndex);
    if (!data || !rockBadge) return;
    if (rockBadgeMaterial) rockBadgeMaterial.textContent = data.rock;
    if (rockBadgeEra) rockBadgeEra.textContent = data.era;
    rockBadge.hidden = false;
    rockBadge.style.animation = "none";
    void rockBadge.offsetHeight;
    rockBadge.style.animation = "badgeIn 350ms ease";
  }

  init();

  function init() {
    initializeScene();
    interactionController.attach(state.renderer.domElement);
    loadModels();

    audioManager.load();
    dataOverlayController.load();

    window.addEventListener("resize", onResize);
    ui.startArButton.addEventListener("click", startARSession);
    ui.resetButton.addEventListener("click", reset);
    ui.menuButton.addEventListener("click", returnToMainMenu);
    initFormationSlider();
    updateSliderTimeLabel(4);

    ui.formationRange.addEventListener("input", (event) => {
      updateSliderTimeLabel(event.target.value);
    });

    ui.startArButton.disabled = true;
    setFormationSliderVisible(false);
    setMenuLoading(0, "Checking", "Checking AR capability.");
    checkARSupport();

    EventBus.on("stage_changed", (data) => {
      if (data && typeof data.stage === "number") {
        updateRockBadge(data.stage);
        if (state.formationLabels) {
          setLabelVisibilityByStage(state.formationLabels, data.stage);
        }
      }
    });
    EventBus.on("formation_placed", () => {
      updateRockBadge(5);
      updateSliderTimeLabel(4);
      ExperienceStateManager.setState(ExperienceState.SliderActive);
      setTimeout(() => {
        if (state.formationLabels) {
          setLabelVisibilityByStage(state.formationLabels, 5);
        }
      }, CONFIG.stageFiveRevealDelaySeconds * 1000);
    });
    EventBus.on("alignment_quality", (data) => {
      if (data && data.quality > 0.95) {
        ExperienceStateManager.setState(ExperienceState.Aligned);
      }
    });
    EventBus.on("sequence_completed", (data) => {
      if (data && data.trigger === "state:Stage1") {
        promptController.show("Tap Next Chapter to explore this stage.");
      }
    });
    EventBus.on("next_chapter", () => {
      ExperienceStateManager.setState(ExperienceState.PinchReady);
    });
    EventBus.on("subduction_progress", (data) => {
      if (data && data.progress >= 1) {
        ExperienceStateManager.setState(ExperienceState.PinchActive);
        EventBus.raise("pinch_reset", {});
      }
    });

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

    const hasSession = !!state.xrSession;
    if (hasSession && !hadSession) {
      ExperienceStateManager.setState(ExperienceState.Scanning);
      EventBus.raise("session_started", {});
    } else if (!hasSession && hadSession) {
      EventBus.raise("session_ended", {});
      ExperienceStateManager.setState(ExperienceState.SessionEnded);
    }
    hadSession = hasSession;

    if (state.placementReticle && state.placementReticle.visible && !wasReticleVisible) {
      ExperienceStateManager.setState(ExperienceState.PlaneDetected);
      EventBus.raise("plane_detected", {});
    }
    wasReticleVisible = state.placementReticle ? state.placementReticle.visible : false;
    if (state.xrSession) {
      updateGeoStatus();
    }
    if (state.formationPlaced) {
      updateFormationAnimation(deltaSeconds);

      const currentStage = getCurrentStage();
      if (pinchActive && currentStage === 1) {
        subductionElapsed += deltaSeconds;
        const progress = Math.min(subductionElapsed / 3, 1);

        const pinchPhase = progress < 1 / 3 ? 1 : progress < 2 / 3 ? 2 : 3;
        if (pinchPhase > emittedPinchPhase) {
          emittedPinchPhase = pinchPhase;
          EventBus.raise("pinch_phase", { phase: pinchPhase });
        }

        const thresholds = [0, 0.3, 0.5, 0.8, 1.0];
        for (const t of thresholds) {
          if (progress >= t && lastEmittedSubductionThreshold < t) {
            lastEmittedSubductionThreshold = t;
            EventBus.raise("subduction_progress", { progress: t });
            if (t >= 1) {
              pinchActive = false;
              emittedPinchPhase = 0;
            }
          }
        }
      } else if (!pinchActive && currentStage === 1) {
        lastEmittedSubductionThreshold = 0;
        emittedPinchPhase = 0;
      }
    } else {
      subductionElapsed = 0;
      lastEmittedSubductionThreshold = 0;
    }

    state.renderer.render(state.scene, state.camera);
  }
})();
