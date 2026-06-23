import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ArMarkerControls, ArToolkitContext, ArToolkitSource } from "threex";

(function () {
  window.__runtimeErrors = [];
  window.addEventListener("error", (event) => {
    window.__runtimeErrors.push(event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    window.__runtimeErrors.push(String(event.reason));
  });

  const CONFIG = {
    modelFootprintMeters: 2.5,
    floatingObjectTargetHeightMeters: 1.0,
    modelFadeInDurationSeconds: 2,
    floatingObjectStartDelayMs: 5000,
    floatingObjectRiseDurationSeconds: 3,
    sceneFadeOutDurationSeconds: 2,
    childRevealDurationSeconds: 2,
    dustRevealDurationSeconds: 2,
    formationTransitionDurationSeconds: 2,
    allowedLocations: [
      { latitude: 49.90000549974582, longitude: 8.85554978661026 },
      { latitude: 49.8686172198458, longitude: 8.649528051715288 }
    ],
    allowedLocationRadiusMeters: 25
  };

  const MARKER_CALIBRATION = {
    physicalWidthMeters: 0.15,
    positionMeters: new THREE.Vector3(-0.3048, 0, 0),
    rotationDegrees: new THREE.Vector3(0, 0, 0),
    scale: 1,
    shadowPlaneSizeMeters: 4,
    shadowPlaneYOffsetMeters: 0.004
  };

  const MARKER_TRACKING = {
    stableDetectionFrames: 6,
    lossTimeoutMs: 900,
    positionSmoothing: 0.38,
    rotationSmoothing: 0.34,
    sourceWidth: 640,
    sourceHeight: 480,
    detectionWidth: 480,
    detectionHeight: 360,
    maxDetectionRate: 30
  };

  const state = {
    scene: null,
    camera: null,
    renderer: null,
    arToolkitSource: null,
    arToolkitContext: null,
    markerControls: null,
    rawMarkerRoot: null,
    trackingRoot: null,
    calibrationRoot: null,
    cameraActive: false,
    cameraInitialized: false,
    markerStable: false,
    hasStableMarkerPose: false,
    markerTrackingPaused: false,
    markerConsecutiveDetections: 0,
    markerLastSeenAt: 0,
    markerLossDurationMs: 0,
    rawMarkerPosition: new THREE.Vector3(),
    rawMarkerQuaternion: new THREE.Quaternion(),
    smoothedMarkerPosition: new THREE.Vector3(),
    smoothedMarkerQuaternion: new THREE.Quaternion(),
    sunLight: null,
    shadowReceiver: null,
    modelAssets: null,
    bouldersRoot: null,
    floatingObject: null,
    floatingObjectBasePosition: new THREE.Vector3(),
    floatingObjectTargetPosition: new THREE.Vector3(),
    floatingObjectPlacedAtTime: 0,
    floatingObjectTriggered: false,
    floatingObjectRiseProgress: 0,
    foundationFadeStarted: false,
    foundationFadeMeshes: [],
    floatingObjectRevealMeshes: [],
    floatingObjectRevealStarted: false,
    dustObject: null,
    dustRevealQueued: false,
    dustRevealMeshes: [],
    dustRevealComplete: false,
    stageRockObjects: { 1: null, 2: null, 3: null },
    stageRockMeshes: { 1: [], 2: [], 3: [] },
    visibleFormationStage: 5,
    stageTransitionActive: false,
    fadeTasks: [],
    formationStep: 4,
    childRevealRequested: false,
    arSupportChecked: false,
    arSupported: false,
    assetProgress: 0,
    modelsLoaded: false,
    modelLoadError: false,
    placementCenter: new THREE.Vector3(),
    bouldersPlaced: false,
    animationStarted: false,
    animationComplete: false,
    lastTime: 0,
    debugMode: new URLSearchParams(window.location.search).has("debug"),
    lastDebugUpdateAt: 0,
    compassHeadingDegrees: null,
    userPosition: null,
    userPositionError: null,
    geolocationWatchId: null,
    sunDirection: new THREE.Vector3(-0.3, 0.8, 0.5).normalize(),
    lastSunPosition: null,
    sunReady: false
  };

  const ui = {
    mainMenu: document.getElementById("mainMenu"),
    canvasRoot: document.getElementById("canvasRoot"),
    overlay: document.getElementById("overlay"),
    statusText: document.getElementById("statusText"),
    loadingFill: document.getElementById("loadingFill"),
    loadingStateLabel: document.getElementById("loadingStateLabel"),
    trackingStatus: document.getElementById("trackingStatus"),
    markerGuide: document.getElementById("markerGuide"),
    markerDebug: document.getElementById("markerDebug"),
    heightValue: document.getElementById("heightValue"),
    separationValue: document.getElementById("separationValue"),
    arDebugText: document.getElementById("arDebugText"),
    startArButton: document.getElementById("startArButton"),
    resetButton: document.getElementById("resetButton"),
    menuButton: document.getElementById("menuButton"),
    bottomUi: document.querySelector(".bottom-ui"),
    formationSlider: document.getElementById("formationSlider"),
    formationRange: document.getElementById("formationRange"),
    formationFill: document.querySelector(".formation-fill"),
    formationStages: Array.from(document.querySelectorAll(".formation-stage")),
    formationDots: Array.from(document.querySelectorAll(".formation-dot")),
    geoStatus: document.getElementById("geoStatus"),
    geoDistanceValue: document.getElementById("geoDistanceValue"),
    geoHeadingValue: document.getElementById("geoHeadingValue"),
    geoGateValue: document.getElementById("geoGateValue")
  };

  init();

  function init() {
    state.scene = new THREE.Scene();
    state.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(window.devicePixelRatio);
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    ui.canvasRoot.appendChild(state.renderer.domElement);

    addLights();
    loadBoulderModel();

    window.addEventListener("resize", onResize);
    ui.startArButton.addEventListener("click", startMarkerCamera);
    ui.resetButton.addEventListener("click", reset);
    ui.menuButton.addEventListener("click", returnToMainMenu);
    initFormationSlider();

    ui.startArButton.disabled = true;
    setFormationSliderVisible(false);
    setMenuLoading(0, "Checking", "Checking camera capability.");
    checkARSupport();
    installDebugHooks();
    state.renderer.setAnimationLoop(render);
  }

  function initFormationSlider() {
    if (!ui.formationRange || !ui.formationSlider) {
      return;
    }

    const snapThreshold = 0.16;
    let gestureStartStep = state.formationStep;
    let gestureCommitted = false;

    const applySliderValue = (rawValue, shouldSnap) => {
      const numericValue = THREE.MathUtils.clamp(Number(rawValue) || 0, 0, 4);
      const nearestStep = Math.round(numericValue);
      const snappedValue = shouldSnap
        ? nearestStep
        : Math.abs(numericValue - nearestStep) <= snapThreshold
          ? nearestStep
          : numericValue;
      const displayStep = Math.round(snappedValue);
      const progressPercent = (snappedValue / 4) * 100;

      ui.formationRange.value = snappedValue.toFixed(3);
      if (ui.formationFill) {
        ui.formationFill.style.width = progressPercent + "%";
      }

      ui.formationStages.forEach((stage, index) => {
        stage.classList.toggle("is-active", index === displayStep);
      });
      ui.formationDots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === displayStep);
      });

      if (shouldSnap && displayStep !== state.formationStep) {
        const previousStep = state.formationStep;
        state.formationStep = displayStep;
        onFormationStepSelected(state.formationStep, previousStep);
      }
    };

    const commitSliderGesture = (rawValue) => {
      if (gestureCommitted) {
        return;
      }

      gestureCommitted = true;
      const requestedStep = Math.round(THREE.MathUtils.clamp(Number(rawValue) || 0, 0, 4));
      const adjacentStep = THREE.MathUtils.clamp(
        requestedStep,
        gestureStartStep - 1,
        gestureStartStep + 1
      );
      applySliderValue(adjacentStep, true);
    };

    state.setFormationSliderValue = applySliderValue;

    ui.formationRange.addEventListener("pointerdown", () => {
      gestureStartStep = state.formationStep;
      gestureCommitted = false;
      ui.formationSlider.classList.remove("is-prompting");
      ui.formationSlider.classList.add("is-dragging");
    });

    ui.formationRange.addEventListener("input", (event) => {
      applySliderValue(event.target.value, false);
    });

    ui.formationRange.addEventListener("change", (event) => {
      if (!gestureCommitted && !ui.formationSlider.classList.contains("is-dragging")) {
        gestureStartStep = state.formationStep;
      }
      commitSliderGesture(event.target.value);
    });

    ui.formationRange.addEventListener("keydown", () => {
      gestureStartStep = state.formationStep;
      gestureCommitted = false;
    });

    window.addEventListener("pointerup", () => {
      if (!ui.formationSlider.classList.contains("is-dragging")) {
        return;
      }

      ui.formationSlider.classList.remove("is-dragging");
      commitSliderGesture(ui.formationRange.value);
    });

    window.addEventListener("pointercancel", () => {
      ui.formationSlider.classList.remove("is-dragging");
      commitSliderGesture(ui.formationRange.value);
    });

    ui.formationSlider.classList.add("is-prompting");
    applySliderValue(4, true);
  }

  function onFormationStepSelected(stepIndex, previousStep) {
    window.__formationSliderStep = stepIndex;
    if (stepIndex === 3) {
      startFloatingObjectChildrenReveal();
    } else if (stepIndex < previousStep) {
      processFormationStage();
    }
  }

  async function loadBoulderModel() {
    const loader = new GLTFLoader();
    const assetVersion = Date.now();
    const assetUrl = (fileName) => "Assets/" + fileName + "?v=" + assetVersion;

    try {
      setMenuLoading(18, "Loading", "Downloading assets.");
      const boulders = await loader.loadAsync(
        assetUrl("Boulders%20on%20Ground.glb"),
        (event) => {
          if (!event.lengthComputable || !event.total) {
            setMenuLoading(42, "Loading", "Downloading assets.");
            return;
          }

          state.assetProgress = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
          setMenuLoading(18 + state.assetProgress * 62, "Loading", "Downloading assets.");
        }
      );

      state.modelAssets = {
        boulders
      };
      state.modelsLoaded = true;
      ui.startArButton.disabled = false;
      refreshReadyState();
    } catch (error) {
      state.modelLoadError = true;
      ui.startArButton.disabled = true;
      setARDebug("model load failed");
      setMenuLoading(100, "Error", "Could not load the boulder model. Check the Assets folder and refresh.");
      window.__runtimeErrors.push("Boulder model load failed: " + error.message);
    }
  }

  function setMenuLoading(percent, label, message) {
    const clampedPercent = THREE.MathUtils.clamp(percent, 0, 100);
    if (ui.loadingFill) {
      ui.loadingFill.style.width = clampedPercent.toFixed(1) + "%";
    }
    if (ui.loadingStateLabel) {
      ui.loadingStateLabel.textContent = label;
    }
    if (message) {
      updateHud(message);
    }
  }

  function refreshReadyState() {
    if (state.modelLoadError) {
      ui.startArButton.disabled = true;
      setMenuLoading(100, "Error", "Could not load assets.");
      return;
    }

    if (!state.arSupportChecked) {
      ui.startArButton.disabled = true;
      setMenuLoading(Math.max(12, state.assetProgress * 80), "Checking", "Checking camera capability.");
      return;
    }

    if (!state.arSupported) {
      ui.startArButton.disabled = true;
      setMenuLoading(100, "Blocked", "Camera AR requires HTTPS and camera permission.");
      return;
    }

    if (!state.modelsLoaded) {
      ui.startArButton.disabled = true;
      setMenuLoading(18 + state.assetProgress * 62, "Loading", "Downloading assets.");
      return;
    }

    ui.startArButton.disabled = false;
    setMenuLoading(100, "Ready", "You Are Ready to Go.");
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
          floatingObjectTargetY: state.floatingObjectTargetPosition.y,
          cameraInitialized: state.cameraInitialized,
          markerIdDetected: state.rawMarkerRoot && state.rawMarkerRoot.visible ? 0 : null,
          markerStable: state.markerStable,
          markerLossDurationMs: state.markerLossDurationMs,
          bouldersParentChain: getParentChain(state.bouldersRoot),
          rawMarkerPosition: vectorToPlainObject(state.rawMarkerPosition),
          smoothedMarkerPosition: vectorToPlainObject(state.smoothedMarkerPosition),
          bouldersWorldPosition: getWorldPositionSnapshot(state.bouldersRoot),
          calibrationWorldPosition: getWorldPositionSnapshot(state.calibrationRoot),
          calibrationOffset: vectorToPlainObject(MARKER_CALIBRATION.positionMeters),
          markerWidthMeters: MARKER_CALIBRATION.physicalWidthMeters
        };
      },
      placeAtOrigin() {
        if (!state.modelsLoaded) {
          return false;
        }

        if (state.bouldersPlaced) {
          reset();
        }

        if (!state.trackingRoot) {
          state.trackingRoot = new THREE.Group();
          state.calibrationRoot = new THREE.Group();
          applyMarkerCalibration();
          state.trackingRoot.add(state.calibrationRoot);
          state.scene.add(state.trackingRoot);
        }
        state.trackingRoot.visible = true;
        placeBoulders();
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

  function addLights() {
    state.scene.add(new THREE.HemisphereLight(0xf8fbff, 0x293241, 1.15));
    state.sunLight = new THREE.DirectionalLight(0xffffff, 2.1);
    state.sunLight.position.set(-1.4, 4, 2.4);
    state.sunLight.castShadow = true;
    state.sunLight.shadow.mapSize.set(1024, 1024);
    state.sunLight.shadow.camera.near = 0.01;
    state.sunLight.shadow.camera.far = 12;
    state.sunLight.shadow.camera.left = -4;
    state.sunLight.shadow.camera.right = 4;
    state.sunLight.shadow.camera.top = 4;
    state.sunLight.shadow.camera.bottom = -4;
    state.scene.add(state.sunLight);
    state.scene.add(state.sunLight.target);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  function onResize() {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    resizeMarkerCamera();
  }

  function checkARSupport() {
    state.arSupportChecked = true;
    state.arSupported = Boolean(
      window.isSecureContext &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
    setARDebug(state.arSupported ? "camera API supported" : "secure camera API unavailable");
    refreshReadyState();
  }

  async function startMarkerCamera() {
    if (state.modelLoadError) {
      setMenuLoading(100, "Error", "Boulder model failed to load. Refresh after checking the Assets folder.");
      return;
    }

    if (!state.modelsLoaded) {
      setMenuLoading(60, "Loading", "Loading boulder model. Wait a moment, then start Camera AR.");
      return;
    }

    if (!state.arSupported) {
      setMenuLoading(100, "Blocked", "Camera AR requires HTTPS and browser camera access.");
      return;
    }

    if (state.cameraActive) {
      return;
    }

    setARDebug("starting camera");
    updateHud("Starting camera");
    document.body.classList.add("in-camera-ar");
    setMenuButtonVisible(true);
    setFormationSliderVisible(false);
    setMarkerGuideVisible(true);
    setTrackingStatus("Starting camera");
    ui.startArButton.disabled = true;

    try {
      await initializeMarkerTracking();
      state.cameraActive = true;
      state.cameraInitialized = true;
      captureCompassHeading();
      startLocationTracking();
      updateSunLightFromDeviceLocation();
      updateGeoStatus();
      setARDebug("camera initialized");
      setTrackingStatus("Looking for marker");
      updateHud("Looking for marker");
    } catch (error) {
      stopMarkerCamera();
      setARDebug("camera start failed: " + (error.name || "Error"));
      document.body.classList.remove("in-camera-ar");
      setMenuButtonVisible(false);
      setMarkerGuideVisible(false);
      setTrackingStatus("");
      setMenuLoading(100, "Error", "Camera start failed: " + (error.message || error.name));
      ui.startArButton.disabled = false;
    }
  }

  async function initializeMarkerTracking() {
    state.rawMarkerRoot = new THREE.Group();
    state.rawMarkerRoot.name = "Raw Marker 0";
    state.rawMarkerRoot.visible = false;
    state.scene.add(state.rawMarkerRoot);

    state.trackingRoot = new THREE.Group();
    state.trackingRoot.name = "Smoothed Marker Root";
    state.trackingRoot.visible = false;
    state.scene.add(state.trackingRoot);

    state.calibrationRoot = new THREE.Group();
    state.calibrationRoot.name = "Marker Calibration Root";
    applyMarkerCalibration();
    state.trackingRoot.add(state.calibrationRoot);

    state.arToolkitSource = new ArToolkitSource({
      sourceType: "webcam",
      sourceWidth: MARKER_TRACKING.sourceWidth,
      sourceHeight: MARKER_TRACKING.sourceHeight,
      displayWidth: window.innerWidth,
      displayHeight: window.innerHeight
    });
    await new Promise((resolve, reject) => {
      state.arToolkitSource.init(resolve, reject);
    });

    state.arToolkitSource.domElement.classList.add("ar-camera-feed");
    state.arToolkitSource.domElement.setAttribute("playsinline", "");
    state.arToolkitSource.domElement.muted = true;
    await waitForCameraVideo(state.arToolkitSource.domElement);

    state.arToolkitContext = new ArToolkitContext({
      cameraParametersUrl: "vendor/arjs/camera_para.dat",
      detectionMode: "mono_and_matrix",
      matrixCodeType: "4x4_BCH_13_5_5",
      canvasWidth: MARKER_TRACKING.detectionWidth,
      canvasHeight: MARKER_TRACKING.detectionHeight,
      maxDetectionRate: MARKER_TRACKING.maxDetectionRate
    });
    state.markerControls = new ArMarkerControls(
      state.arToolkitContext,
      state.rawMarkerRoot,
      {
        type: "barcode",
        barcodeValue: 0,
        size: MARKER_CALIBRATION.physicalWidthMeters,
        changeMatrixMode: "modelViewMatrix"
      }
    );

    await new Promise((resolve) => state.arToolkitContext.init(resolve));
    state.camera.projectionMatrix.copy(state.arToolkitContext.getProjectionMatrix());
    state.camera.projectionMatrixInverse.copy(state.camera.projectionMatrix).invert();
    resizeMarkerCamera();
  }

  function waitForCameraVideo(video) {
    if (video.videoWidth && video.videoHeight) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const finish = () => {
        video.removeEventListener("loadedmetadata", finish);
        video.removeEventListener("canplay", finish);
        resolve();
      };
      video.addEventListener("loadedmetadata", finish, { once: true });
      video.addEventListener("canplay", finish, { once: true });
      window.setTimeout(finish, 3000);
    });
  }

  function applyMarkerCalibration() {
    if (!state.calibrationRoot) {
      return;
    }

    state.calibrationRoot.position.copy(MARKER_CALIBRATION.positionMeters);
    state.calibrationRoot.rotation.set(
      THREE.MathUtils.degToRad(MARKER_CALIBRATION.rotationDegrees.x),
      THREE.MathUtils.degToRad(MARKER_CALIBRATION.rotationDegrees.y),
      THREE.MathUtils.degToRad(MARKER_CALIBRATION.rotationDegrees.z)
    );
    state.calibrationRoot.scale.setScalar(MARKER_CALIBRATION.scale);
  }

  function resizeMarkerCamera() {
    if (!state.arToolkitSource || !state.arToolkitSource.ready) {
      return;
    }

    state.arToolkitSource.onResizeElement();
    state.arToolkitSource.copyElementSizeTo(state.renderer.domElement);
    if (state.arToolkitContext && state.arToolkitContext.arController) {
      state.arToolkitSource.copyElementSizeTo(state.arToolkitContext.arController.canvas);
    }
  }

  function render(time) {
    const deltaSeconds = state.lastTime ? Math.min((time - state.lastTime) / 1000, 0.05) : 0;
    state.lastTime = time;

    if (
      state.cameraActive &&
      state.arToolkitSource &&
      state.arToolkitSource.ready &&
      state.arToolkitContext
    ) {
      state.arToolkitContext.update(state.arToolkitSource.domElement);
      updateMarkerTracking(time, deltaSeconds);
    }

    if (state.bouldersPlaced && !state.markerTrackingPaused) {
      updateFloatingObject(deltaSeconds);
      updateFadeTasks(deltaSeconds);
    }

    state.renderer.render(state.scene, state.camera);
  }

  function updateMarkerTracking(time, deltaSeconds) {
    const markerDetected = Boolean(state.rawMarkerRoot && state.rawMarkerRoot.visible);

    if (markerDetected) {
      state.markerLastSeenAt = time;
      state.markerLossDurationMs = 0;
      state.markerConsecutiveDetections += 1;
      readRawMarkerPose();

      if (state.markerConsecutiveDetections < MARKER_TRACKING.stableDetectionFrames) {
        setTrackingStatus("Stabilizing tracking");
        updateHud("Stabilizing tracking");
      } else {
        const initializePose = !state.hasStableMarkerPose;
        const firstStableDetection = !state.markerStable;
        state.markerStable = true;
        state.markerTrackingPaused = false;
        smoothMarkerPose(deltaSeconds, initializePose);
        state.hasStableMarkerPose = true;
        state.trackingRoot.visible = true;
        setMarkerGuideVisible(false);
        setTrackingStatus("Tracking marker");
        updateHud(firstStableDetection ? "Marker detected" : "Tracking marker");

        if (!state.bouldersPlaced) {
          placeBoulders();
        }
      }
    } else {
      state.markerConsecutiveDetections = 0;
      state.markerLossDurationMs = state.markerLastSeenAt ? time - state.markerLastSeenAt : 0;

      if (state.markerStable || (state.trackingRoot && state.trackingRoot.visible)) {
        setTrackingStatus("Marker lost");
        updateHud("Marker lost");
        if (state.markerLossDurationMs >= MARKER_TRACKING.lossTimeoutMs) {
          state.markerStable = false;
          state.markerTrackingPaused = true;
          state.trackingRoot.visible = false;
          setMarkerGuideVisible(true);
        }
      } else {
        setTrackingStatus("Looking for marker");
        updateHud("Looking for marker");
        setMarkerGuideVisible(true);
      }
    }

    if (state.markerStable) {
      state.trackingRoot.getWorldPosition(state.placementCenter);
      positionSunLightAt(state.placementCenter);
    }
    updateMarkerDebug(time);
  }

  function readRawMarkerPose() {
    state.rawMarkerRoot.updateMatrixWorld(true);
    state.rawMarkerRoot.matrix.decompose(
      state.rawMarkerPosition,
      state.rawMarkerQuaternion,
      new THREE.Vector3()
    );
  }

  function smoothMarkerPose(deltaSeconds, initializePose) {
    if (initializePose) {
      state.smoothedMarkerPosition.copy(state.rawMarkerPosition);
      state.smoothedMarkerQuaternion.copy(state.rawMarkerQuaternion);
    } else {
      const frameScale = Math.max(deltaSeconds * 60, 0.1);
      const positionAlpha = 1 - Math.pow(1 - MARKER_TRACKING.positionSmoothing, frameScale);
      const rotationAlpha = 1 - Math.pow(1 - MARKER_TRACKING.rotationSmoothing, frameScale);
      state.smoothedMarkerPosition.lerp(state.rawMarkerPosition, positionAlpha);
      state.smoothedMarkerQuaternion.slerp(state.rawMarkerQuaternion, rotationAlpha);
    }

    state.trackingRoot.position.copy(state.smoothedMarkerPosition);
    state.trackingRoot.quaternion.copy(state.smoothedMarkerQuaternion);
    state.trackingRoot.updateMatrixWorld(true);
  }

  function stopMarkerCamera() {
    if (state.arToolkitSource && state.arToolkitSource.dispose) {
      state.arToolkitSource.dispose();
    }

    if (state.markerControls && state.markerControls.dispose) {
      state.markerControls.dispose();
    }
    if (
      state.arToolkitContext &&
      state.arToolkitContext.arController &&
      state.arToolkitContext.arController.dispose
    ) {
      state.arToolkitContext.arController.dispose();
    }
    if (state.rawMarkerRoot) {
      state.scene.remove(state.rawMarkerRoot);
    }
    if (state.trackingRoot) {
      state.scene.remove(state.trackingRoot);
    }

    state.arToolkitSource = null;
    state.arToolkitContext = null;
    state.markerControls = null;
    state.rawMarkerRoot = null;
    state.trackingRoot = null;
    state.calibrationRoot = null;
    state.cameraActive = false;
    state.cameraInitialized = false;
    state.markerStable = false;
    state.hasStableMarkerPose = false;
    state.markerTrackingPaused = false;
    state.markerConsecutiveDetections = 0;
    state.markerLastSeenAt = 0;
    state.markerLossDurationMs = 0;
  }

  function placeBoulders() {
    if (!state.calibrationRoot || state.bouldersPlaced) {
      return;
    }

    const modelScale = getModelScale(state.modelAssets.boulders.scene);
    const boulders = createBoulderInstance(state.modelAssets.boulders, modelScale);
    state.bouldersRoot = boulders.root;
    state.floatingObject = boulders.floatingObject;
    state.dustObject = boulders.dustObject;
    state.stageRockObjects = boulders.stageRockObjects;

    state.calibrationRoot.add(state.bouldersRoot);
    createShadowReceiver();

    state.bouldersPlaced = true;
    state.animationStarted = false;
    state.animationComplete = false;
    state.floatingObjectTriggered = false;
    state.floatingObjectRiseProgress = 0;
    state.foundationFadeStarted = false;
    state.foundationFadeMeshes = [];
    state.floatingObjectRevealMeshes = [];
    state.floatingObjectRevealStarted = false;
    state.childRevealRequested = false;
    state.dustRevealMeshes = [];
    state.dustRevealQueued = false;
    state.dustRevealComplete = false;
    state.stageRockMeshes = { 1: [], 2: [], 3: [] };
    state.visibleFormationStage = 5;
    state.stageTransitionActive = false;
    state.fadeTasks = [];
    resetFormationSlider();
    setFormationSliderVisible(true);

    updateBoulderPlacement();
    state.bouldersRoot.updateMatrixWorld(true);
    state.floatingObjectRevealMeshes = getDirectChildMeshesExcept(
      state.floatingObject,
      [state.dustObject, ...Object.values(state.stageRockObjects)]
    );
    prepareBoulderVisibility();
    queueFade(state.foundationFadeMeshes.concat(getSelfMeshes(state.floatingObject)), 0, 1, CONFIG.modelFadeInDurationSeconds);
    if (state.floatingObject) {
      state.floatingObjectBasePosition.copy(state.floatingObject.position);
      state.floatingObjectTargetPosition.copy(state.floatingObjectBasePosition);
      state.floatingObjectTargetPosition.y += CONFIG.floatingObjectTargetHeightMeters;
      state.floatingObjectPlacedAtTime = performance.now();
    }
    if (state.formationStep === 3 || state.childRevealRequested) {
      startFloatingObjectChildrenReveal();
    } else if (state.formationStep < 3) {
      processFormationStage();
    }
    updateHud(state.floatingObject
      ? "Boulders placed. Object_3 will rise in 5 seconds."
      : "Boulders placed, but Object_3 was not found in the model.");
    setARDebug("tracking barcode marker 0");
  }

  function createBoulderInstance(gltf, modelScale) {
    const root = new THREE.Group();
    root.name = "Boulders Root";

    const model = cloneModelForScene(gltf.scene);
    model.name = "Boulders on Ground";
    root.add(model);
    model.scale.setScalar(modelScale);

    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.y -= bounds.min.y;
    model.position.z -= center.z;
    root.updateMatrixWorld(true);

    applyModelShadowSettings(root);
    const dustObject = getImportedObjectByName(root, "Dust and Grus");
    const stageRockObjects = {
      1: getImportedObjectByName(root, "1st Stage Rock"),
      2: getImportedObjectByName(root, "2nd Stage Rock"),
      3: getImportedObjectByName(root, "3rd Stage Rock")
    };
    return {
      root,
      floatingObject: root.getObjectByName("Object_3"),
      dustObject,
      stageRockObjects
    };
  }

  function getImportedObjectByName(root, name) {
    return root.getObjectByName(name) || root.getObjectByName(name.replaceAll(" ", "_"));
  }

  function getModelScale(referenceScene) {
    const bounds = new THREE.Box3().setFromObject(referenceScene);
    const size = bounds.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z, 0.001);

    return CONFIG.modelFootprintMeters / footprint;
  }

  function cloneModelForScene(source) {
    const clone = source.clone(true);
    clone.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      if (child.geometry) {
        child.geometry = child.geometry.clone();
      }

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }
    });

    return clone;
  }

  function applyModelShadowSettings(root) {
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if ("envMapIntensity" in material) {
              material.envMapIntensity = 0.25;
            }
          });
        }
      }
    });
  }

  function prepareBoulderVisibility() {
    const foundationNames = ["Plane", "Object_2", "Object_4", "Object_5", "Object_6"];
    setMeshesOpacity(getDescendantMeshes(state.bouldersRoot), 0);
    state.foundationFadeMeshes = foundationNames.flatMap((name) => getSelfMeshes(state.bouldersRoot.getObjectByName(name)));
    state.dustRevealMeshes = getDescendantMeshes(state.dustObject);
    state.stageRockMeshes = {
      1: getDescendantMeshes(state.stageRockObjects[1]),
      2: getDescendantMeshes(state.stageRockObjects[2]),
      3: getDescendantMeshes(state.stageRockObjects[3])
    };
    setMeshesOpacity(state.foundationFadeMeshes, 0);
    setMeshesOpacity(getSelfMeshes(state.floatingObject), 0);
    setMeshesOpacity(state.floatingObjectRevealMeshes, 0);
    setMeshesOpacity(state.dustRevealMeshes, 0);
    Object.values(state.stageRockMeshes).forEach((meshes) => setMeshesOpacity(meshes, 0));
  }

  function getSelfMeshes(object) {
    return object && object.isMesh ? [object] : [];
  }

  function getDescendantMeshes(object) {
    const meshes = [];
    if (!object) {
      return meshes;
    }

    object.traverse((child) => {
      if (child.isMesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  function getDirectChildMeshesExcept(object, excludedObjects) {
    const meshes = [];
    if (!object) {
      return meshes;
    }

    const excluded = new Set(excludedObjects.filter(Boolean));
    object.children.forEach((child) => {
      if (excluded.has(child)) {
        return;
      }

      child.traverse((descendant) => {
        if (descendant.isMesh) {
          meshes.push(descendant);
        }
      });
    });
    return meshes;
  }

  function queueFade(meshes, from, to, durationSeconds, delaySeconds, onComplete) {
    const uniqueMeshes = Array.from(new Set(meshes.filter(Boolean)));
    if (!uniqueMeshes.length) {
      return;
    }

    setMeshesOpacity(uniqueMeshes, from);
    state.fadeTasks.push({
      meshes: uniqueMeshes,
      from,
      to,
      durationSeconds: Math.max(durationSeconds, 0.001),
      delaySeconds: delaySeconds || 0,
      elapsedSeconds: 0,
      onComplete
    });
  }

  function updateFadeTasks(deltaSeconds) {
    const completedCallbacks = [];
    state.fadeTasks = state.fadeTasks.filter((task) => {
      task.elapsedSeconds += deltaSeconds;
      if (task.elapsedSeconds < task.delaySeconds) {
        return true;
      }

      const progress = THREE.MathUtils.clamp(
        (task.elapsedSeconds - task.delaySeconds) / task.durationSeconds,
        0,
        1
      );
      setMeshesOpacity(task.meshes, THREE.MathUtils.lerp(task.from, task.to, progress));
      if (progress < 1) {
        return true;
      }

      if (task.onComplete) {
        completedCallbacks.push(task.onComplete);
      }
      return false;
    });

    completedCallbacks.forEach((callback) => callback());
  }

  function setMeshesOpacity(meshes, opacity) {
    meshes.forEach((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (!material) {
          return;
        }

        material.transparent = opacity < 1;
        material.opacity = opacity;
        material.depthWrite = opacity >= 1;
        material.needsUpdate = true;
      });
    });
  }

  function startFloatingObjectChildrenReveal() {
    state.childRevealRequested = true;
    if (!state.animationComplete || state.floatingObjectRevealStarted || !state.floatingObjectRevealMeshes.length) {
      return;
    }

    state.floatingObjectRevealStarted = true;
    queueFade(
      state.floatingObjectRevealMeshes,
      0,
      1,
      CONFIG.childRevealDurationSeconds
    );
    queueDustReveal();
  }

  function queueDustReveal() {
    if (state.dustRevealQueued || !state.dustRevealMeshes.length) {
      return;
    }

    state.dustRevealQueued = true;
    queueFade(
      state.dustRevealMeshes,
      0,
      1,
      CONFIG.dustRevealDurationSeconds,
      0,
      () => {
        state.dustRevealComplete = true;
        state.visibleFormationStage = 4;
        processFormationStage();
      }
    );
  }

  function processFormationStage() {
    if (!state.animationComplete || state.stageTransitionActive) {
      return;
    }

    if (!state.floatingObjectRevealStarted) {
      startFloatingObjectChildrenReveal();
      return;
    }

    if (!state.dustRevealComplete) {
      return;
    }

    const targetStage = state.formationStep + 1;
    if (targetStage >= state.visibleFormationStage || targetStage < 1) {
      return;
    }

    if (state.visibleFormationStage === 4 && targetStage <= 3) {
      transitionFromStageFour();
    } else if (state.visibleFormationStage === 3 && targetStage <= 2) {
      transitionBetweenNamedRocks(3, 2);
    } else if (state.visibleFormationStage === 2 && targetStage <= 1) {
      transitionBetweenNamedRocks(2, 1);
    }
  }

  function transitionFromStageFour() {
    const nextMeshes = state.stageRockMeshes[3];
    if (!nextMeshes.length) {
      return;
    }

    state.stageTransitionActive = true;
    const fadingMeshes = getSelfMeshes(state.floatingObject)
      .concat(state.floatingObjectRevealMeshes, state.dustRevealMeshes);
    queueFade(
      fadingMeshes,
      1,
      0,
      CONFIG.formationTransitionDurationSeconds,
      0,
      () => {
        removeAndDisposeMeshes(fadingMeshes, [state.floatingObject]);
        state.dustObject = null;
        state.floatingObjectRevealMeshes = [];
        state.dustRevealMeshes = [];
      }
    );
    queueFade(
      nextMeshes,
      0,
      1,
      CONFIG.formationTransitionDurationSeconds,
      0,
      () => finishFormationTransition(3)
    );
    updateHud("Stage 3 transition: 3rd Stage Rock appearing.");
  }

  function transitionBetweenNamedRocks(fromStage, toStage) {
    const currentMeshes = state.stageRockMeshes[fromStage];
    const nextMeshes = state.stageRockMeshes[toStage];
    if (!currentMeshes.length || !nextMeshes.length) {
      return;
    }

    state.stageTransitionActive = true;
    queueFade(
      currentMeshes,
      1,
      0,
      CONFIG.formationTransitionDurationSeconds,
      0,
      () => {
        removeAndDisposeMeshes(currentMeshes);
        state.stageRockObjects[fromStage] = null;
        state.stageRockMeshes[fromStage] = [];
      }
    );
    queueFade(
      nextMeshes,
      0,
      1,
      CONFIG.formationTransitionDurationSeconds,
      0,
      () => finishFormationTransition(toStage)
    );
    updateHud("Stage " + toStage + " transition: " + ordinalStageName(toStage) + " Stage Rock appearing.");
  }

  function finishFormationTransition(stage) {
    state.visibleFormationStage = stage;
    state.stageTransitionActive = false;
    processFormationStage();
  }

  function ordinalStageName(stage) {
    return stage === 1 ? "1st" : stage === 2 ? "2nd" : "3rd";
  }

  function createShadowReceiver() {
    if (state.shadowReceiver) {
      state.shadowReceiver.removeFromParent();
      disposeObject(state.shadowReceiver);
    }

    state.shadowReceiver = new THREE.Mesh(
      new THREE.PlaneGeometry(
        MARKER_CALIBRATION.shadowPlaneSizeMeters,
        MARKER_CALIBRATION.shadowPlaneSizeMeters
      ).rotateX(-Math.PI * 0.5),
      new THREE.ShadowMaterial({
        color: 0x000000,
        opacity: 0.38,
        transparent: true,
        depthWrite: false
      })
    );
    state.shadowReceiver.name = "Marker Relative Shadow Receiver";
    state.shadowReceiver.receiveShadow = true;
    state.shadowReceiver.position.y = MARKER_CALIBRATION.shadowPlaneYOffsetMeters;
    state.calibrationRoot.add(state.shadowReceiver);
  }

  function updateFloatingObject(deltaSeconds) {
    if (!state.floatingObject || state.animationComplete) {
      return;
    }

    if (!state.floatingObjectTriggered) {
      if (performance.now() - state.floatingObjectPlacedAtTime < CONFIG.floatingObjectStartDelayMs) {
        return;
      }

      state.floatingObjectTriggered = true;
      state.animationStarted = true;
    }

    state.floatingObjectRiseProgress = Math.min(
      1,
      state.floatingObjectRiseProgress + deltaSeconds / CONFIG.floatingObjectRiseDurationSeconds
    );
    state.floatingObject.position.lerpVectors(
      state.floatingObjectBasePosition,
      state.floatingObjectTargetPosition,
      state.floatingObjectRiseProgress
    );
    state.floatingObject.updateMatrixWorld(true);

    if (state.floatingObjectRiseProgress >= 1) {
      state.animationComplete = true;
      fadeOutFoundationObjects();
      if (state.childRevealRequested || state.formationStep === 3) {
        startFloatingObjectChildrenReveal();
      } else if (state.formationStep < 3) {
        processFormationStage();
      }
      updateHud("Object_3 reached 1.00 m.");
    } else {
      updateHud("Object_3 is floating upward.");
    }
  }

  function fadeOutFoundationObjects() {
    if (state.foundationFadeStarted) {
      return;
    }

    state.foundationFadeStarted = true;
    const foundationMeshes = state.foundationFadeMeshes.slice();
    queueFade(
      foundationMeshes,
      1,
      0,
      CONFIG.sceneFadeOutDurationSeconds,
      0,
      () => {
        removeAndDisposeMeshes(foundationMeshes);
        state.foundationFadeMeshes = [];
      }
    );
  }

  function updateBoulderPlacement() {
    if (!state.bouldersRoot) {
      return;
    }

    state.bouldersRoot.position.set(0, 0, 0);
  }

  function getObjectSnapshot(object) {
    if (!object) {
      return null;
    }

    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const child = object.children[0] || null;

    return {
      position: vectorToPlainObject(object.position),
      scale: vectorToPlainObject(object.scale),
      childPosition: child ? vectorToPlainObject(child.position) : null,
      childScale: child ? vectorToPlainObject(child.scale) : null,
      boundsCenter: vectorToPlainObject(center),
      boundsSize: vectorToPlainObject(size),
      localXWorldDirection: vectorToPlainObject(
        new THREE.Vector3(1, 0, 0).applyQuaternion(object.quaternion).normalize()
      )
    };
  }

  function vectorToPlainObject(vector) {
    return {
      x: Number(vector.x.toFixed(6)),
      y: Number(vector.y.toFixed(6)),
      z: Number(vector.z.toFixed(6))
    };
  }

  function getWorldPositionSnapshot(object) {
    if (!object) {
      return null;
    }

    object.updateMatrixWorld(true);
    return vectorToPlainObject(object.getWorldPosition(new THREE.Vector3()));
  }

  function getParentChain(object) {
    const names = [];
    let current = object;
    while (current) {
      names.push(current.name || current.type || "Object3D");
      current = current.parent;
    }
    return names.join(" <- ");
  }

  function triggerFloatingObject() {
    if (!state.floatingObject) {
      updateHud("Object_3 was not found, so nothing can float.");
      return;
    }

    state.floatingObjectTriggered = true;
    state.animationStarted = true;
  }

  function returnToMainMenu() {
    reset();
    stopMarkerCamera();
    stopLocationTracking();
    document.body.classList.remove("in-camera-ar");
    setMenuButtonVisible(false);
    setFormationSliderVisible(false);
    setMarkerGuideVisible(false);
    setTrackingStatus("");
    refreshReadyState();
  }

  function reset() {
    if (state.bouldersRoot) {
      state.bouldersRoot.removeFromParent();
      disposeObject(state.bouldersRoot);
    }
    if (state.shadowReceiver) {
      state.shadowReceiver.removeFromParent();
      disposeObject(state.shadowReceiver);
    }

    state.bouldersRoot = null;
    state.floatingObject = null;
    state.dustObject = null;
    state.stageRockObjects = { 1: null, 2: null, 3: null };
    state.stageRockMeshes = { 1: [], 2: [], 3: [] };
    state.floatingObjectBasePosition.set(0, 0, 0);
    state.floatingObjectTargetPosition.set(0, 0, 0);
    state.floatingObjectPlacedAtTime = 0;
    state.floatingObjectTriggered = false;
    state.floatingObjectRiseProgress = 0;
    state.foundationFadeStarted = false;
    state.foundationFadeMeshes = [];
    state.floatingObjectRevealMeshes = [];
    state.floatingObjectRevealStarted = false;
    state.childRevealRequested = false;
    state.dustRevealQueued = false;
    state.dustRevealMeshes = [];
    state.dustRevealComplete = false;
    state.visibleFormationStage = 5;
    state.stageTransitionActive = false;
    state.fadeTasks = [];
    state.shadowReceiver = null;
    state.placementCenter.set(0, 0, 0);
    state.bouldersPlaced = false;
    state.animationStarted = false;
    state.animationComplete = false;
    setFormationSliderVisible(false);
    resetFormationSlider();
    if (state.cameraActive) {
      setMarkerGuideVisible(!state.markerStable);
      setTrackingStatus(state.markerStable ? "Tracking marker" : "Looking for marker");
      updateHud(state.markerStable ? "Tracking marker" : "Looking for marker");
    } else {
      updateHud("Ready to start marker tracking.");
    }
  }

  function setMenuButtonVisible(isVisible) {
    if (ui.menuButton) {
      ui.menuButton.hidden = !isVisible;
    }
  }

  function setFormationSliderVisible(isVisible) {
    if (ui.bottomUi) {
      ui.bottomUi.hidden = !isVisible;
    }
  }

  function resetFormationSlider() {
    if (!ui.formationSlider || !state.setFormationSliderValue) {
      return;
    }

    state.formationStep = 4;
    ui.formationSlider.classList.add("is-prompting");
    state.setFormationSliderValue(4, true);
  }

  function setMarkerGuideVisible(isVisible) {
    if (ui.markerGuide) {
      ui.markerGuide.hidden = !isVisible;
    }
  }

  function setTrackingStatus(message) {
    if (!ui.trackingStatus) {
      return;
    }

    ui.trackingStatus.textContent = message;
    ui.trackingStatus.hidden = !message;
  }

  function updateGeoStatus() {
    const nearestLocation = state.userPosition ? getNearestAllowedLocation() : null;
    const distanceMeters = nearestLocation ? nearestLocation.distanceMeters : null;
    const heading = typeof state.compassHeadingDegrees === "number"
      ? normalizeDegrees(state.compassHeadingDegrees)
      : null;
    const isDistanceOk = typeof distanceMeters === "number" && distanceMeters <= CONFIG.allowedLocationRadiusMeters;
    const isHeadingOk = true;

    if (typeof distanceMeters === "number") {
      const accuracy = state.userPosition && typeof state.userPosition.accuracy === "number"
        ? " +/-" + state.userPosition.accuracy.toFixed(0) + "m"
        : "";
      ui.geoDistanceValue.textContent = distanceMeters.toFixed(1) + "m" + accuracy;
    } else if (state.userPositionError) {
      ui.geoDistanceValue.textContent = "GPS error";
    } else {
      ui.geoDistanceValue.textContent = "waiting";
    }

    ui.geoHeadingValue.textContent = typeof heading === "number"
      ? heading.toFixed(0) + " deg"
      : "waiting";
    ui.geoGateValue.textContent = isDistanceOk && isHeadingOk ? "unlocked" : "locked";
    ui.geoDistanceValue.classList.toggle("is-ok", isDistanceOk);
    ui.geoDistanceValue.classList.toggle("is-locked", !isDistanceOk);
    ui.geoHeadingValue.classList.toggle("is-ok", isHeadingOk);
    ui.geoHeadingValue.classList.toggle("is-locked", !isHeadingOk);
    ui.geoGateValue.classList.toggle("is-ok", isDistanceOk && isHeadingOk);
    ui.geoGateValue.classList.toggle("is-locked", !(isDistanceOk && isHeadingOk));
  }

  function getNearestAllowedLocation() {
    let nearest = null;

    CONFIG.allowedLocations.forEach((location, index) => {
      const distanceMeters = getDistanceMeters(
        state.userPosition.latitude,
        state.userPosition.longitude,
        location.latitude,
        location.longitude
      );

      if (!nearest || distanceMeters < nearest.distanceMeters) {
        nearest = {
          index,
          location,
          distanceMeters
        };
      }
    });

    return nearest;
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  function removeAndDisposeMeshes(meshes, retainedMeshes) {
    const retained = new Set((retainedMeshes || []).filter(Boolean));
    Array.from(new Set(meshes.filter(Boolean)))
      .sort((a, b) => getObjectDepth(b) - getObjectDepth(a))
      .forEach((mesh) => {
        if (!retained.has(mesh) && mesh.parent) {
          mesh.parent.remove(mesh);
        }
        if (mesh.geometry) {
          mesh.geometry.dispose();
          if (retained.has(mesh)) {
            mesh.geometry = null;
          }
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.filter(Boolean).forEach((material) => material.dispose());
        if (retained.has(mesh)) {
          mesh.geometry = new THREE.BufferGeometry();
          mesh.material = new THREE.MeshBasicMaterial({ visible: false });
        }
      });
  }

  function getObjectDepth(object) {
    let depth = 0;
    let parent = object.parent;
    while (parent) {
      depth += 1;
      parent = parent.parent;
    }
    return depth;
  }

  function updateHud(message) {
    if (message) {
      ui.statusText.textContent = message;
    }

    const currentHeight = state.floatingObject
      ? Math.max(0, state.floatingObject.position.y - state.floatingObjectBasePosition.y)
      : 0;
    ui.heightValue.textContent = currentHeight.toFixed(2);
    ui.separationValue.textContent = "0.00";
  }

  function setARDebug(message) {
    ui.arDebugText.textContent = "AR: " + message;
  }

  function updateMarkerDebug(time) {
    if (!state.debugMode || !ui.markerDebug || time - state.lastDebugUpdateAt < 120) {
      return;
    }

    state.lastDebugUpdateAt = time;
    ui.markerDebug.hidden = false;
    ui.markerDebug.textContent = [
      "Camera initialized: " + state.cameraInitialized,
      "Marker ID detected: " + (state.rawMarkerRoot && state.rawMarkerRoot.visible ? "0" : "none"),
      "Stable tracking: " + state.markerStable,
      "Marker-loss duration: " + state.markerLossDurationMs.toFixed(0) + " ms",
      "Raw position: " + formatVector(state.rawMarkerPosition),
      "Smoothed position: " + formatVector(state.smoothedMarkerPosition),
      "Calibration offset: " + formatVector(MARKER_CALIBRATION.positionMeters),
      "Effective marker width: " + MARKER_CALIBRATION.physicalWidthMeters.toFixed(3) + " m"
    ].join("\n");
  }

  function formatVector(vector) {
    return [vector.x, vector.y, vector.z].map((value) => value.toFixed(3)).join(", ");
  }

  function captureCompassHeading() {
    if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
      DeviceOrientationEvent.requestPermission()
        .then((permission) => {
          if (permission === "granted") {
            window.addEventListener("deviceorientation", updateCompassHeading, true);
          }
        })
        .catch(() => {});
    } else {
      window.addEventListener("deviceorientation", updateCompassHeading, true);
    }
  }

  function updateCompassHeading(event) {
    if (typeof event.webkitCompassHeading === "number") {
      state.compassHeadingDegrees = event.webkitCompassHeading;
    } else if (typeof event.alpha === "number") {
      state.compassHeadingDegrees = 360 - event.alpha;
    }

    if (state.lastSunPosition) {
      applySunPosition(state.lastSunPosition, true);
    }
    updateGeoStatus();
  }

  function startLocationTracking() {
    if (!navigator.geolocation || state.geolocationWatchId !== null) {
      return;
    }

    state.geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        state.userPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        state.userPositionError = null;
        updateGeoStatus();
      },
      (error) => {
        state.userPositionError = error.message || error.code || "location unavailable";
        updateGeoStatus();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 12000
      }
    );
  }

  function stopLocationTracking() {
    if (navigator.geolocation && state.geolocationWatchId !== null) {
      navigator.geolocation.clearWatch(state.geolocationWatchId);
    }
    state.geolocationWatchId = null;
  }

  function updateSunLightFromDeviceLocation() {
    if (!navigator.geolocation) {
      setARDebug("sun uses fallback light: no geolocation");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const sun = getSunPosition(new Date(), position.coords.latitude, position.coords.longitude);
        applySunPosition(sun);
      },
      () => {
        setARDebug("sun uses fallback light: location denied");
      },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 }
    );
  }

  function getDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
    const earthRadiusMeters = 6371000;
    const phiA = THREE.MathUtils.degToRad(latitudeA);
    const phiB = THREE.MathUtils.degToRad(latitudeB);
    const deltaPhi = THREE.MathUtils.degToRad(latitudeB - latitudeA);
    const deltaLambda = THREE.MathUtils.degToRad(longitudeB - longitudeA);
    const a = Math.sin(deltaPhi * 0.5) ** 2 +
      Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda * 0.5) ** 2;
    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function normalizeDegrees(degrees) {
    return ((degrees % 360) + 360) % 360;
  }

  function applySunPosition(sun, isCompassRefresh) {
    state.lastSunPosition = sun;
    const elevation = Math.max(sun.elevation, THREE.MathUtils.degToRad(5));
    const worldAzimuth = sun.azimuth;
    const heading = THREE.MathUtils.degToRad(state.compassHeadingDegrees || 0);
    const localAzimuth = worldAzimuth - heading;
    const radius = 4;

    const x = Math.sin(localAzimuth) * Math.cos(elevation) * radius;
    const y = Math.sin(elevation) * radius;
    const z = Math.cos(localAzimuth) * Math.cos(elevation) * radius;

    state.sunDirection.set(x, y, z).normalize();
    positionSunLightAt(state.bouldersPlaced ? state.placementCenter : new THREE.Vector3());
    state.sunReady = true;
    if (!isCompassRefresh) {
      setARDebug("sun shadows: elevation " + THREE.MathUtils.radToDeg(sun.elevation).toFixed(1) + " deg");
    }
  }

  function positionSunLightAt(target) {
    if (!state.sunLight) {
      return;
    }

    state.sunLight.target.position.copy(target);
    state.sunLight.position.copy(target).addScaledVector(state.sunDirection, 4);
    state.sunLight.target.updateMatrixWorld();
    state.sunLight.updateMatrixWorld();
  }

  function getSunPosition(date, latitudeDegrees, longitudeDegrees) {
    const rad = Math.PI / 180;
    const latitude = latitudeDegrees * rad;
    const day = toJulian(date) - 2451545;
    const meanAnomaly = rad * (357.5291 + 0.98560028 * day);
    const equationOfCenter = rad * (
      1.9148 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly) +
      0.0003 * Math.sin(3 * meanAnomaly)
    );
    const eclipticLongitude = meanAnomaly + equationOfCenter + rad * 102.9372 + Math.PI;
    const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(rad * 23.4397));
    const rightAscension = Math.atan2(
      Math.sin(eclipticLongitude) * Math.cos(rad * 23.4397),
      Math.cos(eclipticLongitude)
    );
    const siderealTime = rad * (280.16 + 360.9856235 * day) - longitudeDegrees * rad;
    const hourAngle = siderealTime - rightAscension;
    const elevation = Math.asin(
      Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
    );
    const azimuthSouthBased = Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)
    );
    const azimuthNorthBased = azimuthSouthBased + Math.PI;

    return {
      elevation,
      azimuth: azimuthNorthBased
    };
  }

  function toJulian(date) {
    return date.valueOf() / 86400000 - 0.5 + 2440588;
  }
})();
