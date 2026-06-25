import {
  getDescendantMeshes,
  getDirectChildMeshesExcept,
  getSelfMeshes,
  removeAndDisposeMeshes,
  setMeshesOpacity
} from "../three-utils.js";

export function createFormationController({ state, config, THREE, updateHud }) {
  function preparePlacement() {
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

    state.floatingObjectRevealMeshes = getDirectChildMeshesExcept(
      state.floatingObject,
      [state.dustObject, ...Object.values(state.stageRockObjects)]
    );
    prepareBoulderVisibility();
    queueFade(state.foundationFadeMeshes.concat(getSelfMeshes(state.floatingObject)), 0, 1, config.modelFadeInDurationSeconds);
    if (state.floatingObject) {
      state.floatingObject.getWorldPosition(state.floatingObjectBaseWorldPosition);
      state.floatingObjectTargetWorldPosition.copy(state.floatingObjectBaseWorldPosition);
      state.floatingObjectTargetWorldPosition.y += config.floatingObjectTargetHeightMeters;
      state.floatingObjectPlacedAtTime = performance.now();
    }
    if (state.formationStep === 3 || state.childRevealRequested) {
      startChildrenReveal();
    } else if (state.formationStep < 3) {
      processStage();
    }
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

  function startChildrenReveal() {
    state.childRevealRequested = true;
    if (!state.animationComplete || state.floatingObjectRevealStarted || !state.floatingObjectRevealMeshes.length) {
      return;
    }

    state.floatingObjectRevealStarted = true;
    queueFade(
      state.floatingObjectRevealMeshes,
      0,
      1,
      config.childRevealDurationSeconds
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
      config.dustRevealDurationSeconds,
      0,
      () => {
        state.dustRevealComplete = true;
        state.visibleFormationStage = 4;
        processStage();
      }
    );
  }

  function processStage() {
    if (!state.animationComplete || state.stageTransitionActive) {
      return;
    }

    if (!state.floatingObjectRevealStarted) {
      startChildrenReveal();
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
      config.formationTransitionDurationSeconds,
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
      config.formationTransitionDurationSeconds,
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
      config.formationTransitionDurationSeconds,
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
      config.formationTransitionDurationSeconds,
      0,
      () => finishFormationTransition(toStage)
    );
    updateHud("Stage " + toStage + " transition: " + ordinalStageName(toStage) + " Stage Rock appearing.");
  }

  function finishFormationTransition(stage) {
    state.visibleFormationStage = stage;
    state.stageTransitionActive = false;
    processStage();
  }

  function ordinalStageName(stage) {
    return stage === 1 ? "1st" : stage === 2 ? "2nd" : "3rd";
  }

  function updateFloatingObject(deltaSeconds) {
    if (!state.floatingObject || state.animationComplete) {
      return;
    }

    if (!state.floatingObjectTriggered) {
      if (performance.now() - state.floatingObjectPlacedAtTime < config.floatingObjectStartDelayMs) {
        return;
      }

      state.floatingObjectTriggered = true;
      state.animationStarted = true;
    }

    state.floatingObjectRiseProgress = Math.min(
      1,
      state.floatingObjectRiseProgress + deltaSeconds / config.floatingObjectRiseDurationSeconds
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
        startChildrenReveal();
      } else if (state.formationStep < 3) {
        processStage();
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
      config.sceneFadeOutDurationSeconds,
      0,
      () => {
        removeAndDisposeMeshes(foundationMeshes);
        state.foundationFadeMeshes = [];
      }
    );
  }

  function update(deltaSeconds) {
    updateFloatingObject(deltaSeconds);
    updateFadeTasks(deltaSeconds);
  }

  function triggerFloatingObject() {
    if (!state.floatingObject) {
      updateHud("Object_3 was not found, so nothing can float.");
      return;
    }

    state.floatingObjectTriggered = true;
    state.animationStarted = true;
  }

  function reset() {
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
    state.bouldersPlaced = false;
    state.animationStarted = false;
    state.animationComplete = false;
  }

  return {
    preparePlacement,
    processStage,
    reset,
    startChildrenReveal,
    triggerFloatingObject,
    update
  };
}
