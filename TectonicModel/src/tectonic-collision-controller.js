import * as THREE from "three";
import { FelsenmeARModel } from "./FelsenmeARModel.js";
import { createWorldPinchPrompt } from "./world-pinch-prompt.js";

const LEGACY_STAGE_ONE_NODE_NAMES = [
  "Earth_Crust_Right",
  "Earth_Crust_Left",
  "1st Stage Rock",
];

const PROGRESS_THRESHOLDS = [0, 0.3, 0.5, 0.8, 1];

const DEFAULT_TRANSFORM = {
  position: [0, 0, 0],
  rotationDegrees: [0, 180, 0],
  scaleMultiplier: (1 / 3) * 1.3,
};

export function createTectonicCollisionController({
  EventBus,
  modelUrl = "TectonicModel/public/FelsenmeAR.glb?v=tectonic-stage1-1",
  transform = DEFAULT_TRANSFORM,
  setXRDebug = () => {},
}) {
  let formationRoot = null;
  let sceneRoot = null;
  let placementRoot = null;
  let modelParent = null;
  let model = null;
  let activeCamera = null;
  let gesturePrompt = null;
  let gesturePromptRequested = false;
  let gesturePromptAudioSuppressed = false;
  let legacyStageOneNodes = [];
  let stageOneActive = false;
  let ready = false;
  let failed = false;
  let gestureArmed = true;
  let releaseObserved = true;
  let emittedProgress = new Set();

  function attach(options = {}) {
    reset();

    const attachment = normalizeAttachmentOptions(options);
    formationRoot = attachment.formationRoot;
    sceneRoot = attachment.sceneRoot;
    legacyStageOneNodes = findLegacyStageOneNodes(formationRoot);

    if (!sceneRoot || typeof sceneRoot.add !== "function") {
      handleModelError(new Error("Could not find the scene root for the tectonic model"));
      return false;
    }

    placementRoot = new THREE.Group();
    placementRoot.name = "FelsenmeAR Tectonic Placement Root";
    sceneRoot.add(placementRoot);
    modelParent = placementRoot;
    updatePlacement(attachment);

    const nextModel = new FelsenmeARModel(modelParent, {
      modelUrl,
      onLoad(loadedModel) {
        if (model !== loadedModel) return;
        alignToPlacementRoot();
        gesturePrompt = createWorldPinchPrompt({
          parent: model.root,
          bounds: getLocalBounds(model.root),
        });
        ready = true;
        failed = false;
        EventBus.raise("tectonic_model_ready", {});
        if (stageOneActive) activateReplacement();
      },
      onError(error) {
        if (model !== nextModel) return;
        handleModelError(error);
      },
    });

    model = nextModel;
    model.root.visible = false;
    model.onPhaseChange(handleIntermediatePhaseComplete);
    model.onComplete(handleAnimationComplete);
    return true;
  }

  function updatePlacement(options = {}) {
    if (!placementRoot) return;
    const position = options.position;
    const quaternion = options.quaternion;
    const planeHeight = Number.isFinite(options.planeHeight) ? options.planeHeight : null;
    activeCamera = options.camera || activeCamera;

    if (position && typeof position.copy === "function") {
      placementRoot.position.copy(position);
      if (planeHeight !== null) {
        placementRoot.position.y = planeHeight;
      }
    }

    if (quaternion && typeof quaternion.copy === "function") {
      placementRoot.quaternion.copy(quaternion);
    }

    placementRoot.updateMatrixWorld(true);
  }

  function handleStageChange(stage) {
    stageOneActive = stage === 1;
    if (!stageOneActive) {
      gesturePromptRequested = false;
      gesturePromptAudioSuppressed = false;
    }
    resetGestureState();
    resetProgressEvents();

    if (!model) return;

    model.showInitial();
    if (stageOneActive && ready && !failed) {
      activateReplacement();
    } else {
      model.root.visible = false;
      syncGesturePromptVisibility();
    }
  }

  function setGesturePromptVisible(visible) {
    gesturePromptRequested = Boolean(visible);
    syncGesturePromptVisibility();
  }

  function setGesturePromptAudioSuppressed(suppressed) {
    gesturePromptAudioSuppressed = Boolean(suppressed);
    syncGesturePromptVisibility();
  }

  function handlePinchChange(active) {
    if (!isReplacementActive()) return null;
    if (!active || !gestureArmed || model.isAnimating || model.complete) return null;

    const phase = model.phase + 1;
    const starters = [model.playPhase1, model.playPhase2, model.playPhase3];
    const start = starters[phase - 1];
    if (!start || !start.call(model)) return null;

    gestureArmed = false;
    releaseObserved = false;
    EventBus.raise("tectonic_phase_started", { phase });
    return phase;
  }

  function handlePinchDebug(debug) {
    if (!debug || debug.touchCount >= 2) return;
    if (debug.eventName !== "touch-end" && debug.eventName !== "pinch-reset") return;

    releaseObserved = true;
    armNextGestureWhenReady();
  }

  function update(deltaSeconds) {
    if (!isReplacementActive()) return;

    model.update(deltaSeconds);
    if (gesturePrompt) gesturePrompt.update(deltaSeconds, activeCamera);
    emitProgressMilestones(model.progress);
  }

  function reset() {
    if (model && stageOneActive) {
      legacyStageOneNodes.forEach((node) => {
        node.visible = true;
      });
    }
    if (gesturePrompt) gesturePrompt.dispose();
    if (model) model.dispose();

    formationRoot = null;
    sceneRoot = null;
    if (placementRoot) {
      placementRoot.removeFromParent();
    }
    placementRoot = null;
    modelParent = null;
    model = null;
    activeCamera = null;
    gesturePrompt = null;
    gesturePromptRequested = false;
    gesturePromptAudioSuppressed = false;
    legacyStageOneNodes = [];
    stageOneActive = false;
    ready = false;
    failed = false;
    resetGestureState();
    resetProgressEvents();
  }

  function dispose() {
    reset();
  }

  function isReplacementActive() {
    return Boolean(model && ready && !failed && stageOneActive && model.root.visible);
  }

  function getSphereWorldPosition(target = new THREE.Vector3()) {
    if (!model || !ready || failed || typeof model.getSphereWorldPosition !== "function") {
      return null;
    }
    return model.getSphereWorldPosition(target);
  }

  function activateReplacement() {
    if (!model || !ready || failed) return;

    legacyStageOneNodes.forEach((node) => {
      node.visible = false;
    });
    model.showInitial();
    model.root.visible = true;
    syncGesturePromptVisibility();
    emitProgressMilestones(0);
  }

  function handleIntermediatePhaseComplete(phase) {
    EventBus.raise("tectonic_phase_completed", { phase });
    armNextGestureWhenReady();
  }

  function handleAnimationComplete() {
    gesturePromptRequested = false;
    gesturePromptAudioSuppressed = false;
    syncGesturePromptVisibility();
    emitProgressMilestones(1);
    EventBus.raise("tectonic_phase_completed", { phase: 3 });
    EventBus.raise("tectonic_animation_complete", {});
    gestureArmed = false;
  }

  function armNextGestureWhenReady() {
    gestureArmed = Boolean(
      releaseObserved
      && model
      && !model.isAnimating
      && !model.complete
      && isReplacementActive()
    );
  }

  function syncGesturePromptVisibility() {
    if (gesturePrompt) {
      gesturePrompt.setVisible(
        gesturePromptRequested
        && !gesturePromptAudioSuppressed
        && isReplacementActive()
        && !model.complete
      );
    }
  }

  function resetGestureState() {
    gestureArmed = true;
    releaseObserved = true;
  }

  function resetProgressEvents() {
    emittedProgress = new Set();
  }

  function emitProgressMilestones(progress) {
    PROGRESS_THRESHOLDS.forEach((threshold) => {
      if (progress + 0.000001 < threshold || emittedProgress.has(threshold)) return;
      emittedProgress.add(threshold);
      EventBus.raise("subduction_progress", { progress: threshold });
    });
  }

  function alignToPlacementRoot() {
    if (!model || !modelParent) return;

    const resolvedTransform = {
      ...DEFAULT_TRANSFORM,
      ...transform,
    };
    const rotation = resolvedTransform.rotationDegrees || DEFAULT_TRANSFORM.rotationDegrees;
    const correctionPosition = resolvedTransform.position || DEFAULT_TRANSFORM.position;
    const scaleMultiplier = Number(resolvedTransform.scaleMultiplier) || 1;

    model.root.position.set(0, 0, 0);
    model.root.rotation.set(
      THREE.MathUtils.degToRad(rotation[0] || 0),
      THREE.MathUtils.degToRad(rotation[1] || 0),
      THREE.MathUtils.degToRad(rotation[2] || 0)
    );
    model.root.scale.setScalar(scaleMultiplier);
    modelParent.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(model.root);
    if (bounds.isEmpty()) {
      throw new Error("Could not measure tectonic model bounds");
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const bottomCenter = new THREE.Vector3(center.x, bounds.min.y, center.z);
    const bottomCenterLocal = modelParent.worldToLocal(bottomCenter.clone());

    model.root.position.sub(bottomCenterLocal);
    model.root.position.add(new THREE.Vector3().fromArray(correctionPosition));
    modelParent.updateMatrixWorld(true);
  }

  function getLocalBounds(root) {
    root.updateMatrixWorld(true);
    const worldBounds = new THREE.Box3().setFromObject(root);
    const localBounds = new THREE.Box3().makeEmpty();

    for (const x of [worldBounds.min.x, worldBounds.max.x]) {
      for (const y of [worldBounds.min.y, worldBounds.max.y]) {
        for (const z of [worldBounds.min.z, worldBounds.max.z]) {
          localBounds.expandByPoint(root.worldToLocal(new THREE.Vector3(x, y, z)));
        }
      }
    }

    return localBounds;
  }

  function normalizeAttachmentOptions(options) {
    if (options && typeof options.add === "function") {
      return {
        sceneRoot: options,
        formationRoot: null,
        position: null,
        quaternion: null,
        planeHeight: null,
      };
    }

    return {
      sceneRoot: options.sceneRoot || options.scene || null,
      formationRoot: options.formationRoot || null,
      position: options.position || null,
      quaternion: options.quaternion || null,
      camera: options.camera || null,
      planeHeight: options.planeHeight,
    };
  }

  function findLegacyStageOneNodes(root) {
    if (!root) return [];
    return LEGACY_STAGE_ONE_NODE_NAMES
      .map((name) => root.getObjectByName(name) || root.getObjectByName(name.replaceAll(" ", "_")))
      .filter(Boolean);
  }

  function handleModelError(error) {
    failed = true;
    ready = false;
    if (gesturePrompt) gesturePrompt.setVisible(false);
    if (model) model.root.visible = false;
    if (stageOneActive) {
      legacyStageOneNodes.forEach((node) => {
        node.visible = true;
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    setXRDebug("tectonic model failed");
    if (window.__runtimeErrors) {
      window.__runtimeErrors.push("Tectonic model failed: " + message);
    }
    EventBus.raise("tectonic_model_error", { message });
  }

  function getPlateMeshes() {
    if (!model || !model.meshes) return [];
    const names = ["CapaInferiorA", "CapaInferiorB", "CapaSuperiorA", "CapaSuperiorB"];
    return names.map(n => model.meshes.get(n)).filter(Boolean);
  }

  function resetToPhase1Initial() {
    if (!model || !ready || failed) return;
    legacyStageOneNodes.forEach((node) => {
      node.visible = false;
    });
    model.showInitial();
    model.root.visible = true;
    resetGestureState();
    resetProgressEvents();
    emitProgressMilestones(0);
    syncGesturePromptVisibility();
    EventBus.raise("tectonic_reset_to_phase1", {});
  }

  EventBus.on("tectonic_show_initial", () => {
    if (!ready || !model || failed) return;
    model.showInitial();
    EventBus.raise("tectonic_initial_shown", {});
  });

  EventBus.on("tectonic_show_final", () => {
    if (!ready || !model || failed) return;
    model.showFinal();
    EventBus.raise("tectonic_final_shown", {});
  });

  EventBus.on("grab_start", ({ target, meshName }) => {
    if (!ready || !model || failed) return;
    if (model.complete) {
      EventBus.raise("tectonic_show_final", {});
      return;
    }
    if (target !== "tectonic_plates") return;
    if (meshName.includes("CapaInferior")) {
      model.grabLower(true);
    } else if (meshName.includes("CapaSuperior")) {
      model.grabUpper(true);
    }
  });

  EventBus.on("grab_end", ({ meshName }) => {
    if (!ready || !model || failed || model.complete) return;
    if (meshName && meshName.includes("CapaInferior")) {
      model.grabLower(false);
    } else if (meshName && meshName.includes("CapaSuperior")) {
      model.grabUpper(false);
    } else {
      model.grabLower(false);
      model.grabUpper(false);
    }
  });

return {
    attach,
    dispose,
    getPlateMeshes,
    handlePinchChange,
    handlePinchDebug,
    handleStageChange,
    getSphereWorldPosition,
    isReplacementActive,
    reset,
    setGesturePromptVisible,
    setGesturePromptAudioSuppressed,
    updatePlacement,
    update,
    resetToPhase1Initial
  };
}
