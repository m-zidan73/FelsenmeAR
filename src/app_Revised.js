import * as THREE from "three";
import { createArController } from "./ar-controller.js";
import { CONFIG } from "./config.js";
import { installDebugHooks } from "./debug-hooks.js";
import { getUiElements } from "./dom.js";
import { createFormationModelLoader } from "./formation/model-loader.js";
import { createGelifluctionModelFactory, setLabelVisibilityByStage, toggleLabelSprite, createStandaloneLabel } from "./formation/model-factory.js";
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
import { createStartButtonController } from "./ui/start-button-controller.js";

import { EventBus } from "./event-bus.js";
import { ExperienceState, ExperienceStateManager } from "./state-manager.js";
import { createTutorialController } from "./tutorial-controller.js";
import { createAudioManager } from "./audio-manager.js";
import { createDataOverlayController } from "./data-overlay-controller.js";
import { createTectonicCollisionController } from "../TectonicModel/src/tectonic-collision-controller.js";
import { createTapRaycaster } from "./tap-raycaster.js";
import { startAssetPreload } from "./asset-preloader.js";
import { PRELOAD_ASSET_URLS, PRELOAD_CACHE_NAME } from "./preload-manifest.js";

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
    refreshReadyState,
    setFormationSliderVisible,
    setGeoStatusVisible,
    setMenuButtonVisible,
    setMenuLoading
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
    setGreenscreenWorldActive,
    setPlacementReticleModel: setPlacementReticleModelOriginal
  } = sceneController;

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
  const tectonicLabels = [];
  const _allMovingColliders = [];
  const LABEL_PUSH = 0.1;
  let popupsEnabled = false;
  let userEnteredStage = false;

  function applyLabelVisibility(stage) {
    const show = popupsEnabled && userEnteredStage;
    if (state.formationLabels) {
      if (show) {
        setLabelVisibilityByStage(state.formationLabels, stage);
      } else {
        for (const key in state.formationLabels) {
          if (key === "__colliders") continue;
          state.formationLabels[key].visible = false;
        }
        (state.formationLabels.__colliders || []).forEach(c => { c.visible = false; });
      }
    }
    const showTectonic = show && stage === 1;
    tectonicLabels.forEach(({ sprite, collider }) => {
      sprite.visible = showTectonic;
      collider.visible = showTectonic;
    });
  }

  function setRestartAvailable(available) {
    if (ui.restartStageOneButton) {
      ui.restartStageOneButton.hidden = !available;
    }
  }

  function clearPopupTargets() {
    tapRaycaster.removeTarget("formation_labels");
    tapRaycaster.removeTarget("tectonic_labels");
    tectonicLabels.length = 0;
    _allMovingColliders.length = 0;
  }

  function resetPopupState({ hideControl = true } = {}) {
    clearPopupTargets();
    popupsEnabled = false;
    userEnteredStage = false;
    if (ui.popupToggle) {
      ui.popupToggle.hidden = hideControl;
      ui.popupToggle.classList.remove("is-active");
    }
  }

  function restartStageOne() {
    if (getCurrentStage() !== 1 || !tectonicCollisionController.restartStageOne()) return;
    interactionController.reset();
    activeGrabs.clear();
    setRestartAvailable(false);
    tectonicCollisionController.setGesturePromptVisible(false);
    audioManager.restartStageOne();
    EventBus.raise("pinch_reset", {});
  }

  const tapRaycaster = createTapRaycaster({
    getCamera: () => state.camera,
    shouldBlockTarget: (name) =>
      name === "tectonic_plates" && getCurrentStage() === 1 && !audioManager.canAdvancePinch()
  });

  function pickLabelAtScreen(screenX, screenY, width, height) {
    const camera = state.camera;
    if (!camera) return null;
    const _pos = new THREE.Vector3();
    const thresholdPx = 50;
    let best = null;
    let bestDist = thresholdPx;
    const labels = state.formationLabels;
    if (labels) {
      for (const key in labels) {
        if (key === "__colliders") continue;
        const sprite = labels[key];
        if (!sprite || !sprite.visible) continue;
        sprite.getWorldPosition(_pos);
        _pos.project(camera);
        const sx = (_pos.x * 0.5 + 0.5) * width;
        const sy = (-_pos.y * 0.5 + 0.5) * height;
        const dist = Math.hypot(sx - screenX, sy - screenY);
        if (dist < bestDist) { bestDist = dist; best = sprite; }
      }
    }
    for (const entry of tectonicLabels) {
      if (!entry.sprite.visible) continue;
      entry.sprite.getWorldPosition(_pos);
      _pos.project(camera);
      const sx = (_pos.x * 0.5 + 0.5) * width;
      const sy = (-_pos.y * 0.5 + 0.5) * height;
      const dist = Math.hypot(sx - screenX, sy - screenY);
      if (dist < bestDist) { bestDist = dist; best = entry.sprite; }
    }
    return best;
  }

  function isPinchPhaseSequence(trigger) {
    return /^event:pinch_phase:[1-3]$/.test(trigger || "");
  }

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
    setXRDebug,
    setGreenscreenWorldActive: (isActive) => setGreenscreenWorldActive(isActive, CONFIG.greenscreenWorldColor),
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


  const startButtonController = createStartButtonController({
    button: ui.startArButton,
    holdDurationMs: CONFIG.greenscreenStartHoldMs,
    onStart: () => startARSession(),
    onGreenscreenStart: () => startARSession({ greenscreenWorld: true })
  });

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
    onTap: (x, y) => {
      const label = pickLabelAtScreen(x, y, window.innerWidth, window.innerHeight);
      if (label) { toggleLabelSprite(label); return; }
      tapRaycaster.handleTap(x, y, window.innerWidth, window.innerHeight);
    },
    onTouchStart: (x, y, pointerId) => {
      const hit = tapRaycaster.handleTouchStart(x, y, window.innerWidth, window.innerHeight);
      if (!hit) return;
      if (hit.target === "tectonic_plates") {
        if (getCurrentStage() !== 1) return;
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
    setRestartAvailable(false);
    resetPopupState();
    tectonicCollisionController.reset();
    resetPlacement();
  }

  function returnToMainMenu() {
    setStageInstructionVisible(false);
    setRestartAvailable(false);
    resetPopupState();
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
  const rockBadgeText = document.getElementById("rockBadgeText");

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
    nameElement: ui.stageName
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
      if (rockBadgeText) rockBadgeText.textContent = data.name;
      rockBadge.hidden = false;
      rockBadge.style.animation = "none";
      void rockBadge.offsetHeight;
      rockBadge.style.animation = "badgeSlideIn 350ms ease";
    }
  }

  function updateRockBadge(stageIndex) {
    const data = dataOverlayController.getStageData().find(s => s.index === stageIndex);
    if (!data || !rockBadge) return;
    if (rockBadgeText) rockBadgeText.textContent = data.name;
    rockBadge.hidden = false;
    rockBadge.style.animation = "none";
    void rockBadge.offsetHeight;
    rockBadge.style.animation = "badgeSlideIn 350ms ease";
  }

  function startLandingAssetPreload() {
    let warningCount = 0;
    startAssetPreload({
      urls: PRELOAD_ASSET_URLS,
      cacheName: PRELOAD_CACHE_NAME,
      onError(error, context = {}) {
        warningCount += 1;
        if (warningCount <= 3) {
          const url = context.url ? ` ${context.url}` : "";
          console.warn("Asset preload warning:" + url, error);
          if (window.__runtimeErrors) {
            window.__runtimeErrors.push("Asset preload warning:" + url + " " + error.message);
          }
        }
      },
      onComplete({ total, completed, failed }) {
        const loaded = completed - failed;
        setXRDebug(failed > 0
          ? `preloaded ${loaded}/${total} optional assets`
          : `preloaded ${total} optional assets`);
      }
    }).catch((error) => {
      console.warn("Asset preload failed:", error);
      if (window.__runtimeErrors) {
        window.__runtimeErrors.push("Asset preload failed: " + error.message);
      }
    });
  }
  init();

  function init() {
    initializeScene();
    interactionController.attach(state.renderer.domElement);
    startLandingAssetPreload();
    loadModels();

    audioManager.load();
    dataOverlayController.load();

    const subtitleEl = ui.subtitleDisplay;
    const subtitleToggle = ui.subtitleToggle;
    let subtitlesEnabled = true;
    let lastSubtitleText = "";
    let subtitlesMap = {};
    let tutorialsMap = {};
    fetch("config/subtitles.json")
      .then(r => r.json())
      .then(data => {
        subtitlesMap = data.subtitles || {};
        tutorialsMap = data.tutorials || {};
      })
      .catch(() => {});

    const PINCH_PHASE_CLIPS = new Set(["11a__.mp3", "11b__.mp3", "11c__.mp3"]);

    EventBus.on("clip_started", (data) => {
      if (!data || !data.clip) return;
      if (PINCH_PHASE_CLIPS.has(data.clip)) {
        tectonicCollisionController.setGesturePromptVisible(false);
      }
      if (!subtitleEl) return;
      const text = subtitlesMap[data.clip];
      lastSubtitleText = text || "";
      subtitleEl.textContent = lastSubtitleText;
      subtitleEl.hidden = !lastSubtitleText || !subtitlesEnabled;
      const tutorialText = tutorialsMap[data.clip];
      if (tutorialText) tutorialController.addMessage(tutorialText);
    });
    EventBus.on("clip_ended", (data) => {
      if (subtitleEl) { subtitleEl.hidden = true; lastSubtitleText = ""; }
      if (data && data.clip === "11a. 350.mp3") {
        EventBus.raise("tectonic_show_initial", {});
      }
      if (data && PINCH_PHASE_CLIPS.has(data.clip)) {
        tectonicCollisionController.setGesturePromptVisible(true);
      }
    });

    if (subtitleToggle) {
      subtitleToggle.addEventListener("click", () => {
        subtitlesEnabled = !subtitlesEnabled;
        subtitleToggle.classList.toggle("is-active", subtitlesEnabled);
        if (subtitleEl) {
          if (subtitlesEnabled && lastSubtitleText) {
            subtitleEl.textContent = lastSubtitleText;
            subtitleEl.hidden = false;
          } else {
            subtitleEl.hidden = true;
          }
        }
      });
      subtitleToggle.classList.add("is-active");
    }

    window.addEventListener("resize", onResize);
    startButtonController.initStartButtonController();
    ui.resetButton.addEventListener("click", reset);
    ui.menuButton.addEventListener("click", returnToMainMenu);
    initFormationSlider();
    rockBadge.hidden = true;

    ui.formationRange.addEventListener("input", (event) => {
      updateSliderTimeLabel(event.target.value);
    });

    if (ui.popupToggle) {
      ui.popupToggle.classList.remove("is-active");
      ui.popupToggle.addEventListener("click", () => {
        popupsEnabled = !popupsEnabled;
        ui.popupToggle.classList.toggle("is-active", popupsEnabled);
        applyLabelVisibility(getCurrentStage());
      });
    }
    if (ui.restartStageOneButton) {
      ui.restartStageOneButton.addEventListener("click", restartStageOne);
    }

    ui.startArButton.disabled = true;
    setFormationSliderVisible(false);
    setMenuLoading(0, "Checking", "Checking AR capability.");
    checkARSupport();

    EventBus.on("sequence_started", (data) => {
      if (data && isPinchPhaseSequence(data.trigger)) {
        tectonicCollisionController.setGesturePromptAudioSuppressed(true);
      }
    });
    EventBus.on("sequence_completed", (data) => {
      if (data && isPinchPhaseSequence(data.trigger)) {
        tectonicCollisionController.setGesturePromptAudioSuppressed(false);
      }
    });
    EventBus.on("tectonic_animation_complete", () => {
      tectonicCollisionController.setGesturePromptAudioSuppressed(false);
    });
      setRestartAvailable(getCurrentStage() === 1);

    EventBus.on("stage_changed", (data) => {
      if (data && typeof data.stage === "number") {
        tectonicCollisionController.handleStageChange(data.stage);
        updateRockBadge(data.stage);
        if (!userEnteredStage) {
        if (data.stage !== 1) setRestartAvailable(false);
          userEnteredStage = true;
          popupsEnabled = true;
          if (ui.popupToggle) ui.popupToggle.classList.add("is-active");
        }
        applyLabelVisibility(data.stage);
      }
    });
    EventBus.on("formation_placed", () => {
      tectonicCollisionController.attach(getTectonicPlacementOptions());
      resetPopupState({ hideControl: false });
      setRestartAvailable(false);
      if (ui.popupToggle) ui.popupToggle.hidden = false;
      updateSliderTimeLabel(0);
      ExperienceStateManager.setState(ExperienceState.SliderActive);
      if (state.formationLabels) {
        const colliders = state.formationLabels.__colliders || [];
        if (colliders.length > 0) {
          tapRaycaster.addTarget("formation_labels", colliders);
          _allMovingColliders.push(...colliders);
        }
      }
    });
    EventBus.on("raycast_hit", (data) => {
      if (!data) return;
      if (data.target === "formation_labels" && state.formationLabels) {
        const labelKey = data.meshName.replace("LabelCollider:", "");
        const sprite = state.formationLabels[labelKey];
        if (sprite) toggleLabelSprite(sprite);
      }
      if (data.target === "tectonic_labels") {
        const labelKey = data.meshName.replace("LabelCollider:", "");
        const entry = tectonicLabels.find(e => e.collider.name === "LabelCollider:" + labelKey);
        if (entry) toggleLabelSprite(entry.sprite);
      }
    });
    EventBus.on("tectonic_model_ready", () => {
      const plateMeshes = tectonicCollisionController.getPlateMeshes();
      if (plateMeshes.length > 0) {
        tapRaycaster.addTarget("tectonic_plates", plateMeshes);
      }
      const root = state.formationRoot;
      if (!root) return;
      const _box = new THREE.Box3();
      const _center = new THREE.Vector3();
      const _size = new THREE.Vector3();
      const _world = new THREE.Vector3();

      function worldToLocal(worldPos) {
        return root.worldToLocal(worldPos.clone());
      }

      function addTectonicLabel(text, mesh, zShift) {
        if (!mesh) return null;
        _box.setFromObject(mesh);
        _box.getCenter(_center);
        _box.getSize(_size);
        _world.set(_center.x, _center.y, _center.z + zShift * _size.z);
        const localPos = worldToLocal(_world);
        const { sprite, collider } = createStandaloneLabel(text, localPos, 0.1);
        root.add(sprite);
        root.add(collider);
        sprite.visible = false;
        collider.visible = false;
        tectonicLabels.push({ sprite, collider });
        return { sprite, collider };
      }

      const capaInferiorB = plateMeshes.find(m => m.name === "CapaInferiorB");
      const capaSuperiorB = plateMeshes.find(m => m.name === "CapaSuperiorB");
      const capaSuperiorA = plateMeshes.find(m => m.name === "CapaSuperiorA");

      addTectonicLabel("Avalonia", capaInferiorB, -0.3);
      addTectonicLabel("Armorika", capaSuperiorB, -0.3);
      if (capaSuperiorA) addTectonicLabel("Depth: ~340 mya", capaSuperiorA, 0);
      applyLabelVisibility(getCurrentStage());

      const tectonicColliders = tectonicLabels.map(({ collider }) => collider);
      if (tectonicColliders.length > 0) {
        tapRaycaster.addTarget("tectonic_labels", tectonicColliders);
      }
      function repositionFormationLabel(key, targetMesh) {
        if (!targetMesh || !state.formationLabels) return;
        const sprite = state.formationLabels[key];
        const collider = state.formationLabels.__colliders.find(c => c.userData.labelKey === key);
        if (!sprite || !collider) return;
        _box.setFromObject(targetMesh);
        _box.getCenter(_center);
        _world.set(_center.x, _center.y, _center.z);
        const localPos = worldToLocal(_world);
        collider.userData.originalPosition.copy(localPos);
        collider.position.copy(localPos);
        sprite.position.copy(localPos);
      }

      repositionFormationLabel("1st Stage Rock#depth", capaSuperiorA);

      const _spherePos = new THREE.Vector3();
      if (tectonicCollisionController.getSphereWorldPosition(_spherePos)) {
        const localPos = worldToLocal(_spherePos);
        const compKey = "1st Stage Rock#comp";
        const compSprite = state.formationLabels[compKey];
        const compCollider = state.formationLabels.__colliders.find(c => c.userData.labelKey === compKey);
        if (compSprite && compCollider) {
          compCollider.userData.originalPosition.copy(localPos);
          compCollider.position.copy(localPos);
          compSprite.position.copy(localPos);
        }
      }
    });
    EventBus.on("alignment_quality", (data) => {
      if (data && data.quality > 0.95) {
        ExperienceStateManager.setState(ExperienceState.Aligned);
      }
    });

    EventBus.on("next_chapter", () => {
      tectonicCollisionController.setGesturePromptVisible(true);
      ExperienceStateManager.setState(ExperienceState.PinchReady);
      const p = dataOverlayController.getPinchData();
      if (p && rockBadge) {
        if (rockBadgeText) rockBadgeText.textContent = p.name;
        rockBadge.hidden = false;
        rockBadge.style.animation = "none";
        void rockBadge.offsetHeight;
        rockBadge.style.animation = "badgeSlideIn 350ms ease";
      }
    });

    EventBus.on("sequence_completed", (ev) => {
      if (ev && ev.trigger === "state:Stage1") {
        EventBus.raise("next_chapter", {});
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
      setRestartAvailable(false);
      resetPopupState();
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

    state.camera.projectionMatrixInverse.copy(state.camera.projectionMatrix).invert();

    const root = state.formationRoot;
    if (root) {
      const _camWorld = new THREE.Vector3();
      const _camLocal = new THREE.Vector3();
      const _dir = new THREE.Vector3();
      state.camera.getWorldPosition(_camWorld);
      root.worldToLocal(_camLocal.copy(_camWorld));
      if (state.formationLabels && state.formationLabels["__rock_comp#comp"]) {
        const rockSample = state.placementReticle?.getObjectByName("PolyCam Rock Sample");
        if (rockSample) {
          rockSample.getWorldPosition(_camWorld);
          root.worldToLocal(_dir.copy(_camWorld));
          const compCollider = _allMovingColliders.find(c => c.userData.labelKey === "__rock_comp#comp");
          if (compCollider) compCollider.userData.originalPosition.copy(_dir);
        }
      }
      _allMovingColliders.forEach(c => {
        if (!c.visible || !c.userData.originalPosition) return;
        _dir.copy(_camLocal).sub(c.userData.originalPosition).normalize();
        c.position.copy(c.userData.originalPosition).addScaledVector(_dir, LABEL_PUSH);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _dir);
        const dist = _camLocal.distanceTo(c.userData.originalPosition);
        const rScale = THREE.MathUtils.clamp(dist * 0.08, 0.08, 0.35);
        c.scale.set(rScale / 0.12, rScale / 0.12, 1);
        const sprite = state.formationLabels && state.formationLabels[c.userData.labelKey];
        if (sprite) sprite.position.copy(c.position);
      });
      tectonicLabels.forEach(({ sprite, collider }) => {
        if (!collider.userData.originalPosition) return;
        const base = collider.userData.originalPosition;
        _dir.copy(_camLocal).sub(base).normalize();
        collider.position.copy(base).addScaledVector(_dir, LABEL_PUSH);
        collider.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _dir);
        sprite.position.copy(base).addScaledVector(_dir, LABEL_PUSH);
      });
    }

    state.renderer.render(state.scene, state.camera);
  }
})();
