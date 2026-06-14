import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
    contactEpsilonMeters: 0.01,
    contactProxyScale: 0.8,
    targetCenterHeightMeters: 1.0,
    floatingObjectTargetHeightMeters: 1.0,
    floatingObjectStartDelayMs: 2000,
    initialVisibleGapMeters: 0,
    pinchReadyVisibleGapMeters: 0.002,
    initialSeparationMeters: 1.2,
    riseSpeedMetersPerSecond: 0.2,
    pinchMetersPerPixel: 0.0006667,
    editorKeyboardPinchSpeedMetersPerSecond: 0.2,
    allowedLatitude: 49.90000549974582,
    allowedLongitude: 8.85554978661026,
    allowedLocations: [
      { latitude: 49.90000549974582, longitude: 8.85554978661026 },
      { latitude: 49.8686172198458, longitude: 8.649528051715288 }
    ],
    allowedLocationRadiusMeters: 25,
    allowedHeadingMinDegrees: 0,
    allowedHeadingMaxDegrees: 360
  };

  const state = {
    scene: null,
    camera: null,
    renderer: null,
    xrSession: null,
    xrReferenceSpace: null,
    xrViewerSpace: null,
    xrHitTestSource: null,
    latestHit: null,
    latestHitResult: null,
    reticle: null,
    planeIndicator: null,
    sunLight: null,
    shadowReceiver: null,
    islandAssets: null,
    bouldersRoot: null,
    floatingObject: null,
    floatingObjectBaseY: 0,
    floatingObjectTargetY: 0,
    floatingObjectLocalToWorldScale: 1,
    floatingObjectBaseWorldPosition: new THREE.Vector3(),
    floatingObjectTargetWorldPosition: new THREE.Vector3(),
    floatingObjectPlacedAtTime: 0,
    floatingObjectTriggered: false,
    modelsLoaded: false,
    modelLoadError: false,
    contactProxySize: null,
    oceanicIsland: null,
    continentalIsland: null,
    insideEarth: null,
    oceanicMixer: null,
    oceanicAction: null,
    placementCenter: new THREE.Vector3(),
    separationAxis: new THREE.Vector3(1, 0, 0),
    offset: new THREE.Vector3(),
    planeHeight: 0,
    currentSeparation: CONFIG.initialSeparationMeters,
    contactSeparation: CONFIG.initialSeparationMeters,
    floatStartSeparation: CONFIG.initialSeparationMeters,
    pinchReadySeparation: CONFIG.initialSeparationMeters,
    previousPinchDistance: -1,
    cubesPlaced: false,
    cubesAtTargetHeight: false,
    pinchEnabled: false,
    contactReached: false,
    isSwiping: false,
    animationStarted: false,
    animationComplete: false,
    interactionsFrozen: false,
    holdingPinchButton: false,
    lastTime: 0,
    hitFrames: 0,
    noHitFrames: 0,
    lastScanDebugTime: 0,
    compassHeadingDegrees: null,
    userPosition: null,
    userPositionError: null,
    geolocationWatchId: null,
    sunDirection: new THREE.Vector3(-0.3, 0.8, 0.5).normalize(),
    lastSunPosition: null,
    sunReady: false,
    domOverlayActive: false,
    xrHud: null
  };

  const ui = {
    canvasRoot: document.getElementById("canvasRoot"),
    overlay: document.getElementById("overlay"),
    statusText: document.getElementById("statusText"),
    heightValue: document.getElementById("heightValue"),
    separationValue: document.getElementById("separationValue"),
    xrDebugText: document.getElementById("xrDebugText"),
    startArButton: document.getElementById("startArButton"),
    resetButton: document.getElementById("resetButton"),
    gestureIndicators: document.getElementById("gestureIndicators"),
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
    state.renderer.xr.enabled = true;
    state.renderer.xr.setReferenceSpaceType("local");
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    ui.canvasRoot.appendChild(state.renderer.domElement);

    addLights();
    addDesktopFallbackFloor();
    createReticleAndPlaneIndicator();
    createXrFallbackHud();
    loadIslandModels();

    window.addEventListener("resize", onResize);
    ui.startArButton.addEventListener("click", startARSession);
    ui.resetButton.addEventListener("click", reset);
    initFormationSlider();

    ui.startArButton.disabled = true;
    updateHud("Loading boulder model.");
    checkARSupport();
    installDebugHooks();
    state.renderer.setAnimationLoop(render);
  }

  function initFormationSlider() {
    if (!ui.formationRange || !ui.formationSlider) {
      return;
    }

    let activeStep = 0;
    const snapThreshold = 0.16;

    const applySliderValue = (rawValue, shouldSnap) => {
      const numericValue = THREE.MathUtils.clamp(Number(rawValue) || 0, 0, 4);
      const nearestStep = Math.round(numericValue);
      const snappedValue = Math.abs(numericValue - nearestStep) <= snapThreshold || shouldSnap
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

      if (shouldSnap && displayStep !== activeStep) {
        activeStep = displayStep;
        onFormationStepSelected(activeStep);
      }
    };

    ui.formationRange.addEventListener("pointerdown", () => {
      ui.formationSlider.classList.add("is-dragging");
    });

    ui.formationRange.addEventListener("input", (event) => {
      applySliderValue(event.target.value, false);
    });

    ui.formationRange.addEventListener("change", (event) => {
      applySliderValue(event.target.value, true);
    });

    window.addEventListener("pointerup", () => {
      if (!ui.formationSlider.classList.contains("is-dragging")) {
        return;
      }

      ui.formationSlider.classList.remove("is-dragging");
      applySliderValue(ui.formationRange.value, true);
    });

    window.addEventListener("pointercancel", () => {
      ui.formationSlider.classList.remove("is-dragging");
      applySliderValue(ui.formationRange.value, true);
    });

    applySliderValue(0, true);
  }

  function onFormationStepSelected(stepIndex) {
    // Reserved for the stage-specific actions that will be added later.
    window.__formationSliderStep = stepIndex;
  }

  async function loadIslandModels() {
    const loader = new GLTFLoader();
    const assetVersion = Date.now();
    const assetUrl = (fileName) => "Assets/" + fileName + "?v=" + assetVersion;

    try {
      const boulders = await loader.loadAsync(assetUrl("Boulders%20on%20Ground.glb"));

      state.islandAssets = {
        boulders
      };
      state.modelsLoaded = true;
      ui.startArButton.disabled = false;
      updateHud("Models loaded. Start Camera AR. Placement requires GPS target + north heading.");
    } catch (error) {
      state.modelLoadError = true;
      ui.startArButton.disabled = true;
      setXRDebug("model load failed");
      updateHud("Could not load the boulder model. Check the Assets folder and refresh.");
      window.__runtimeErrors.push("Boulder model load failed: " + error.message);
    }
  }

  function installDebugHooks() {
    if (!new URLSearchParams(window.location.search).has("debug")) {
      return;
    }

    window.__arIslandDebug = {
      getState() {
        return {
          modelsLoaded: state.modelsLoaded,
          modelLoadError: state.modelLoadError,
          bouldersPlaced: state.cubesPlaced,
          currentSeparation: state.currentSeparation,
          contactSeparation: state.contactSeparation,
          contactProxySize: state.contactProxySize,
          floatStartSeparation: state.floatStartSeparation,
          pinchReadySeparation: state.pinchReadySeparation,
          pinchEnabled: state.pinchEnabled,
          contactReached: state.contactReached,
          animationStarted: state.animationStarted,
          animationComplete: state.animationComplete,
          floatingObjectTriggered: state.floatingObjectTriggered,
          floatingObjectY: state.floatingObject ? state.floatingObject.position.y : null,
          floatingObjectTargetY: state.floatingObjectTargetY
        };
      },
      placeAtOrigin() {
        if (!state.modelsLoaded) {
          return false;
        }

        if (state.cubesPlaced) {
          reset();
        }

        state.separationAxis.set(1, 0, 0);
        placeIslands(new THREE.Vector3(0, 0, 0));
        updateCubePositions();
        return true;
      },
      placeWithAxis(x, z) {
        if (!state.modelsLoaded) {
          return false;
        }

        if (state.cubesPlaced) {
          reset();
        }

        placeIslands(new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, 0, z));
        updateCubePositions();
        return true;
      },
      triggerFloat() {
        if (!state.cubesPlaced) {
          return false;
        }

        applyInwardPinch(0);
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

  function addDesktopFallbackFloor() {
    const floor = new THREE.GridHelper(8, 16, 0x7bdff2, 0x7bdff2);
    floor.name = "Desktop Fallback Floor";
    floor.material.transparent = true;
    floor.material.opacity = 0.18;
    state.scene.add(floor);
  }

  function createReticleAndPlaneIndicator() {
    state.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.145, 0.175, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x24f2a9,
        transparent: true,
        opacity: 0.98,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    state.reticle.visible = false;
    state.scene.add(state.reticle);

    state.planeIndicator = new THREE.Group();
    const grid = new THREE.GridHelper(0.8, 8, 0x24f2a9, 0x24f2a9);
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    grid.material.depthWrite = false;
    state.planeIndicator.add(grid);

    const dotPositions = [];
    for (let x = -0.3; x <= 0.3; x += 0.15) {
      for (let z = -0.3; z <= 0.3; z += 0.15) {
        dotPositions.push(x, 0.006, z);
      }
    }
    const dotsGeometry = new THREE.BufferGeometry();
    dotsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3));
    state.planeIndicator.add(new THREE.Points(
      dotsGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.025,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    ));

    state.planeIndicator.visible = false;
    state.scene.add(state.planeIndicator);
  }

  function onResize() {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function checkARSupport() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      setXRDebug("navigator.xr unavailable");
      updateHud("This browser does not expose WebXR AR.");
      return;
    }

    navigator.xr.isSessionSupported("immersive-ar")
      .then((supported) => {
        setXRDebug(supported ? "immersive-ar supported" : "immersive-ar unsupported");
      })
      .catch(() => setXRDebug("immersive-ar support check failed"));
  }

  async function startARSession() {
    if (state.modelLoadError) {
      updateHud("Boulder model failed to load. Refresh after checking the Assets folder.");
      return;
    }

    if (!state.modelsLoaded) {
      updateHud("Loading boulder model. Wait a moment, then start Camera AR.");
      return;
    }

    if (!navigator.xr) {
      updateHud("WebXR is not available in this browser.");
      return;
    }

    setXRDebug("requesting raw immersive-ar");
    updateHud("Requesting Camera AR. Grant camera permission.");

    try {
      const sessionInit = {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["anchors", "dom-overlay"],
        domOverlay: { root: ui.overlay }
      };
      ui.startArButton.disabled = true;
      const waitingMessageTimer = window.setTimeout(() => {
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
      updateHud("Camera AR request failed: " + error.name);
      ui.startArButton.disabled = false;
    }
  }

  async function onSessionStarted(session) {
    state.xrSession = session;
    state.xrSession.addEventListener("end", onSessionEnded);
    state.xrSession.addEventListener("select", onXRSelect);

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
    setXrHudVisible(shouldUseXrFallbackHud());
    setGeoStatusVisible(true);
    captureCompassHeading();
    startLocationTracking();
    updateSunLightFromDeviceLocation();
    updateGeoStatus();
    setXRDebug("hit-test source ready");
    updateHud("Scanning: find a plane. Placement unlocks only at the GPS target while facing north.");
  }

  function onSessionEnded() {
    if (state.xrHitTestSource && state.xrHitTestSource.cancel) {
      state.xrHitTestSource.cancel();
    }

    state.xrSession = null;
    state.xrReferenceSpace = null;
    state.xrViewerSpace = null;
    state.xrHitTestSource = null;
    state.latestHit = null;
    state.latestHitResult = null;
    state.reticle.visible = false;
    state.planeIndicator.visible = false;
    document.body.classList.remove("in-camera-ar");
    document.body.classList.remove("has-dom-overlay");
    state.domOverlayActive = false;
    setXrHudVisible(false);
    setGestureIndicatorsVisible(false);
    setGeoStatusVisible(false);
    stopLocationTracking();
    ui.startArButton.disabled = state.modelLoadError || !state.modelsLoaded;
    setXRDebug("AR session ended");
  }

  function onXRSelect() {
    if (state.cubesPlaced) {
      return;
    }

    if (!state.modelsLoaded) {
      updateHud("Loading boulder model. Try placing after it finishes loading.");
      return;
    }

    if (!state.latestHit) {
      updateHud("Tap ignored: no detected plane yet. Wait for the green grid.");
      return;
    }

    const placementGate = getPlacementGateStatus();
    if (!placementGate.allowed) {
      updateHud(placementGate.message);
      setXRDebug(placementGate.debug);
      return;
    }

    placeIslands(state.latestHit.position);
  }

  function render(time, frame) {
    const deltaSeconds = state.lastTime ? Math.min((time - state.lastTime) / 1000, 0.05) : 0;
    state.lastTime = time;

    if (frame) {
      updateHitTest(frame);
    }

    if (state.xrSession) {
      updateGeoStatus();
      updateXrHudLayout();
    }

    if (state.cubesPlaced) {
      updateFloatingObject(deltaSeconds);
      applyEditorSimulationControls(deltaSeconds);
      updateOceanicAnimation(deltaSeconds);
    }

    state.renderer.render(state.scene, state.camera);
  }

  function updateHitTest(frame) {
    if (!state.xrHitTestSource || !state.xrReferenceSpace || state.cubesPlaced) {
      if (!state.cubesPlaced && performance.now() - state.lastScanDebugTime > 900) {
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
    ui.statusText.textContent = "PLANE DETECTED. Tap to place if GPS target + north heading are valid.";
  }

  function poseFromMatrix(xrMatrix) {
    const matrix = new THREE.Matrix4().fromArray(xrMatrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    return { matrix, position, quaternion };
  }

  function placeIslands(center, forcedSeparationAxis) {
    state.placementCenter.copy(center);
    state.planeHeight = center.y;

    if (forcedSeparationAxis && forcedSeparationAxis.lengthSq() > 0.001) {
      state.separationAxis.copy(forcedSeparationAxis).normalize();
    } else {
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(state.camera.quaternion);
      cameraRight.y = 0;
      if (cameraRight.lengthSq() > 0.001) {
        state.separationAxis.copy(cameraRight.normalize());
      } else {
        state.separationAxis.set(1, 0, 0);
      }
    }

    const sharedModelScale = getSharedIslandScale(state.islandAssets.boulders.scene);
    const boulders = createBoulderInstance(state.islandAssets.boulders, sharedModelScale);
    state.bouldersRoot = boulders.root;
    state.floatingObject = boulders.floatingObject;
    state.currentSeparation = CONFIG.initialSeparationMeters;

    state.scene.add(state.bouldersRoot);
    createShadowReceiver(center, state.latestHit ? state.latestHit.quaternion : null);

    state.cubesPlaced = true;
    state.cubesAtTargetHeight = true;
    state.pinchEnabled = true;
    state.contactReached = false;
    state.isSwiping = false;
    state.animationStarted = false;
    state.animationComplete = false;
    state.floatingObjectTriggered = false;
    state.interactionsFrozen = false;
    state.reticle.visible = false;
    state.planeIndicator.visible = false;
    setGestureIndicatorsVisible(false);
    positionSunLightAt(center);

    updateCubePositions();
    state.bouldersRoot.updateMatrixWorld(true);
    if (state.floatingObject) {
      state.floatingObject.getWorldPosition(state.floatingObjectBaseWorldPosition);
      state.floatingObjectTargetWorldPosition.copy(state.floatingObjectBaseWorldPosition);
      state.floatingObjectTargetWorldPosition.y += CONFIG.floatingObjectTargetHeightMeters;
      state.floatingObjectBaseY = state.floatingObject.position.y;
      state.floatingObjectTargetY = state.floatingObject.position.y;
      state.floatingObjectLocalToWorldScale = sharedModelScale;
      state.floatingObjectPlacedAtTime = performance.now();
    }
    updateHud(state.floatingObject
      ? "Boulders placed. Object_5 will float up in 2 seconds."
      : "Boulders placed, but Object_5 was not found in the model.");
    setXRDebug("raw world-space placement");
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
    model.position.z -= center.z;

    applyModelShadowSettings(root);
    return {
      root,
      floatingObject: root.getObjectByName("Object_5")
    };
  }

  function getSharedIslandScale(referenceScene) {
    const bounds = new THREE.Box3().setFromObject(referenceScene);
    const size = bounds.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z, 0.001);

    return CONFIG.modelFootprintMeters / footprint;
  }

  function createIslandInstance(gltf, name, modelScale) {
    const root = new THREE.Group();
    root.name = name + " Root";

    const model = cloneModelForScene(gltf.scene);
    root.add(model);

    model.scale.setScalar(modelScale);

    const scaledBounds = new THREE.Box3().setFromObject(root);

    applyModelShadowSettings(root);
    return {
      root,
      localCenterX: (scaledBounds.min.x + scaledBounds.max.x) * 0.5,
      localMinX: scaledBounds.min.x,
      localMaxX: scaledBounds.max.x,
      localSizeY: scaledBounds.max.y - scaledBounds.min.y,
      localSizeZ: scaledBounds.max.z - scaledBounds.min.z
    };
  }

  function getContactSeparation(oceanic, continental) {
    const continentalHalfWidth = state.contactProxySize.x * 0.5;
    const oceanicContactHalfWidth = continentalHalfWidth;
    const continentalContactHalfWidth = continentalHalfWidth;
    const oceanicContactMaxX = oceanic.localCenterX + oceanicContactHalfWidth;
    const continentalContactMinX = continental.localCenterX - continentalContactHalfWidth;
    const edgeDistance = oceanicContactMaxX - continentalContactMinX;
    return Math.max(0.05, edgeDistance + CONFIG.contactEpsilonMeters);
  }

  function getSharedContactProxySize(referenceModel) {
    return {
      x: (referenceModel.localMaxX - referenceModel.localMinX) * CONFIG.contactProxyScale,
      y: referenceModel.localSizeY * CONFIG.contactProxyScale,
      z: referenceModel.localSizeZ * CONFIG.contactProxyScale
    };
  }

  function getSeparationForVisibleGap(oceanic, continental, visibleGapMeters) {
    const edgeDistance = oceanic.localMaxX - continental.localMinX;
    return Math.max(0.05, edgeDistance + visibleGapMeters);
  }

  function alignIslandAxesToSeparationAxis() {
    if (!state.oceanicIsland || !state.continentalIsland) {
      return;
    }

    const axis = state.separationAxis.clone();
    axis.y = 0;
    if (axis.lengthSq() <= 0.001) {
      axis.set(1, 0, 0);
    } else {
      axis.normalize();
    }

    const alignment = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      axis
    );
    state.oceanicIsland.quaternion.copy(alignment);
    state.continentalIsland.quaternion.copy(alignment);
    if (state.insideEarth) {
      state.insideEarth.quaternion.copy(alignment);
    }
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

  function setupOceanicAnimation(animations) {
    if (!animations || !animations.length || !state.oceanicIsland) {
      updateHud("Oceanic model has no animation. The islands can still be placed and pinched.");
      return;
    }

    state.oceanicMixer = new THREE.AnimationMixer(state.oceanicIsland);
    state.oceanicAction = state.oceanicMixer.clipAction(animations[0]);
    state.oceanicAction.setLoop(THREE.LoopOnce, 1);
    state.oceanicAction.clampWhenFinished = true;
    state.oceanicAction.enabled = true;
    state.oceanicAction.paused = true;
    state.oceanicAction.play();

    state.oceanicMixer.addEventListener("finished", (event) => {
      if (event.action !== state.oceanicAction) {
        return;
      }

      state.animationComplete = true;
      state.interactionsFrozen = true;
      state.isSwiping = false;
      state.holdingPinchButton = false;
      state.oceanicAction.paused = true;
      updateHud("Animation complete. Swiping is now locked until Reset.");
    });
  }

  function createShadowReceiver(center, orientation) {
    if (state.shadowReceiver) {
      state.scene.remove(state.shadowReceiver);
      disposeObject(state.shadowReceiver);
    }

    state.shadowReceiver = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI * 0.5),
      new THREE.ShadowMaterial({
        color: 0x000000,
        opacity: 0.38,
        transparent: true,
        depthWrite: false
      })
    );
    state.shadowReceiver.name = "Detected Plane Shadow Receiver";
    state.shadowReceiver.receiveShadow = true;
    state.shadowReceiver.position.copy(center);
    state.shadowReceiver.position.y += 0.004;
    if (orientation) {
      state.shadowReceiver.quaternion.copy(orientation);
    }
    state.scene.add(state.shadowReceiver);
  }

  function raiseCubesTowardTarget(deltaSeconds) {
    if (state.cubesAtTargetHeight) {
      return;
    }

    const targetY = state.planeHeight + CONFIG.targetCenterHeightMeters;
    const maxStep = CONFIG.riseSpeedMetersPerSecond * deltaSeconds;
    const nextY = moveTowards(state.placementCenter.y, targetY, maxStep);
    state.placementCenter.y = nextY;
    state.cubesAtTargetHeight = Math.abs(nextY - targetY) <= 0.00001;
    const riseProgress = CONFIG.targetCenterHeightMeters > 0
      ? THREE.MathUtils.clamp((state.placementCenter.y - state.planeHeight) / CONFIG.targetCenterHeightMeters, 0, 1)
      : 1;
    state.currentSeparation = THREE.MathUtils.lerp(
      state.floatStartSeparation,
      state.pinchReadySeparation,
      riseProgress
    );
    updateCubePositions();

    if (state.cubesAtTargetHeight) {
      state.pinchEnabled = true;
      updateHud("At target height. Pinch inward to move the islands closer.");
    } else {
      updateHud("Floating upward. Pinch unlocks when the 1 cm gap is ready.");
    }
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

    const currentWorldPosition = new THREE.Vector3();
    state.floatingObject.getWorldPosition(currentWorldPosition);
    currentWorldPosition.y = moveTowards(
      currentWorldPosition.y,
      state.floatingObjectTargetWorldPosition.y,
      CONFIG.riseSpeedMetersPerSecond * deltaSeconds
    );

    if (state.floatingObject.parent) {
      state.floatingObject.parent.worldToLocal(currentWorldPosition);
    }
    state.floatingObject.position.copy(currentWorldPosition);
    state.floatingObject.updateMatrixWorld(true);

    if (Math.abs(state.floatingObjectTargetWorldPosition.y - state.floatingObject.getWorldPosition(new THREE.Vector3()).y) <= 0.00001) {
      state.animationComplete = true;
      state.isSwiping = false;
      state.holdingPinchButton = false;
      updateHud("Object_5 reached 1.00 m.");
    } else {
      updateHud("Object_5 is floating upward.");
    }
  }

  function applyEditorSimulationControls(deltaSeconds) {
  }

  function onTouchMove(event) {
    if (!state.cubesPlaced || event.touches.length !== 2 || state.interactionsFrozen || !state.pinchEnabled) {
      state.previousPinchDistance = -1;
      setSwipeActive(false);
      return;
    }

    event.preventDefault();
    const first = event.touches[0];
    const second = event.touches[1];
    const pinchDistance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);

    if (state.previousPinchDistance < 0) {
      state.previousPinchDistance = pinchDistance;
      return;
    }

    const inwardPixels = state.previousPinchDistance - pinchDistance;
    state.previousPinchDistance = pinchDistance;

    if (inwardPixels <= 0) {
      setSwipeActive(false);
      return;
    }

    setSwipeActive(true);
    applyInwardPinch(inwardPixels * CONFIG.pinchMetersPerPixel);
    updateHud("Pinch detected. Object_5 is floating upward.");
  }

  function onTouchEnd() {
    state.previousPinchDistance = -1;
    setSwipeActive(false);
  }

  function updateCubePositions() {
    if (!state.bouldersRoot) {
      return;
    }

    state.bouldersRoot.position.copy(state.placementCenter);
    state.bouldersRoot.position.y = state.planeHeight;
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

  function applyInwardPinch(amountMeters) {
    if (state.interactionsFrozen) {
      return;
    }

    if (!state.floatingObject) {
      updateHud("Object_5 was not found, so nothing can float.");
      return;
    }

    state.floatingObjectTriggered = true;
    state.animationStarted = true;
    state.currentSeparation = Math.max(0, state.currentSeparation - amountMeters);
  }

  function setSwipeActive(isActive) {
    if (state.interactionsFrozen) {
      state.isSwiping = false;
      return;
    }

    state.isSwiping = isActive;
    if (isActive && state.pinchEnabled) {
      applyInwardPinch(0);
    }
  }

  function updateOceanicAnimationPlayback() {
    if (!state.oceanicAction || state.animationComplete) {
      return;
    }

    if (!state.contactReached) {
      state.oceanicAction.paused = true;
      return;
    }

    if (state.isSwiping) {
      state.animationStarted = true;
      state.oceanicAction.paused = false;
    } else if (state.animationStarted) {
      state.oceanicAction.paused = true;
      updateHud("Animation paused.");
    }
  }

  function updateOceanicAnimation(deltaSeconds) {
    if (!state.oceanicMixer || state.animationComplete) {
      return;
    }

    state.oceanicMixer.update(deltaSeconds);
  }

  function reset() {
    if (state.bouldersRoot) {
      state.scene.remove(state.bouldersRoot);
      disposeObject(state.bouldersRoot);
    }
    if (state.oceanicIsland) {
      state.scene.remove(state.oceanicIsland);
      disposeObject(state.oceanicIsland);
    }
    if (state.continentalIsland) {
      state.scene.remove(state.continentalIsland);
      disposeObject(state.continentalIsland);
    }
    if (state.insideEarth) {
      state.scene.remove(state.insideEarth);
      disposeObject(state.insideEarth);
    }
    if (state.shadowReceiver) {
      state.scene.remove(state.shadowReceiver);
      disposeObject(state.shadowReceiver);
    }

    if (state.oceanicAction) {
      state.oceanicAction.stop();
    }

    state.oceanicIsland = null;
    state.continentalIsland = null;
    state.insideEarth = null;
    state.bouldersRoot = null;
    state.floatingObject = null;
    state.floatingObjectBaseY = 0;
    state.floatingObjectTargetY = 0;
    state.floatingObjectLocalToWorldScale = 1;
    state.floatingObjectBaseWorldPosition.set(0, 0, 0);
    state.floatingObjectTargetWorldPosition.set(0, 0, 0);
    state.floatingObjectPlacedAtTime = 0;
    state.floatingObjectTriggered = false;
    state.oceanicMixer = null;
    state.oceanicAction = null;
    state.shadowReceiver = null;
    state.placementCenter.set(0, 0, 0);
    state.planeHeight = 0;
    state.currentSeparation = 0;
    state.contactSeparation = CONFIG.initialSeparationMeters;
    state.floatStartSeparation = CONFIG.initialSeparationMeters;
    state.pinchReadySeparation = CONFIG.initialSeparationMeters;
    state.previousPinchDistance = -1;
    state.cubesPlaced = false;
    state.cubesAtTargetHeight = false;
    state.pinchEnabled = false;
    setGestureIndicatorsVisible(false);
    state.contactReached = false;
    state.isSwiping = false;
    state.animationStarted = false;
    state.animationComplete = false;
    state.interactionsFrozen = false;
    state.holdingPinchButton = false;
    updateHud("Move the iPad to detect a plane, then tap the green grid.");
  }

  function createXrFallbackHud() {
    state.scene.add(state.camera);

    const root = new THREE.Group();
    root.name = "XR Fallback HUD";
    root.visible = false;
    state.camera.add(root);

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
      })
    );
    panel.renderOrder = 1000;
    root.add(panel);

    const indicators = new THREE.Group();
    indicators.name = "XR Fallback Gesture Indicators";
    indicators.visible = false;
    indicators.add(createXrIndicatorCard(">", "SWIPE IN", -1));
    indicators.add(createXrIndicatorCard("<", "SWIPE IN", 1));
    root.add(indicators);

    state.xrHud = {
      root,
      canvas,
      context: canvas.getContext("2d"),
      texture,
      panel,
      indicators,
      lastText: "",
      lastAspect: 0
    };

    refreshXrHudTexture();
    updateXrHudLayout();
  }

  function createXrIndicatorCard(arrow, label, side) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawRoundedRect(context, 12, 20, 488, 152, 72, "rgba(17, 24, 32, 0.54)", "rgba(248, 251, 255, 0.72)", 8);
    context.fillStyle = "rgba(248, 251, 255, 0.94)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 76px Arial";
    context.fillText(arrow, side < 0 ? 334 : 178, 92);
    context.font = "800 34px Arial";
    context.fillText(label, side < 0 ? 180 : 330, 94);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.19),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
        depthWrite: false
      })
    );
    mesh.renderOrder = 1001;
    mesh.userData.side = side;
    mesh.userData.baseScale = 1;
    return mesh;
  }

  function setXrHudVisible(isVisible) {
    if (!state.xrHud) {
      return;
    }

    state.xrHud.root.visible = isVisible;
    refreshXrHudTexture();
    updateXrHudLayout();
  }

  function updateXrHudLayout() {
    if (!state.xrHud || !state.xrHud.root.visible) {
      return;
    }

    const distance = 1.25;
    const aspect = Math.max(0.55, state.camera.aspect || (window.innerWidth / window.innerHeight));
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(state.camera.fov) * 0.5) * distance;
    const visibleWidth = visibleHeight * aspect;
    const margin = Math.max(0.08, Math.min(0.16, visibleWidth * 0.045));
    const panelWidth = Math.min(1.12, visibleWidth - margin * 2);
    const panelHeight = panelWidth * 0.45;

    state.xrHud.panel.scale.set(panelWidth, panelHeight, 1);
    state.xrHud.panel.position.set(
      -visibleWidth * 0.5 + panelWidth * 0.5 + margin,
      visibleHeight * 0.5 - panelHeight * 0.5 - margin,
      -distance
    );

    const indicatorOffset = Math.min(visibleWidth * 0.24, 0.58);
    const indicatorY = -visibleHeight * 0.08;
    state.xrHud.indicators.children.forEach((indicator) => {
      const side = indicator.userData.side || 1;
      indicator.position.set(side * indicatorOffset, indicatorY, -distance);
      const pulse = 0.94 + Math.sin(performance.now() * 0.006) * 0.12;
      indicator.scale.setScalar(pulse);
    });

    state.xrHud.lastAspect = aspect;
  }

  function refreshXrHudTexture() {
    if (!state.xrHud) {
      return;
    }

    const text = [
      ui.statusText.textContent,
      "Height " + ui.heightValue.textContent + " m",
      "Separation " + ui.separationValue.textContent + " m",
      "Distance " + ui.geoDistanceValue.textContent,
      "Heading " + ui.geoHeadingValue.textContent,
      "Gate " + ui.geoGateValue.textContent,
      ui.xrDebugText.textContent
    ].join("|");

    if (text === state.xrHud.lastText) {
      return;
    }

    state.xrHud.lastText = text;
    const context = state.xrHud.context;
    const canvas = state.xrHud.canvas;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 32, "rgba(17, 24, 32, 0.80)", "rgba(123, 223, 242, 0.24)", 4);

    context.fillStyle = "#7bdff2";
    context.font = "800 34px Arial";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText("WEB PORT", 54, 48);

    context.fillStyle = "#f8fbff";
    context.font = "800 58px Arial";
    context.fillText("AR Island Prototype", 54, 92);

    context.fillStyle = "#c8d6e5";
    context.font = "36px Arial";
    drawWrappedText(context, ui.statusText.textContent, 54, 168, 900, 42, 2);

    context.fillStyle = "#93a4b6";
    context.font = "800 25px Arial";
    context.fillText("HEIGHT", 54, 278);
    context.fillText("SEPARATION", 330, 278);
    context.fillText("DISTANCE", 606, 278);

    context.fillStyle = "#f8fbff";
    context.font = "44px Arial";
    context.fillText(ui.heightValue.textContent + " m", 54, 312);
    context.fillText(ui.separationValue.textContent + " m", 330, 312);
    context.fillText(ui.geoDistanceValue.textContent, 606, 312);

    context.fillStyle = "#7bdff2";
    context.font = "30px Arial";
    context.fillText("Heading " + ui.geoHeadingValue.textContent + " | Gate " + ui.geoGateValue.textContent, 54, 390);
    context.fillText(ui.xrDebugText.textContent, 54, 432);

    state.xrHud.texture.needsUpdate = true;
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || "").split(/\s+/);
    let line = "";
    let lineCount = 0;

    for (let index = 0; index < words.length; index += 1) {
      const testLine = line ? line + " " + words[index] : words[index];
      if (context.measureText(testLine).width > maxWidth && line) {
        context.fillText(line, x, y + lineCount * lineHeight);
        line = words[index];
        lineCount += 1;
        if (lineCount >= maxLines) {
          return;
        }
      } else {
        line = testLine;
      }
    }

    if (line && lineCount < maxLines) {
      context.fillText(line, x, y + lineCount * lineHeight);
    }
  }

  function drawRoundedRect(context, x, y, width, height, radius, fill, stroke, lineWidth) {
    const right = x + width;
    const bottom = y + height;
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(right - radius, y);
    context.quadraticCurveTo(right, y, right, y + radius);
    context.lineTo(right, bottom - radius);
    context.quadraticCurveTo(right, bottom, right - radius, bottom);
    context.lineTo(x + radius, bottom);
    context.quadraticCurveTo(x, bottom, x, bottom - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke && lineWidth > 0) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;
      context.stroke();
    }
  }

  function setGestureIndicatorsVisible(isVisible) {
    if (ui.gestureIndicators) {
      ui.gestureIndicators.hidden = !isVisible;
    }
    if (state.xrHud) {
      state.xrHud.indicators.visible = isVisible && shouldUseXrFallbackHud();
    }
  }

  function setGeoStatusVisible(isVisible) {
    ui.geoStatus.dataset.active = isVisible ? "true" : "false";
  }

  function shouldUseXrFallbackHud() {
    return Boolean(state.xrSession) && (!state.domOverlayActive || isLikelyIpadDevice());
  }

  function isLikelyIpadDevice() {
    const userAgent = navigator.userAgent || "";
    return /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
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
    refreshXrHudTexture();
  }

  function getPlacementGateStatus() {
    if (!navigator.geolocation) {
      return {
        allowed: false,
        message: "Placement locked: this browser does not support GPS location.",
        debug: "geo gate: geolocation unavailable"
      };
    }

    if (!state.userPosition) {
      startLocationTracking();
      return {
        allowed: false,
        message: "Placement locked: waiting for GPS location permission/fix. Tap again after location updates.",
        debug: state.userPositionError ? "geo gate: " + state.userPositionError : "geo gate: waiting for position"
      };
    }

    const nearestLocation = getNearestAllowedLocation();
    const distanceMeters = nearestLocation.distanceMeters;
    if (distanceMeters > CONFIG.allowedLocationRadiusMeters) {
      return {
        allowed: false,
        message: "Placement locked: move closer to one of the required locations. Nearest distance: " + distanceMeters.toFixed(1) + " m.",
        debug: "geo gate: nearest target " + (nearestLocation.index + 1) + ", " + distanceMeters.toFixed(1) + " m away"
      };
    }

    return {
      allowed: true,
      message: "Placement unlocked.",
      debug: "geo gate passed at target " + (nearestLocation.index + 1) + "; heading gate disabled"
    };
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

  function updateHud(message) {
    if (message) {
      ui.statusText.textContent = message;
    }

    let currentHeight = Math.max(0, state.placementCenter.y - state.planeHeight);
    if (state.floatingObject) {
      const floatingWorldPosition = new THREE.Vector3();
      state.floatingObject.getWorldPosition(floatingWorldPosition);
      currentHeight = Math.max(0, floatingWorldPosition.y - state.floatingObjectBaseWorldPosition.y);
    }
    ui.heightValue.textContent = currentHeight.toFixed(2);
    ui.separationValue.textContent = state.currentSeparation.toFixed(2);
    refreshXrHudTexture();
  }

  function setXRDebug(message) {
    ui.xrDebugText.textContent = "XR: " + message;
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
      setXRDebug("sun uses fallback light: no geolocation");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const sun = getSunPosition(new Date(), position.coords.latitude, position.coords.longitude);
        applySunPosition(sun);
      },
      () => {
        setXRDebug("sun uses fallback light: location denied");
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
    positionSunLightAt(state.cubesPlaced ? state.placementCenter : new THREE.Vector3());
    state.sunReady = true;
    if (!isCompassRefresh) {
      setXRDebug("sun shadows: elevation " + THREE.MathUtils.radToDeg(sun.elevation).toFixed(1) + " deg");
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

  function moveTowards(current, target, maxDelta) {
    if (Math.abs(target - current) <= maxDelta) {
      return target;
    }

    return current + Math.sign(target - current) * maxDelta;
  }
})();
