import { getDescendantMeshes, setMeshesOpacity } from "../three-utils.js";

export function createGelifluctionStageController({ config, THREE, updateHud }) {
  let instance = null;
  let currentStage = 1;
  let isActivated = false;
  let crossfade = null;
  let stageFourMixer = null;
  let stageFourActions = [];
  let stageFourTime = 0;
  let stageFourDuration = 0;
  let stageFourDirection = 0;
  let startingRockMixer = null;
  let startingRockAction = null;
  let startingRockTime = 0;
  let startingRockDuration = 0;
  let startingRockDirection = 0;
  let subductionMixer = null;
  let subductionTime = 0;
  let pinchActive = false;

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
    instance.nodes.Starting_Rock.visible = true;

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

    startingRockDuration = instance.startingRockClip.duration;
    startingRockMixer = new THREE.AnimationMixer(instance.model);
    startingRockAction = startingRockMixer.clipAction(instance.startingRockClip);
    startingRockAction.setLoop(THREE.LoopOnce, 1);
    startingRockAction.clampWhenFinished = true;
    startingRockAction.play();
    seekStartingRockAnimation(0);

    subductionMixer = new THREE.AnimationMixer(instance.model);
    const subductionAction = subductionMixer.clipAction(instance.subductionClip);
    subductionAction.setLoop(THREE.LoopOnce, 1);
    subductionAction.clampWhenFinished = true;
    subductionAction.play();
    subductionMixer.setTime(0);

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
      applyStageTransition(targetStage);
      startStartingRockAnimation(1);
      updateHud("Stage 1 ready.");
      return true;
    }

    if (targetStage === currentStage) {
      return false;
    }

    const previousStage = currentStage;
    currentStage = targetStage;
    interruptActiveTransition(previousStage, targetStage);
    applyStageTransition(targetStage);
    updateStartingRockPlayback(previousStage, targetStage);
    updateStageFourPlayback(previousStage, targetStage);

    updateHud("Stage " + targetStage + " ready.");
    return true;
  }

  function interruptActiveTransition(previousStage, targetStage) {
    crossfade = null;

    if (targetStage !== 4 && !(previousStage === 4 && targetStage === 5)) {
      stageFourDirection = 0;
    }

    if (previousStage === 1 && targetStage !== 1) {
      resetSubductionAnimation();
    }
  }

  function updateStartingRockPlayback(previousStage, targetStage) {
    if (targetStage === 4 && previousStage < 4) {
      pauseStartingRockAnimationAtEnd();
    } else if (previousStage === 5 && targetStage < 5) {
      startStartingRockAnimation(1, 0);
    } else if (previousStage < 5 && targetStage === 5) {
      startStartingRockAnimation(-1, startingRockDuration);
    }
  }

  function updateStageFourPlayback(previousStage, targetStage) {
    if (targetStage === 4 && previousStage === 5) {
      startStageFourAnimation(1);
    } else if (targetStage === 4 && previousStage < 4) {
      pauseStageFourAnimationAtEnd();
    } else if (previousStage === 4 && targetStage === 5) {
      startStageFourAnimation(-1);
    } else if (targetStage !== 4) {
      stageFourDirection = 0;
    }
  }

  function applyStageTransition(targetStage) {
    const targetObjects = stageObjects(targetStage);
    const outgoingObjects = managedNodes().filter((object) => (
      object.visible && getObjectOpacity(object) > 0 && !targetObjects.includes(object)
    ));
    const incomingObjects = targetObjects.filter((object) => (
      !object.visible || getObjectOpacity(object) < 1
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

  function startStartingRockAnimation(direction, startTime = startingRockTime) {
    seekStartingRockAnimation(startTime);
    startingRockDirection = direction;
  }

  function pauseStartingRockAnimationAtEnd() {
    startingRockDirection = 0;
    seekStartingRockAnimation(startingRockDuration);
  }

  function seekStartingRockAnimation(time) {
    startingRockTime = THREE.MathUtils.clamp(time, 0, startingRockDuration);
    if (startingRockAction) {
      startingRockAction.enabled = true;
      startingRockAction.paused = false;
    }
    startingRockMixer.setTime(startingRockTime);
  }

  function startCrossfade(outgoing, incoming) {
    const outgoingObjects = uniqueObjects(outgoing);
    const incomingObjects = uniqueObjects(incoming);
    const outgoingEntries = outgoingObjects.map((object) => ({
      object,
      startOpacity: getObjectOpacity(object)
    }));
    const incomingEntries = incomingObjects.map((object) => ({
      object,
      startOpacity: getObjectOpacity(object)
    }));

    outgoingObjects.forEach((object) => {
      object.visible = true;
    });
    incomingObjects.forEach((object) => {
      object.visible = true;
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
    updateStartingRockAnimation(deltaSeconds);
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
    crossfade.outgoing.forEach(({ object, startOpacity }) => {
      setObjectOpacity(object, startOpacity * (1 - progress));
    });
    crossfade.incoming.forEach(({ object, startOpacity }) => {
      setObjectOpacity(object, startOpacity + (1 - startOpacity) * progress);
    });

    if (progress < 1) {
      return;
    }

    crossfade.outgoing.forEach(({ object }) => {
      object.visible = false;
      setObjectOpacity(object, 1);
    });
    crossfade.incoming.forEach(({ object }) => setObjectOpacity(object, 1));
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

  function updateStartingRockAnimation(deltaSeconds) {
    if (!startingRockDirection || !startingRockMixer) {
      return;
    }

    seekStartingRockAnimation(startingRockTime + deltaSeconds * startingRockDirection);

    const endpointTolerance = 0.000001;
    const reachedEnd = startingRockDirection > 0 && startingRockTime >= startingRockDuration - endpointTolerance;
    const reachedStart = startingRockDirection < 0 && startingRockTime <= endpointTolerance;
    if (reachedEnd || reachedStart) {
      seekStartingRockAnimation(reachedEnd ? startingRockDuration : 0);
      startingRockDirection = 0;
    }
  }

  function updateSubductionAnimation(deltaSeconds) {
    if (!pinchActive || !isActivated || currentStage !== 1 || !subductionMixer) {
      return;
    }

    subductionTime = Math.min(instance.subductionClip.duration, subductionTime + deltaSeconds);
    subductionMixer.setTime(subductionTime);
  }

  function setPinchActive(isActive) {
    pinchActive = Boolean(isActive) && isActivated && currentStage === 1;
  }

  function resetSubductionAnimation() {
    pinchActive = false;
    subductionTime = 0;
    if (subductionMixer) {
      subductionMixer.setTime(0);
    }
  }

  function setObjectOpacity(object, opacity) {
    setMeshesOpacity(getDescendantMeshes(object), opacity);
  }

  function getObjectOpacity(object) {
    if (!object || !object.visible) {
      return 0;
    }

    const materials = getDescendantMeshes(object).flatMap((mesh) => (
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
    if (instance && startingRockMixer) {
      startingRockMixer.stopAllAction();
      startingRockMixer.uncacheRoot(instance.model);
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
    startingRockMixer = null;
    startingRockAction = null;
    startingRockTime = 0;
    startingRockDuration = 0;
    startingRockDirection = 0;
    subductionMixer = null;
    subductionTime = 0;
    pinchActive = false;
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
