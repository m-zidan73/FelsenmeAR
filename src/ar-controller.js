export function createArController({
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
}) {
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
    state.placementReticle.visible = false;
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

  function updateFrame(frame) {
    updateHitTest(frame);
    updatePlacementFromAnchor(frame);
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
      state.placementReticle.visible = false;
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

    state.placementReticle.position.copy(state.latestHit.position);
    state.placementReticle.quaternion.copy(state.latestHit.quaternion);
    state.placementReticle.visible = true;

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

  return {
    checkARSupport,
    releasePlacementAnchor,
    startARSession,
    startFromDetectedPlane,
    updateFrame
  };
}
