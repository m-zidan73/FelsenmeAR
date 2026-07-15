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
  rotationDegrees: [0, 180, 0],
  scaleMultiplier: 1 / 2,
};

export function createTectonicCollisionController({
  EventBus,
  modelUrl = "TectonicModel/public/FelsenmeAR.glb?v=tectonic-stage1-1",
  transform = DEFAULT_TRANSFORM,
  setXRDebug = () => {},
}) {
  let formationRoot = null;
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
    if (!formationRoot) return false;

    legacyStageOneNodes = findLegacyStageOneNodes(formationRoot);

    const nextModel = new FelsenmeARModel(formationRoot, {
      modelUrl,
      onLoad(loadedModel) {
        if (model !== loadedModel) return;
        alignToRoot();
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
      showLegacyNodes();
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
      showLegacyNodes();
    }
    if (model) model.dispose();

    formationRoot = null;
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

    legacyStageOneNodes.forEach((node) => { node.visible = false; });
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

  // ── EventBus-triggerable actions ──

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
    if (target !== "tectonic_plates" || !ready || !model || failed) return;
    if (meshName.includes("CapaInferior")) {
      model.grabLower(true);
    } else if (meshName.includes("CapaSuperior")) {
      model.grabUpper(true);
    }
  });

  EventBus.on("grab_end", ({ meshName }) => {
    if (!ready || !model || failed) return;
    if (meshName && meshName.includes("CapaInferior")) {
      model.grabLower(false);
    } else if (meshName && meshName.includes("CapaSuperior")) {
      model.grabUpper(false);
    } else {
      model.grabLower(false);
      model.grabUpper(false);
    }
  });

  // ── EventBus-triggerable actions ──

  function alignToRoot() {
    if (!model || !formationRoot) return;

    const resolvedTransform = {
      ...DEFAULT_TRANSFORM,
      ...transform,
    };
    const rotation = resolvedTransform.rotationDegrees || DEFAULT_TRANSFORM.rotationDegrees;
    const correctionPosition = resolvedTransform.position || DEFAULT_TRANSFORM.position;
    const scaleMultiplier = Number(resolvedTransform.scaleMultiplier) || 1;

    model.root.position.set(
      correctionPosition[0] || 0,
      correctionPosition[1] || 0,
      correctionPosition[2] || 0
    );
    model.root.rotation.set(
      THREE.MathUtils.degToRad(rotation[0] || 0),
      THREE.MathUtils.degToRad(rotation[1] || 0),
      THREE.MathUtils.degToRad(rotation[2] || 0)
    );
    model.root.scale.setScalar(scaleMultiplier);
    formationRoot.updateMatrixWorld(true);
  }

  function handleModelError(error) {
    failed = true;
    ready = false;
    if (model) model.root.visible = false;
    if (stageOneActive) showLegacyNodes();

    const message = error instanceof Error ? error.message : String(error);
    setXRDebug("tectonic model failed");
    if (window.__runtimeErrors) {
      window.__runtimeErrors.push("Tectonic model failed: " + message);
    }
    EventBus.raise("tectonic_model_error", { message });
  }

  function findLegacyStageOneNodes(root) {
    if (!root) return [];
    return LEGACY_STAGE_ONE_NODE_NAMES
      .map((name) => root.getObjectByName(name) || root.getObjectByName(name.replaceAll(" ", "_")))
      .filter(Boolean);
  }

  function showLegacyNodes() {
    legacyStageOneNodes.forEach((node) => { node.visible = true; });
  }

  function getPlateMeshes() {
    if (!model || !model.meshes) return [];
    const names = ["CapaInferiorA", "CapaInferiorB", "CapaSuperiorA", "CapaSuperiorB"];
    return names.map(n => model.meshes.get(n)).filter(Boolean);
  }

  return {
    attach,
    dispose,
    getPlateMeshes,
    handlePinchChange,
    handlePinchDebug,
    handleStageChange,
    isReplacementActive,
    reset,
    update,
  };
}
