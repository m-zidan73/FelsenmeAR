import { getDescendantMeshes, setMeshesOpacity } from "../three-utils.js";

export function createGelifluctionStageController({ config, THREE, updateHud }) {
  let instance = null;
  let currentStage = 5;
  let busy = false;
  let revealDelaySeconds = null;
  let crossfade = null;
  let stageFourMixer = null;
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
    busy = true;
    revealDelaySeconds = config.stageFiveRevealDelaySeconds;

    const nodes = managedNodes();
    nodes.forEach((object) => {
      setObjectOpacity(object, 1);
      object.visible = false;
    });
    instance.nodes.Starting_Rock.visible = true;

    stageFourDuration = Math.max(...instance.stageFourClips.map((clip) => clip.duration));
    stageFourMixer = new THREE.AnimationMixer(instance.model);
    instance.stageFourClips.forEach((clip) => {
      const action = stageFourMixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    });
    stageFourMixer.setTime(0);

    subductionMixer = new THREE.AnimationMixer(instance.model);
    const subductionAction = subductionMixer.clipAction(instance.subductionClip);
    subductionAction.setLoop(THREE.LoopOnce, 1);
    subductionAction.clampWhenFinished = true;
    subductionAction.play();
    subductionMixer.setTime(0);

    updateHud("Gelifluction placed. Stage 5 is preparing.");
  }

  function requestStage(targetStage) {
    if (!instance || busy || Math.abs(targetStage - currentStage) !== 1) {
      return false;
    }

    const previousStage = currentStage;
    currentStage = targetStage;
    busy = true;

    if (previousStage === 1 && targetStage === 2) {
      resetSubductionAnimation();
    }

    if (previousStage === 5 && targetStage === 4) {
      startStageFourAnimation(1);
    } else if (previousStage === 4 && targetStage === 5) {
      startStageFourAnimation(-1);
    } else if (previousStage === 4 && targetStage === 3) {
      startCrossfade(
        [instance.nodes.Starting_Rock, instance.nodes.Surrounding_Rocks, instance.nodes.Slope],
        [instance.nodes.Earth_Crust_Right, instance.nodes["3rd Stage Rock"]]
      );
    } else if (previousStage === 3 && targetStage === 4) {
      startCrossfade(
        [instance.nodes.Earth_Crust_Right, instance.nodes["3rd Stage Rock"]],
        [instance.nodes.Starting_Rock, instance.nodes.Surrounding_Rocks, instance.nodes.Slope]
      );
    } else if (previousStage === 3 && targetStage === 2) {
      startCrossfade(
        [instance.nodes["3rd Stage Rock"]],
        [instance.nodes["2nd Stage Rock"]]
      );
    } else if (previousStage === 2 && targetStage === 3) {
      startCrossfade(
        [instance.nodes["2nd Stage Rock"]],
        [instance.nodes["3rd Stage Rock"]]
      );
    } else if (previousStage === 2 && targetStage === 1) {
      startCrossfade(
        [instance.nodes["2nd Stage Rock"]],
        [instance.nodes["1st Stage Rock"], instance.nodes.Earth_Crust_Left]
      );
    } else if (previousStage === 1 && targetStage === 2) {
      startCrossfade(
        [instance.nodes["1st Stage Rock"], instance.nodes.Earth_Crust_Left],
        [instance.nodes["2nd Stage Rock"]]
      );
    }

    updateHud("Stage " + targetStage + " transition in progress.");
    return true;
  }

  function startStageFourAnimation(direction) {
    stageFourDirection = direction;
    stageFourTime = direction > 0 ? 0 : stageFourDuration;
    stageFourMixer.setTime(stageFourTime);
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
    busy = false;
    updateHud("Stage " + currentStage + " ready.");
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
    stageFourMixer.setTime(stageFourTime);

    const endpointTolerance = 0.000001;
    const reachedEnd = stageFourDirection > 0 && stageFourTime >= stageFourDuration - endpointTolerance;
    const reachedStart = stageFourDirection < 0 && stageFourTime <= endpointTolerance;
    if (reachedEnd || reachedStart) {
      stageFourTime = reachedEnd ? stageFourDuration : 0;
      stageFourMixer.setTime(stageFourTime);
      stageFourDirection = 0;
      busy = false;
      updateHud("Stage " + currentStage + " ready.");
    }
  }

  function updateSubductionAnimation(deltaSeconds) {
    if (!pinchActive || currentStage !== 1 || busy || !subductionMixer) {
      return;
    }

    subductionTime = Math.min(instance.subductionClip.duration, subductionTime + deltaSeconds);
    subductionMixer.setTime(subductionTime);
  }

  function setPinchActive(isActive) {
    pinchActive = Boolean(isActive) && currentStage === 1 && !busy;
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
      instance.nodes.Starting_Rock,
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
    busy = false;
    revealDelaySeconds = null;
    crossfade = null;
    stageFourMixer = null;
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
