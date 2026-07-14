import * as THREE from "three";
import { FelsenmeARModel } from "./FelsenmeARModel.js";

const LEGACY_STAGE_ONE_NODE_NAMES = [
  "Earth_Crust_Right",
  "Earth_Crust_Left",
  "1st Stage Rock",
];

const PROGRESS_THRESHOLDS = [0, 0.3, 0.5, 0.8, 1];

const DEFAULT_TRANSFORM = {
  position: [0, 0, 0],
  rotationDegrees: [0, 0, 0],
  scaleMultiplier: 1 / 3,
};

export function createTectonicCollisionController({
  EventBus,
  modelUrl = "TectonicModel/public/FelsenmeAR.glb?v=tectonic-stage1-1",
  transform = DEFAULT_TRANSFORM,
  setXRDebug = () => {},
}) {
  let formationRoot = null;
  let modelParent = null;
  let model = null;
  let legacyStageOneNodes = [];
  let stageOneActive = false;
  let ready = false;
  let failed = false;
  let gestureArmed = true;
  let releaseObserved = true;
  let emittedProgress = new Set();

  function attach(nextFormationRoot) {
    reset();

    formationRoot = nextFormationRoot || null;
    modelParent = findModelParent(formationRoot);
    legacyStageOneNodes = findLegacyStageOneNodes(modelParent);

    if (!modelParent || legacyStageOneNodes.length !== LEGACY_STAGE_ONE_NODE_NAMES.length) {
      handleModelError(new Error("Could not find the legacy Stage 1 model hierarchy"));
      return false;
    }

    const nextModel = new FelsenmeARModel(modelParent, {
      modelUrl,
      onLoad(loadedModel) {
        if (model !== loadedModel) return;
        alignToLegacyStageOne();
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

  function handleStageChange(stage) {
    stageOneActive = stage === 1;
    resetGestureState();
    resetProgressEvents();

    if (!model) return;

    model.showInitial();
    if (stageOneActive && ready && !failed) {
      activateReplacement();
    } else {
      model.root.visible = false;
    }
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
    emitProgressMilestones(model.progress);
  }

  function reset() {
    if (model && stageOneActive) {
      legacyStageOneNodes.forEach((node) => {
        node.visible = true;
      });
    }
    if (model) model.dispose();

    formationRoot = null;
    modelParent = null;
    model = null;
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

  function activateReplacement() {
    if (!model || !ready || failed) return;

    legacyStageOneNodes.forEach((node) => {
      node.visible = false;
    });
    model.showInitial();
    model.root.visible = true;
    emitProgressMilestones(0);
  }

  function handleIntermediatePhaseComplete(phase) {
    EventBus.raise("tectonic_phase_completed", { phase });
    armNextGestureWhenReady();
  }

  function handleAnimationComplete() {
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

  function alignToLegacyStageOne() {
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
    model.root.scale.setScalar(1);
    modelParent.updateMatrixWorld(true);

    const targetBounds = getCombinedBounds(legacyStageOneNodes);
    const sourceBounds = new THREE.Box3().setFromObject(model.root);
    if (targetBounds.isEmpty() || sourceBounds.isEmpty()) {
      throw new Error("Could not measure Stage 1 model bounds");
    }

    const targetSize = targetBounds.getSize(new THREE.Vector3());
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const targetSpan = Math.max(targetSize.x, targetSize.z);
    const sourceSpan = Math.max(sourceSize.x, sourceSize.z);
    if (targetSpan <= 0 || sourceSpan <= 0) {
      throw new Error("Stage 1 model bounds have an invalid size");
    }

    model.root.scale.setScalar((targetSpan / sourceSpan) * scaleMultiplier);
    modelParent.updateMatrixWorld(true);

    const scaledSourceBounds = new THREE.Box3().setFromObject(model.root);
    const targetCenter = targetBounds.getCenter(new THREE.Vector3());
    const sourceCenter = scaledSourceBounds.getCenter(new THREE.Vector3());
    const targetBottom = new THREE.Vector3(targetCenter.x, targetBounds.min.y, targetCenter.z);
    const sourceBottom = new THREE.Vector3(sourceCenter.x, scaledSourceBounds.min.y, sourceCenter.z);
    const targetLocal = modelParent.worldToLocal(targetBottom.clone());
    const sourceLocal = modelParent.worldToLocal(sourceBottom.clone());

    model.root.position.add(targetLocal.sub(sourceLocal));
    model.root.position.add(new THREE.Vector3().fromArray(correctionPosition));
    modelParent.updateMatrixWorld(true);
  }

  function findModelParent(root) {
    if (!root) return null;
    return root.getObjectByName("Gelifluction") || root.children[0] || root;
  }

  function findLegacyStageOneNodes(root) {
    if (!root) return [];
    return LEGACY_STAGE_ONE_NODE_NAMES
      .map((name) => root.getObjectByName(name) || root.getObjectByName(name.replaceAll(" ", "_")))
      .filter(Boolean);
  }

  function getCombinedBounds(objects) {
    return objects.reduce((bounds, object) => {
      return bounds.union(new THREE.Box3().setFromObject(object));
    }, new THREE.Box3());
  }

  function handleModelError(error) {
    failed = true;
    ready = false;
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

  return {
    attach,
    dispose,
    handlePinchChange,
    handlePinchDebug,
    handleStageChange,
    isReplacementActive,
    reset,
    update,
  };
}
