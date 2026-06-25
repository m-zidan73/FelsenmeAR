import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CONFIG } from "./config.js";
import { getUiElements } from "./dom.js";
import { installRuntimeErrorCapture } from "./runtime-errors.js";
import { createAppState } from "./state.js";
import { getDistanceMeters, getSunPosition, normalizeDegrees } from "./geo.js";
import {
  applyModelShadowSettings,
  cloneModelForScene,
  disposeObject,
  getDescendantMeshes,
  getDirectChildMeshesExcept,
  getImportedObjectByName,
  getObjectSnapshot,
  getSelfMeshes,
  removeAndDisposeMeshes,
  setMeshesOpacity
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
      setXRDebug("model load failed");
      setMenuLoading(100, "Error", "Could not load the boulder model. Check the Assets folder and refresh.");
      window.__runtimeErrors.push("Boulder model load failed: " + error.message);
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
      updateFloatingObject(deltaSeconds);
      updateFadeTasks(deltaSeconds);
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
    state.reticle.visible = false;
    state.planeIndicator.visible = false;
    setScanPromptVisible(false);
    setStartFromHereVisible(false);
    resetFormationSlider();
    setFormationSliderVisible(true);
    positionSunLightAt(center);

    updateBoulderPlacement();
    state.bouldersRoot.updateMatrixWorld(true);
    state.floatingObjectRevealMeshes = getDirectChildMeshesExcept(
      state.floatingObject,
      [state.dustObject, ...Object.values(state.stageRockObjects)]
    );
    prepareBoulderVisibility();
    queueFade(state.foundationFadeMeshes.concat(getSelfMeshes(state.floatingObject)), 0, 1, CONFIG.modelFadeInDurationSeconds);
    if (state.floatingObject) {
      state.floatingObject.getWorldPosition(state.floatingObjectBaseWorldPosition);
      state.floatingObjectTargetWorldPosition.copy(state.floatingObjectBaseWorldPosition);
      state.floatingObjectTargetWorldPosition.y += CONFIG.floatingObjectTargetHeightMeters;
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
    setXRDebug(anchor ? "anchored placement" : "raw world-space placement");
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

  function getModelScale(referenceScene) {
    const bounds = new THREE.Box3().setFromObject(referenceScene);
    const size = bounds.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z, 0.001);

    return CONFIG.modelFootprintMeters / footprint;
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
    const currentWorldPosition = state.floatingObjectBaseWorldPosition.clone();
    currentWorldPosition.y = THREE.MathUtils.lerp(
      state.floatingObjectBaseWorldPosition.y,
      state.floatingObjectTargetWorldPosition.y,
      state.floatingObjectRiseProgress
    );

    if (state.floatingObject.parent) {
      state.floatingObject.parent.worldToLocal(currentWorldPosition);
    }
    state.floatingObject.position.copy(currentWorldPosition);
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

    state.bouldersRoot.position.copy(state.placementCenter);
    state.bouldersRoot.position.y = state.planeHeight;
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

    state.bouldersRoot = null;
    state.floatingObject = null;
    state.dustObject = null;
    state.stageRockObjects = { 1: null, 2: null, 3: null };
    state.stageRockMeshes = { 1: [], 2: [], 3: [] };
    state.floatingObjectBaseWorldPosition.set(0, 0, 0);
    state.floatingObjectTargetWorldPosition.set(0, 0, 0);
    state.floatingObjectPlacedAtTime = 0;
    state.floatingObjectTriggered = false;
    state.floatingObjectRiseProgress = 0;
    state.foundationFadeStarted = false;
    state.foundationFadeMeshes = [];
    state.floatingObjectRevealMeshes = [];
    state.floatingObjectRevealStarted = false;
    state.childRevealRequested = false;
    state.placementButtonReady = false;
    state.dustRevealQueued = false;
    state.dustRevealMeshes = [];
    state.dustRevealComplete = false;
    state.visibleFormationStage = 5;
    state.stageTransitionActive = false;
    state.fadeTasks = [];
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
    return {
      allowed: true,
      message: "Placement unlocked.",
      debug: "placement gate disabled"
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

})();
