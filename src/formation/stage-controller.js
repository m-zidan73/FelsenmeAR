import { getDescendantMeshes, setMeshesOpacity } from "../three-utils.js";

export function createGelifluctionStageController({ config, THREE, updateHud }) {
  let instance = null;
  let currentStage = 5;
  let revealDelaySeconds = null;
  let crossfade = null;
  let stageFourMixer = null;
  let stageFourActions = [];
  let stageFourTime = 0;
  let stageFourDuration = 0;
  let stageFourDirection = 0;
  let subductionMixer = null;
  let subductionTime = 0;
  let pinchActive = false;

  function preparePlacement(nextInstance) {
    reset();
    instance = nextInstance;
    currentStage = 5;
    revealDelaySeconds = config.stageFiveRevealDelaySeconds;

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

    subductionMixer = new THREE.AnimationMixer(instance.model);
    const subductionAction = subductionMixer.clipAction(instance.subductionClip);
    subductionAction.setLoop(THREE.LoopOnce, 1);
    subductionAction.clampWhenFinished = true;
    subductionAction.play();
    subductionMixer.setTime(0);

    updateHud("Gelifluction placed. Stage 5 is preparing.");
  }

  function requestStage(targetStage) {
    if (!instance || Math.abs(targetStage - currentStage) !== 1) {
      return false;
    }

    const previousStage = currentStage;
    currentStage = targetStage;

    clearTransitionState();
    applyStageVisibility(targetStage, previousStage);
    updateHud("Stage " + targetStage + " ready.");
    return true;
  }

  function clearTransitionState() {
    crossfade = null;
    stageFourDirection = 0;
    stageFourTime = 0;
    subductionTime = 0;
    pinchActive = false;

    if (stageFourMixer) {
      stageFourMixer.stopAllAction();
      seekStageFourAnimation(0);
    }

    if (subductionMixer) {
      subductionMixer.stopAllAction();
      subductionMixer.setTime(0);
    }
  }

  function applyStageVisibility(targetStage, previousStage) {
    instance.nodes.Starting_Rock.visible = true;

    if (targetStage === 5) {
      revealDelaySeconds = config.stageFiveRevealDelaySeconds;
      hideManagedNodes([instance.nodes.Surrounding_Rocks, instance.nodes.Slope]);
      return;
    }

    revealDelaySeconds = null;

    if (targetStage === 4) {
      showManagedNodes([instance.nodes.Surrounding_Rocks, instance.nodes.Slope]);
      startStageFourAnimation(previousStage === 5 ? 1 : -1);
      return;
    }

    if (targetStage === 3) {
      startCrossfade(
        [instance.nodes.Surrounding_Rocks, instance.nodes.Slope],
        [instance.nodes.Earth_Crust_Right, instance.nodes["3rd Stage Rock"]]
      );
      return;
    }

    if (targetStage === 2) {
      startCrossfade(
        [instance.nodes["3rd Stage Rock"]],
        [instance.nodes["2nd Stage Rock"]]
      );
      return;
    }

    if (targetStage === 1) {
      startCrossfade(
        [instance.nodes["2nd Stage Rock"]],
        [instance.nodes["1st Stage Rock"], instance.nodes.Earth_Crust_Left]
      );
    }
  }

  function hideManagedNodes(objects) {
    uniqueObjects(objects).forEach((object) => {
      object.visible = false;
      setObjectOpacity(object, 1);
    });
  }

  function showManagedNodes(objects) {
    uniqueObjects(objects).forEach((object) => {
      object.visible = true;
      setObjectOpacity(object, 1);
    });
  }

  function startStageFourAnimation(direction) {
    if (!stageFourMixer || !stageFourActions.length) {
      return;
    }

    stageFourDirection = direction;
    stageFourTime = direction > 0 ? 0 : stageFourDuration;
    seekStageFourAnimation(stageFourTime);
  }

  function seekStageFourAnimation(time) {
    stageFourActions.forEach((action) => {
      action.enabled = true;
      action.paused = false;
    });
    stageFourMixer.setTime(time);
  }

  function startCrossfade(outgoing, incoming) {
    const outgoingObjects = uniqueObjects(outgoing);
    const incomingObjects = uniqueObjects(incoming);
    outgoingObjects.forEach((object) => {
      object.visible = true;
      setObjectOpacity(object, 1);
    });
    incomingObjects.forEach((object) => {
      object.visible = true;
      setObjectOpacity(object, 0);
    });
    crossfade = {
      outgoing: outgoingObjects,
      incoming: incomingObjects,
      elapsedSeconds: 0
    };
  }

  function update(deltaSeconds) {
    if (!instance) {
      return;
    }

    if (revealDelaySeconds !== null) {
      revealDelaySeconds -= deltaSeconds;
      if (revealDelaySeconds <= 0) {
        revealDelaySeconds = null;
        startCrossfade([], [instance.nodes.Surrounding_Rocks, instance.nodes.Slope]);
      }
    }

    updateCrossfade(deltaSeconds);
    updateStageFourAnimation(deltaSeconds);
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
    crossfade.outgoing.forEach((object) => setObjectOpacity(object, 1 - progress));
    crossfade.incoming.forEach((object) => setObjectOpacity(object, progress));

    if (progress < 1) {
      return;
    }

    crossfade.outgoing.forEach((object) => {
      object.visible = false;
      setObjectOpacity(object, 1);
    });
    crossfade.incoming.forEach((object) => setObjectOpacity(object, 1));
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

  function updateSubductionAnimation(deltaSeconds) {
    if (!pinchActive || currentStage !== 1 || !subductionMixer) {
      return;
    }

    subductionTime = Math.min(instance.subductionClip.duration, subductionTime + deltaSeconds);
    subductionMixer.setTime(subductionTime);
  }

  function setPinchActive(isActive) {
    pinchActive = Boolean(isActive) && currentStage === 1;
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
    currentStage = 5;
    revealDelaySeconds = null;
    crossfade = null;
    stageFourMixer = null;
    stageFourActions = [];
    stageFourTime = 0;
    stageFourDuration = 0;
    stageFourDirection = 0;
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
