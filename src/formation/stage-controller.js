import { getDescendantMeshes, setMeshesOpacity } from "../three-utils.js";

const STARTING_ROCK_INITIAL_SCALE = 0.35;
const STARTING_ROCK_FINAL_SCALE = STARTING_ROCK_INITIAL_SCALE * 0.5;
const STARTING_ROCK_MOVE_SECONDS = 6;

export function createGelifluctionStageController({
  config,
  THREE,
  updateHud,
  getStageOneTargetPosition = () => null,
  onSubductionPromptVisibleChange = () => {},
  onStageInstructionVisibleChange = () => {}
}) {
  let instance = null;
  let currentStage = 1;
  let isActivated = false;
  let crossfade = null;
  let stageFourMixer = null;
  let stageFourActions = [];
  let stageFourTime = 0;
  let stageFourDuration = 0;
  let stageFourDirection = 0;
  let startingRockBase = null;
  let startingRockMove = null;
  let subductionMixer = null;
  let subductionAction = null;
  let subductionTime = 0;
  let subductionComplete = false;
  let pinchActive = false;
  let pendingStageFiveSlopeHide = false;

  const tempSphereWorld = new THREE.Vector3();
  const tempRockWorld = new THREE.Vector3();
  const tempTargetWorld = new THREE.Vector3();
  const tempPosition = new THREE.Vector3();
  const tempScale = new THREE.Vector3();
  const tempBounds = new THREE.Box3();
  const tempCenterWorld = new THREE.Vector3();
  const tempPivotWorld = new THREE.Vector3();
  const tempCenterOffset = new THREE.Vector3();

  function preparePlacement(nextInstance) {
    reset();
    instance = nextInstance;
    currentStage = 1;
    isActivated = false;

    const nodes = managedNodes();
    nodes.forEach((object) => {
      setObjectOpacity(object, 1);
      object.visible = false;
    });
    setObjectVisible(instance.nodes.Starting_Rock, true);
    setObjectVisible(instance.nodes.Surrounding_Rocks, true);
    setObjectOpacity(instance.nodes.Surrounding_Rocks, 1, opacityExclusionsFor(instance.nodes.Surrounding_Rocks));
    setObjectOpacity(instance.nodes.Starting_Rock, 1);
    captureStartingRockBase();
    resetStartingRockToInitial();

    stageFourDuration = Math.max(...instance.stageFourClips.map((clip) => clip.duration));
    stageFourMixer = new THREE.AnimationMixer(instance.model);
    stageFourActions = instance.stageFourClips.map((clip) => {
      const action = stageFourMixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      return action;
    });
    seekStageFourAnimation(0);

    subductionMixer = new THREE.AnimationMixer(instance.model);
    subductionAction = subductionMixer.clipAction(instance.subductionClip);
    subductionAction.setLoop(THREE.LoopOnce, 1);
    subductionAction.clampWhenFinished = true;
    subductionAction.play();
    subductionMixer.setTime(0);

    onStageInstructionVisibleChange(true);
    updateHud("Gelifluction placed. Tap Stage 1 to begin.");
  }

  function requestStage(targetStage) {
    if (!instance || targetStage < 1 || targetStage > 5) {
      return false;
    }

    if (!isActivated) {
      if (targetStage !== 1) {
        return false;
      }

      isActivated = true;
      crossfade = null;
      onStageInstructionVisibleChange(false);
      resetSubductionAnimation();
      setSubductionPromptVisible(true);
      applyStageTransition(targetStage);
      startStartingRockMove();
      updateHud("Stage 1 ready.");
      return true;
    }

    if (targetStage === currentStage) {
      return false;
    }

    const previousStage = currentStage;
    currentStage = targetStage;
    interruptActiveTransition(previousStage, targetStage);
    if (targetStage === 1) {
      onStageInstructionVisibleChange(false);
      resetSubductionAnimation();
      setSubductionPromptVisible(true);
      startStartingRockMove();
    }
    applyStageTransition(targetStage);
    updateStageFourPlayback(previousStage, targetStage);

    updateHud("Stage " + targetStage + " ready.");
    return true;
  }

  function interruptActiveTransition(previousStage, targetStage) {
    crossfade = null;
    if (targetStage !== 5) {
      pendingStageFiveSlopeHide = false;
    }

    if (targetStage !== 4 && !(previousStage === 4 && targetStage === 5)) {
      stageFourDirection = 0;
    }

    if (previousStage === 1 && targetStage !== 1) {
      resetSubductionAnimation();
      setSubductionPromptVisible(false);
    }
  }

  function updateStageFourPlayback(previousStage, targetStage) {
    if (targetStage === 4 && previousStage === 5) {
      startStageFourAnimation(1);
    } else if (targetStage === 4 && previousStage < 4) {
      pauseStageFourAnimationAtEnd();
    } else if (previousStage < 5 && targetStage === 5) {
      pendingStageFiveSlopeHide = true;
      startStageFourAnimation(-1);
    } else if (targetStage !== 4) {
      stageFourDirection = 0;
    }
  }

  function applyStageTransition(targetStage) {
    const targetObjects = stageObjects(targetStage);
    const outgoingObjects = managedNodes().filter((object) => {
      const excludeObjects = opacityExclusionsFor(object);
      return object.visible && getObjectOpacity(object, excludeObjects) > 0 && !targetObjects.includes(object);
    });
    const incomingObjects = targetObjects.filter((object) => (
      !object.visible || hasHiddenDescendantMesh(object) || getObjectOpacity(object) < 1
    ));

    if (outgoingObjects.length || incomingObjects.length) {
      startCrossfade(outgoingObjects, incomingObjects);
    }
  }

  function stageObjects(stage) {
    if (stage === 5 || stage === 4) {
      return [instance.nodes.Surrounding_Rocks, instance.nodes.Slope];
    }

    if (stage === 3) {
      return [instance.nodes.Earth_Crust_Right, instance.nodes["3rd Stage Rock"]];
    }

    if (stage === 2) {
      return [instance.nodes.Earth_Crust_Right, instance.nodes["2nd Stage Rock"]];
    }

    if (stage === 1) {
      return [
        instance.nodes.Earth_Crust_Right,
        instance.nodes.Earth_Crust_Left,
        instance.nodes["1st Stage Rock"]
      ];
    }

    return [];
  }

  function startStageFourAnimation(direction) {
    stageFourDirection = direction;
    stageFourTime = direction > 0 ? 0 : stageFourDuration;
    seekStageFourAnimation(stageFourTime);
  }

  function pauseStageFourAnimationAtEnd() {
    stageFourDirection = 0;
    stageFourTime = stageFourDuration;
    seekStageFourAnimation(stageFourTime);
  }

  function seekStageFourAnimation(time) {
    stageFourActions.forEach((action) => {
      action.enabled = true;
      action.paused = false;
    });
    stageFourMixer.setTime(time);
  }

  function captureStartingRockBase() {
    const startingRock = instance?.nodes?.Starting_Rock;
    if (!startingRock) {
      startingRockBase = null;
      return;
    }

    startingRockBase = {
      position: startingRock.position.clone(),
      uniformScale: 1
    };
  }

  function resetStartingRockToInitial() {
    const startingRock = instance?.nodes?.Starting_Rock;
    if (!startingRock || !startingRockBase) return;

    setObjectVisible(startingRock, true);
    setObjectOpacity(startingRock, 1);
    startingRock.position.copy(startingRockBase.position);
    startingRock.scale.setScalar(startingRockBase.uniformScale * STARTING_ROCK_INITIAL_SCALE);
    startingRockMove = null;
  }

  function startStartingRockMove() {
    const startingRock = instance?.nodes?.Starting_Rock;
    if (!startingRock) return;
    if (!startingRockBase) captureStartingRockBase();
    if (!startingRockBase) return;

    resetStartingRockToInitial();
    const targetPosition = resolveStartingRockTargetPosition();
    startingRockMove = {
      elapsedSeconds: 0,
      waitingForTarget: !targetPosition,
      complete: false,
      startPosition: startingRock.position.clone(),
      targetPosition,
      startScale: startingRock.scale.clone(),
      targetScale: new THREE.Vector3().setScalar(startingRockBase.uniformScale * STARTING_ROCK_FINAL_SCALE)
    };
  }

  function resolveStartingRockTargetPosition() {
    const startingRock = instance?.nodes?.Starting_Rock;
    if (!startingRock || !startingRock.parent || !startingRockBase) return null;

    const sphereWorld = getStageOneTargetPosition(tempSphereWorld);
    if (!sphereWorld) return null;

    const originalScale = startingRock.scale.clone();
    startingRock.scale.setScalar(startingRockBase.uniformScale * STARTING_ROCK_FINAL_SCALE);
    startingRock.updateMatrixWorld(true);
    tempBounds.setFromObject(startingRock);
    tempBounds.getCenter(tempCenterWorld);
    startingRock.getWorldPosition(tempPivotWorld);
    tempCenterOffset.subVectors(tempCenterWorld, tempPivotWorld);
    startingRock.scale.copy(originalScale);
    startingRock.updateMatrixWorld(true);

    tempTargetWorld.copy(sphereWorld).sub(tempCenterOffset);
    return startingRock.parent.worldToLocal(tempTargetWorld.clone());
  }

  function startWaitingStartingRockMove() {
    const startingRock = instance?.nodes?.Starting_Rock;
    if (!startingRock || !startingRockMove) return false;

    const targetPosition = resolveStartingRockTargetPosition();
    if (!targetPosition) return false;

    startingRockMove.waitingForTarget = false;
    startingRockMove.elapsedSeconds = 0;
    startingRockMove.startPosition.copy(startingRock.position);
    startingRockMove.startScale.copy(startingRock.scale);
    startingRockMove.targetPosition = targetPosition;
    return true;
  }

  function updateStartingRockMove(deltaSeconds) {
    if (!startingRockMove || startingRockMove.complete) return;
    const startingRock = instance?.nodes?.Starting_Rock;
    if (!startingRock) return;

    if (startingRockMove.waitingForTarget && !startWaitingStartingRockMove()) {
      return;
    }

    startingRockMove.elapsedSeconds += Math.max(deltaSeconds, 0);
    const progress = THREE.MathUtils.clamp(startingRockMove.elapsedSeconds / STARTING_ROCK_MOVE_SECONDS, 0, 1);
    const eased = smoothstep(progress);

    startingRock.position.copy(tempPosition.lerpVectors(
      startingRockMove.startPosition,
      startingRockMove.targetPosition,
      eased
    ));
    startingRock.scale.copy(tempScale.lerpVectors(
      startingRockMove.startScale,
      startingRockMove.targetScale,
      eased
    ));

    if (progress >= 1) {
      startingRock.position.copy(startingRockMove.targetPosition);
      startingRock.scale.copy(startingRockMove.targetScale);
      startingRockMove.complete = true;
    }
  }

  function smoothstep(progress) {
    return progress * progress * (3 - 2 * progress);
  }

  function startCrossfade(outgoing, incoming) {
    const outgoingObjects = uniqueObjects(outgoing);
    const incomingObjects = uniqueObjects(incoming);
    const outgoingEntries = outgoingObjects.map((object) => {
      const excludeObjects = opacityExclusionsFor(object);
      return {
        object,
        excludeObjects,
        startOpacity: getObjectOpacity(object, excludeObjects)
      };
    });
    const incomingEntries = incomingObjects.map((object) => ({
      object,
      excludeObjects: [],
      startOpacity: getObjectOpacity(object)
    }));

    outgoingEntries.forEach(({ object, excludeObjects }) => {
      setObjectVisible(object, true, excludeObjects);
    });
    incomingEntries.forEach(({ object, excludeObjects }) => {
      setObjectVisible(object, true, excludeObjects);
    });

    crossfade = {
      outgoing: outgoingEntries,
      incoming: incomingEntries,
      elapsedSeconds: 0
    };
  }

  function update(deltaSeconds) {
    if (!instance) {
      return;
    }

    updateCrossfade(deltaSeconds);
    updateStageFourAnimation(deltaSeconds);
    updateStartingRockMove(deltaSeconds);
    updateStageFiveSlopeVisibility();
    updateSubductionAnimation(deltaSeconds);
  }

  function updateCrossfade(deltaSeconds) {
    if (!crossfade) {
      return;
    }

    crossfade.elapsedSeconds += deltaSeconds;
    const progress = THREE.MathUtils.clamp(
      crossfade.elapsedSeconds / config.formationFadeDurationSeconds,
      0,
      1
    );
    crossfade.outgoing.forEach(({ object, excludeObjects, startOpacity }) => {
      setObjectOpacity(object, startOpacity * (1 - progress), excludeObjects);
    });
    crossfade.incoming.forEach(({ object, excludeObjects, startOpacity }) => {
      setObjectOpacity(object, startOpacity + (1 - startOpacity) * progress, excludeObjects);
    });

    if (progress < 1) {
      return;
    }

    crossfade.outgoing.forEach(({ object, excludeObjects }) => {
      setObjectVisible(object, false, excludeObjects);
      setObjectOpacity(object, 1, excludeObjects);
    });
    crossfade.incoming.forEach(({ object, excludeObjects }) => {
      setObjectVisible(object, true, excludeObjects);
      setObjectOpacity(object, 1, excludeObjects);
    });
    crossfade = null;
  }

  function updateStageFourAnimation(deltaSeconds) {
    if (!stageFourDirection || !stageFourMixer) {
      return;
    }

    stageFourTime = THREE.MathUtils.clamp(
      stageFourTime + deltaSeconds * stageFourDirection,
      0,
      stageFourDuration
    );
    seekStageFourAnimation(stageFourTime);

    const endpointTolerance = 0.000001;
    const reachedEnd = stageFourDirection > 0 && stageFourTime >= stageFourDuration - endpointTolerance;
    const reachedStart = stageFourDirection < 0 && stageFourTime <= endpointTolerance;
    if (reachedEnd || reachedStart) {
      stageFourTime = reachedEnd ? stageFourDuration : 0;
      stageFourDirection = 0;
    }
  }

  function updateStageFiveSlopeVisibility() {
    if (!pendingStageFiveSlopeHide || currentStage !== 5 || crossfade) {
      return;
    }

    const endpointTolerance = 0.000001;
    const animationsAtStart = !stageFourDirection && stageFourTime <= endpointTolerance;
    if (!animationsAtStart) {
      return;
    }

    instance.nodes.Slope.visible = false;
    setObjectOpacity(instance.nodes.Slope, 1);
    pendingStageFiveSlopeHide = false;
  }

  function updateSubductionAnimation(deltaSeconds) {
    if (!pinchActive || subductionComplete || !isActivated || currentStage !== 1 || !subductionMixer) {
      return;
    }

    const duration = instance.subductionClip.duration;
    subductionTime = Math.min(duration, subductionTime + deltaSeconds);
    subductionMixer.setTime(subductionTime);

    const endpointTolerance = 0.000001;
    if (subductionTime >= duration - endpointTolerance) {
      holdSubductionAnimationAtEnd(duration);
    }
  }

  function setPinchActive(isActive) {
    pinchActive = Boolean(isActive)
      && Boolean(instance)
      && isActivated
      && currentStage === 1
      && !subductionComplete;
  }

  function holdSubductionAnimationAtEnd(duration) {
    subductionTime = duration;
    if (subductionAction) {
      subductionAction.enabled = true;
      subductionAction.paused = false;
    }
    subductionMixer.setTime(subductionTime);
    if (subductionAction) {
      subductionAction.paused = true;
    }
    subductionComplete = true;
    pinchActive = false;
    setSubductionPromptVisible(false);
  }

  function resetSubductionAnimation() {
    pinchActive = false;
    subductionComplete = false;
    subductionTime = 0;
    if (subductionAction) {
      subductionAction.enabled = true;
      subductionAction.paused = false;
    }
    if (subductionMixer) {
      subductionMixer.setTime(0);
    }
  }

  function setSubductionPromptVisible(isVisible) {
    onSubductionPromptVisibleChange(Boolean(isVisible));
  }

  function setObjectOpacity(object, opacity, excludeObjects = []) {
    setMeshesOpacity(getDescendantMeshesExcept(object, excludeObjects), opacity);
  }

  function getObjectOpacity(object, excludeObjects = []) {
    if (!object || !object.visible) {
      return 0;
    }

    const materials = getDescendantMeshesExcept(object, excludeObjects).flatMap((mesh) => (
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    )).filter(Boolean);

    if (!materials.length) {
      return 1;
    }

    const opacityTotal = materials.reduce((total, material) => {
      const opacityScale = material.userData.opacityScale ?? 1;
      return total + material.opacity / opacityScale;
    }, 0);
    return THREE.MathUtils.clamp(opacityTotal / materials.length, 0, 1);
  }

  function setObjectVisible(object, visible, excludeObjects = []) {
    if (!object) return;

    if (visible) {
      object.visible = true;
      getDescendantMeshes(object).forEach((mesh) => {
        mesh.visible = true;
      });
      return;
    }

    if (!excludeObjects.length) {
      object.visible = false;
      return;
    }

    object.visible = true;
    getDescendantMeshesExcept(object, excludeObjects).forEach((mesh) => {
      mesh.visible = false;
    });
  }

  function getDescendantMeshesExcept(object, excludeObjects = []) {
    const exclusions = excludeObjects.filter(Boolean);
    const meshes = getDescendantMeshes(object);
    if (!exclusions.length) return meshes;
    return meshes.filter((mesh) => !exclusions.some((excluded) => isObjectOrDescendantOf(mesh, excluded)));
  }

  function opacityExclusionsFor(object) {
    const startingRock = instance?.nodes?.Starting_Rock;
    if (!startingRock || object === startingRock || !isObjectOrDescendantOf(startingRock, object)) {
      return [];
    }
    return [startingRock];
  }

  function hasHiddenDescendantMesh(object) {
    return getDescendantMeshes(object).some((mesh) => !mesh.visible);
  }

  function isObjectOrDescendantOf(object, ancestor) {
    let current = object;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  function managedNodes() {
    return [
      instance.nodes.Surrounding_Rocks,
      instance.nodes.Slope,
      instance.nodes.Earth_Crust_Right,
      instance.nodes.Earth_Crust_Left,
      instance.nodes["3rd Stage Rock"],
      instance.nodes["2nd Stage Rock"],
      instance.nodes["1st Stage Rock"]
    ];
  }

  function uniqueObjects(objects) {
    return Array.from(new Set(objects.filter(Boolean)));
  }

  function getCurrentStage() {
    return currentStage;
  }

  function reset() {
    if (instance && stageFourMixer) {
      stageFourMixer.stopAllAction();
      stageFourMixer.uncacheRoot(instance.model);
    }
    if (instance && subductionMixer) {
      subductionMixer.stopAllAction();
      subductionMixer.uncacheRoot(instance.model);
    }

    instance = null;
    currentStage = 1;
    isActivated = false;
    crossfade = null;
    stageFourMixer = null;
    stageFourActions = [];
    stageFourTime = 0;
    stageFourDuration = 0;
    stageFourDirection = 0;
    startingRockBase = null;
    startingRockMove = null;
    subductionMixer = null;
    subductionAction = null;
    subductionTime = 0;
    subductionComplete = false;
    pinchActive = false;
    pendingStageFiveSlopeHide = false;
    setSubductionPromptVisible(false);
    onStageInstructionVisibleChange(false);
  }

  return {
    getCurrentStage,
    preparePlacement,
    requestStage,
    reset,
    setPinchActive,
    update
  };
}