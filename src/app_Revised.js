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
import { createOrientationController } from "./ui/orientation-controller.js";

import { EventBus } from "./event-bus.js";
import { ExperienceState, ExperienceStateManager } from "./state-manager.js";
import { createTutorialController } from "./tutorial-controller.js";
import { createAudioManager } from "./audio-manager.js";
import { createDataOverlayController } from "./data-overlay-controller.js";
import { createTectonicCollisionController } from "../TectonicModel/src/tectonic-collision-controller.js";
import { createTapRaycaster } from "./tap-raycaster.js";

(function () {
  installRuntimeErrorCapture();

  const state = createAppState();
  const ui = getUiElements();
  const hudUi = createHudUi({ ui });
  const { setStageInstructionVisible, setXRDebug, updateHud } = hudUi;

  const tectonicCollisionController = createTectonicCollisionController({
    EventBus,
    setXRDebug
  });

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

  const formationSliderUi = createFormationSlider({
    ui,
    clamp: THREE.MathUtils.clamp,
    onStepSelected(stepIndex, previousStep) {
      return requestStageWrapped(stepIndex + 1, previousStep + 1);
    }
  });
  const { initFormationSlider, resetFormationSlider } = formationSliderUi;

  const stageController = createGelifluctionStageController({
    config: CONFIG,
    THREE,
    updateHud,
    getStageOneTargetPosition: tectonicCollisionController.getSphereWorldPosition,
    onStageInstructionVisibleChange: setStageInstructionVisible,
    onSubductionPromptVisibleChange: tectonicCollisionController.setGesturePromptVisible
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
        previousStage: previousStage,
        stageIndex: targetStage - 1
      });
    }
    return accepted;
  }

  const sceneController = createSceneController({
    state,
    ui,
    THREE,
    disposeObject
  });
  const {
    createShadowReceiver,
    initializeScene,
    onResize,
    setPlacementReticleModel: setPlacementReticleModelOriginal
  } = sceneController;

  const orientationController = createOrientationController({
    targetElement: document.body,
    windowObject: window,
    documentObject: document,
    onResize,
    setXRDebug
  });

  function setPlacementReticleModel(source) {
    setPlacementReticleModelOriginal(source);

    const model = state.placementReticle?.getObjectByName("PolyCam Rock Sample");
    if (!model) return;

    model.position.set(0, 0, 0);
    model.scale.multiplyScalar(1.3);

    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y + 0.01, -center.z);
  }

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
  let wasReticleVisible = false;
  let hadSession = false;
  let readyEmitted = false;
  const activeGrabs = new Map();

  const tapRaycaster = createTapRaycaster({
    getCamera: () => state.camera
  });

  function reportPinchDebug(debug) {
    tectonicCollisionController.handlePinchDebug(debug);
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

  function placeFormationWrapped(center, anchor) {
    placementController.placeFormation(center, anchor);
    ExperienceStateManager.setState(ExperienceState.FormationPlaced);
    EventBus.raise("formation_placed", {});
  }

  const arController = createArController({
    state,
    ui,
    THREE,
    bounceScanPrompt,
    captureCompassHeading,
    getPlacementGateStatus,
    placeFormation: placeFormationWrapped,
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
      if (active) {
        if (getCurrentStage() === 1) {
          const plates = Array.from(activeGrabs.values());
          const hasLower = plates.some(n => n.includes("CapaInferior"));
          const hasUpper = plates.some(n => n.includes("CapaSuperior"));
          if (!hasLower || !hasUpper) {
            for (const [pid, mn] of activeGrabs) {
              EventBus.raise("grab_end", { meshName: mn });
            }
            activeGrabs.clear();
            setPinchActive(false);
            EventBus.raise("pinch_progress", { active: false });
            return;
          }
        }
        for (const [pid, meshName] of activeGrabs) {
          EventBus.raise("grab_end", { meshName });
        }
        activeGrabs.clear();
      }
      if (active && getCurrentStage() === 1 && !audioManager.canAdvancePinch()) {
        setPinchActive(false);
        EventBus.raise("pinch_progress", { active: false });
        return;
      }
      const tectonicPhase = tectonicCollisionController.handlePinchChange(active);
      const tectonicActive = tectonicCollisionController.isReplacementActive();
      setPinchActive(tectonicActive ? false : active);
      EventBus.raise("pinch_progress", { active });
      if (active && getCurrentStage() === 1) {
        ExperienceStateManager.setState(ExperienceState.PinchActive);
        if (tectonicPhase) {
          EventBus.raise("pinch_phase", { phase: tectonicPhase });
        } else if (!tectonicActive) {
          const phases = [1, 2, 3];
          const next = phases.find(p => !audioManager.hasPlayed("pinch_phase:" + p));
          if (next) EventBus.raise("pinch_phase", { phase: next });
        }
      }
    },
    onPinchDebug: reportPinchDebug,
    onPlacementTap: placeAtDetectedPlane,
    onTap: (x, y) => tapRaycaster.handleTap(x, y, window.innerWidth, window.innerHeight),
    onTouchStart: (x, y, pointerId) => {
      if (getCurrentStage() !== 1 || !audioManager.canAdvancePinch()) return;
      const hit = tapRaycaster.handleTouchStart(x, y, window.innerWidth, window.innerHeight);
      if (hit) {
        activeGrabs.set(pointerId, hit.meshName);
      }
    },
    onTouchEnd: (pointerId) => {
      const meshName = activeGrabs.get(pointerId);
      if (meshName) {
        activeGrabs.delete(pointerId);
        EventBus.raise("grab_end", { meshName });
      }
    }
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
  const {
    reset: resetPlacement,
    returnToMainMenu: returnToMainMenuPlacement,
    updateFormationPlacement
  } = placementController;

  function reset() {
    setStageInstructionVisible(false);
    tectonicCollisionController.reset();
    resetPlacement();
  }

  function returnToMainMenu() {
    setStageInstructionVisible(false);
    tectonicCollisionController.reset();
    returnToMainMenuPlacement();
  }

  function getTectonicPlacementOptions() {
    return {
      scene: state.scene,
      formationRoot: state.formationRoot,
      position: state.placementCenter,
      planeHeight: state.planeHeight,
      quaternion: state.formationRoot ? state.formationRoot.quaternion : null,
      camera: state.camera
    };
  }

  const tutorialToggleEl = ui.tutorialToggle;
  const tutorialIconBtn = ui.tutorialIconButton;
  const tutorialPanelEl = ui.tutorialPanel;
  const tutorialTextEl = ui.tutorialText;
  const tutorialPrevBtn = ui.tutorialPreviousButton;
  const tutorialNextBtn = ui.tutorialNextButton;
  const tutorialIndicator = ui.tutorialPageIndicator;
  const sliderTimeLabel = ui.sliderTimeLabel;
  const rockBadge = ui.rockInfoBadge;
  const rockBadgeMaterial = ui.rockBadgeMaterial;
  const rockBadgeEra = ui.rockBadgeEra;

  const tutorialController = createTutorialController({
    toggleElement: tutorialToggleEl,
    iconBtn: tutorialIconBtn,
    panelElement: tutorialPanelEl,
    textElement: tutorialTextEl,
    prevBtn: tutorialPrevBtn,
    nextBtn: tutorialNextBtn,
    indicator: tutorialIndicator
  });

  const audioManager = createAudioManager({
    audioMapUrl: "config/audio-map.json"
  });

  const dataOverlayController = createDataOverlayController({
    stageDataUrl: "config/stage-data.json",
    nameElement: ui.stageName,
    eraElement: ui.stageEra,
    epochElement: ui.stageEpoch,
    rockTypeElement: ui.stageRockType,
    plateElement: ui.stagePlate,
    descriptionElement: ui.stageDescription
  });

  function updateSliderTimeLabel(rawSliderValue) {
    const numericValue = THREE.MathUtils.clamp(Number(rawSliderValue) || 0, 0, 4);
    const stepIndex = Math.round(numericValue);
    const stageIndex = stepIndex + 1;
    const data = dataOverlayController.getStageData().find(s => s.index === stageIndex);
    if (!sliderTimeLabel || !data) return;
    sliderTimeLabel.hidden = false;
    sliderTimeLabel.textContent = data.epoch;
    const percent = 10 + (numericValue / 4) * 80;
    sliderTimeLabel.style.left = percent + "%";
    if (rockBadge && data) {
      if (rockBadgeMaterial) rockBadgeMaterial.textContent = data.name;
      if (rockBadgeEra) rockBadgeEra.textContent = data.description;
      rockBadge.hidden = false;
      rockBadge.style.animation = "none";
      void rockBadge.offsetHeight;
      rockBadge.style.animation = "badgeIn 350ms ease";
    }
  }

  function updateRockBadge(stageIndex) {
    const data = dataOverlayController.getStageData().find(s => s.index === stageIndex);
    if (!data || !rockBadge) return;
    if (rockBadgeMaterial) rockBadgeMaterial.textContent = data.name;
    if (rockBadgeEra) rockBadgeEra.textContent = data.description;
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

    const subtitleEl = ui.subtitleDisplay;
    let subtitlesMap = {};
    let tutorialsMap = {};
    fetch("config/subtitles.json")
      .then(r => r.json())
      .then(data => {
        subtitlesMap = data.subtitles || {};
        tutorialsMap = data.tutorials || {};
      })
      .catch(() => {});

    EventBus.on("clip_started", (data) => {
      if (!subtitleEl || !data || !data.clip) return;
      const text = subtitlesMap[data.clip];
      subtitleEl.textContent = text || "";
      subtitleEl.hidden = !text;
      const tutorialText = tutorialsMap[data.clip];
      if (tutorialText) tutorialController.addMessage(tutorialText);
    });
    EventBus.on("clip_ended", (data) => {
      if (subtitleEl) subtitleEl.hidden = true;
      if (data && data.clip === "11a. 350.mp3") {
        EventBus.raise("tectonic_show_initial", {});
      }
    });

    orientationController.init();
    ui.startArButton.addEventListener("click", startARSession);
    ui.resetButton.addEventListener("click", reset);
    ui.menuButton.addEventListener("click", returnToMainMenu);
    initFormationSlider();
    rockBadge.hidden = true;

    ui.formationRange.addEventListener("input", (event) => {
      updateSliderTimeLabel(event.target.value);
    });

    ui.startArButton.disabled = true;
    setFormationSliderVisible(false);
    setMenuLoading(0, "Checking", "Checking AR capability.");
    checkARSupport();

    EventBus.on("stage_changed", (data) => {
      if (data && typeof data.stage === "number") {
        tectonicCollisionController.handleStageChange(data.stage);
        updateRockBadge(data.stage);
        if (state.formationLabels) {
          setLabelVisibilityByStage(state.formationLabels, data.stage);
        }
      }
    });
    EventBus.on("session_started", () => orientationController.scheduleRefresh());
    EventBus.on("session_ended", () => orientationController.scheduleRefresh());

    EventBus.on("formation_placed", () => {
      tectonicCollisionController.attach(getTectonicPlacementOptions());
      updateSliderTimeLabel(0);
      ExperienceStateManager.setState(ExperienceState.SliderActive);
      if (state.formationLabels) {
        setLabelVisibilityByStage(state.formationLabels, 1);
      }
    });
    EventBus.on("tectonic_model_ready", () => {
      const plateMeshes = tectonicCollisionController.getPlateMeshes();
      if (plateMeshes.length > 0) {
        tapRaycaster.addTarget("tectonic_plates", plateMeshes);
      }
    });
    EventBus.on("alignment_quality", (data) => {
      if (data && data.quality > 0.95) {
        ExperienceStateManager.setState(ExperienceState.Aligned);
      }
    });

    EventBus.on("next_chapter", () => {
      ExperienceStateManager.setState(ExperienceState.PinchReady);
      const p = dataOverlayController.getPinchData();
      if (p && rockBadge) {
        rockBadgeMaterial.textContent = p.name;
        rockBadgeEra.textContent = p.description;
        rockBadge.hidden = false;
        rockBadge.style.animation = "none";
        void rockBadge.offsetHeight;
        rockBadge.style.animation = "badgeIn 350ms ease";
      }
    });
    EventBus.on("subduction_progress", (data) => {
      if (data && data.progress >= 1) {
        ExperienceStateManager.setState(ExperienceState.PinchActive);
      }
    });

    installDebugHooks({
      state,
      THREE,
      getCurrentStage,
      placeFormation: placeFormationWrapped,
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
      setStageInstructionVisible(false);
      tectonicCollisionController.reset();
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
      tectonicCollisionController.updatePlacement(getTectonicPlacementOptions());
      tectonicCollisionController.update(deltaSeconds);
    }

    state.renderer.render(state.scene, state.camera);
  }
})();
