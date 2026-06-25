import * as THREE from "three";
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

  function checkARSupport() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      setXRDebug("navigator.xr unavailable");
      state.arSupportChecked = true;
      state.arSupported = false;
      refreshReadyState();
      return;
    }

    navigator.xr.isSessionSupported("immersive-ar")
      .then((supported) => {
        state.arSupportChecked = true;
        state.arSupported = supported;
        setXRDebug(supported ? "immersive-ar supported" : "immersive-ar unsupported");
        refreshReadyState();
      })
      .catch(() => {
        state.arSupportChecked = true;
        state.arSupported = false;
        setXRDebug("immersive-ar support check failed");
        refreshReadyState();
      });
  }

  async function startARSession() {
    if (state.modelLoadError) {
      setMenuLoading(100, "Error", "Boulder model failed to load. Refresh after checking the Assets folder.");
      return;
    }

    if (!state.modelsLoaded) {
      setMenuLoading(60, "Loading", "Loading boulder model. Wait a moment, then start Camera AR.");
      return;
    }

    if (!navigator.xr) {
      setMenuLoading(100, "Blocked", "WebXR is not available in this browser.");
      return;
    }

    setXRDebug("requesting raw immersive-ar");
    updateHud("Requesting Camera AR. Grant camera permission.");
    document.body.classList.add("in-camera-ar");

    let waitingMessageTimer = null;
    try {
      const sessionInit = {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["anchors", "dom-overlay"],
        domOverlay: { root: ui.overlay }
      };
      ui.startArButton.disabled = true;
      waitingMessageTimer = window.setTimeout(() => {
        updateHud("Camera permission looks active. Still waiting for WebXR to finish starting.");
        setXRDebug("requestSession still pending");
      }, 8000);
      const session = await navigator.xr.requestSession("immersive-ar", sessionInit);
      window.clearTimeout(waitingMessageTimer);
      updateHud("Camera AR permission granted. Preparing world tracking.");
      setXRDebug("AR session granted");
      await onSessionStarted(session);
    } catch (error) {
      setXRDebug("AR request failed: " + error.name);
      if (waitingMessageTimer) {
        window.clearTimeout(waitingMessageTimer);
      }
      document.body.classList.remove("in-camera-ar");
      setMenuLoading(state.modelsLoaded ? 100 : 60, "Error", "Camera AR request failed: " + error.name);
      ui.startArButton.disabled = false;
    }
  }

  async function onSessionStarted(session) {
    state.xrSession = session;
    state.xrSession.addEventListener("end", onSessionEnded);

    updateHud("Preparing AR world space.");
    setXRDebug("requesting local reference space");
    state.xrReferenceSpace = await session.requestReferenceSpace("local");
    if (state.renderer.xr.setReferenceSpace) {
      state.renderer.xr.setReferenceSpace(state.xrReferenceSpace);
    }

    updateHud("Preparing AR renderer.");
    setXRDebug("binding session to renderer");
    await state.renderer.xr.setSession(session);
    updateHud("Preparing plane detection.");
    setXRDebug("requesting viewer reference space");
    state.xrViewerSpace = await session.requestReferenceSpace("viewer");
    setXRDebug("requesting hit-test source");
    state.xrHitTestSource = await session.requestHitTestSource({ space: state.xrViewerSpace });

    state.domOverlayActive = Boolean(session.domOverlayState && session.domOverlayState.type);
    document.body.classList.add("in-camera-ar");
    document.body.classList.toggle("has-dom-overlay", state.domOverlayActive);
    setMenuButtonVisible(true);
    setXrHudVisible(shouldUseXrFallbackHud());
    setGeoStatusVisible(true);
    captureCompassHeading();
    startLocationTracking();
    updateSunLightFromDeviceLocation();
    updateGeoStatus();
    setXRDebug("hit-test source ready");
    setScanPromptVisible(true);
    setStartFromHereVisible(true);
    setStartFromHereReady(false);
    setFormationSliderVisible(false);
    updateHud("Scanning for a flat surface.");
  }

  function onSessionEnded() {
    if (state.xrHitTestSource && state.xrHitTestSource.cancel) {
      state.xrHitTestSource.cancel();
    }

    state.xrSession = null;
    state.xrReferenceSpace = null;
    state.xrViewerSpace = null;
    state.xrHitTestSource = null;
    releasePlacementAnchor();
    state.latestHit = null;
    state.latestHitResult = null;
    state.reticle.visible = false;
    state.planeIndicator.visible = false;
    document.body.classList.remove("in-camera-ar");
    document.body.classList.remove("has-dom-overlay");
    state.domOverlayActive = false;
    setMenuButtonVisible(false);
    setXrHudVisible(false);
    setGeoStatusVisible(false);
    setScanPromptVisible(false);
    setStartFromHereVisible(false);
    stopLocationTracking();
    ui.startArButton.disabled = state.modelLoadError || !state.modelsLoaded;
    refreshReadyState();
    setXRDebug("AR session ended");
  }

  async function startFromDetectedPlane() {
    if (state.bouldersPlaced) {
      return;
    }

    if (!state.modelsLoaded) {
      updateHud("Loading boulder model. Try placing after it finishes loading.");
      return;
    }

    if (!state.latestHit) {
      bounceScanPrompt();
      updateHud("Tap ignored: no detected plane yet. Wait for the green grid.");
      return;
    }

    const placementGate = getPlacementGateStatus();
    if (!placementGate.allowed) {
      updateHud(placementGate.message);
      setXRDebug(placementGate.debug);
      return;
    }

    const anchor = await createPlacementAnchor();
    ui.startFromHereButton.disabled = true;
    placeBoulders(state.latestHit.position, anchor);
  }

  function render(time, frame) {
    const deltaSeconds = state.lastTime ? Math.min((time - state.lastTime) / 1000, 0.05) : 0;
    state.lastTime = time;

    if (frame) {
      updateHitTest(frame);
      updatePlacementFromAnchor(frame);
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

  function updateHitTest(frame) {
    if (!state.xrHitTestSource || !state.xrReferenceSpace || state.bouldersPlaced) {
      if (!state.bouldersPlaced && performance.now() - state.lastScanDebugTime > 900) {
        state.lastScanDebugTime = performance.now();
        setXRDebug("waiting for hit-test setup");
      }
      return;
    }

    const results = frame.getHitTestResults(state.xrHitTestSource);
    if (!results.length) {
      state.noHitFrames += 1;
      state.latestHit = null;
      state.latestHitResult = null;
      state.reticle.visible = false;
      state.planeIndicator.visible = false;
      setScanPromptVisible(true);
      setStartFromHereVisible(true);
      setStartFromHereReady(false);

      if (performance.now() - state.lastScanDebugTime > 900) {
        state.lastScanDebugTime = performance.now();
        setXRDebug("scanning, no plane hit (" + state.noHitFrames + ")");
        updateHud("Scanning: no plane hit yet. Move slowly over a textured desk/floor.");
      }
      return;
    }

    const hit = results[0];
    const pose = hit.getPose(state.xrReferenceSpace);
    if (!pose) {
      return;
    }

    state.hitFrames += 1;
    state.noHitFrames = 0;
    state.latestHitResult = hit;
    state.latestHit = poseFromMatrix(pose.transform.matrix);

    state.reticle.position.copy(state.latestHit.position);
    state.reticle.quaternion.copy(state.latestHit.quaternion);
    state.reticle.visible = true;

    state.planeIndicator.position.copy(state.latestHit.position);
    state.planeIndicator.quaternion.copy(state.latestHit.quaternion);
    state.planeIndicator.visible = true;

    setXRDebug("PLANE DETECTED (" + state.hitFrames + ")");
    updateHud("Plane detected.");
    setStartFromHereVisible(true);
    setStartFromHereReady(true);
  }

  function poseFromMatrix(xrMatrix) {
    const matrix = new THREE.Matrix4().fromArray(xrMatrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    return { matrix, position, quaternion };
  }

  async function createPlacementAnchor() {
    if (!state.latestHitResult || typeof state.latestHitResult.createAnchor !== "function") {
      return null;
    }

    try {
      const anchor = await state.latestHitResult.createAnchor();
      return anchor && anchor.anchorSpace ? anchor : null;
    } catch (error) {
      setXRDebug("anchor unavailable: " + error.name);
      return null;
    }
  }

  function updatePlacementFromAnchor(frame) {
    if (!state.xrPlacementAnchorSpace || !state.xrReferenceSpace || !state.bouldersRoot) {
      return;
    }

    const pose = frame.getPose(state.xrPlacementAnchorSpace, state.xrReferenceSpace);
    if (!pose) {
      return;
    }

    const anchoredPose = poseFromMatrix(pose.transform.matrix);
    const previousPlaneHeight = state.planeHeight;
    state.placementCenter.copy(anchoredPose.position);
    state.planeHeight = anchoredPose.position.y;
    updateBoulderPlacement();

    if (state.shadowReceiver) {
      state.shadowReceiver.position.copy(anchoredPose.position);
      state.shadowReceiver.position.y += 0.004;
    }

    if (state.floatingObject && !state.floatingObjectTriggered) {
      const heightDelta = state.planeHeight - previousPlaneHeight;
      state.floatingObjectBaseWorldPosition.y += heightDelta;
      state.floatingObjectTargetWorldPosition.y += heightDelta;
    }
  }

  function releasePlacementAnchor() {
    if (state.xrPlacementAnchor && typeof state.xrPlacementAnchor.delete === "function") {
      state.xrPlacementAnchor.delete();
    }
    state.xrPlacementAnchor = null;
    state.xrPlacementAnchorSpace = null;
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
