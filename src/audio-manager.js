import { ExperienceStateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";

export function createAudioManager({ audioMapUrl }) {
  let audioMap = { mappings: [], audioBasePath: "" };
  let currentAudio = null;
  let currentLabel = "";
  const playedTriggers = new Set();
  let loaded = false;

  async function load() {
    try {
      const res = await fetch(audioMapUrl);
      audioMap = await res.json();
      loaded = true;
    } catch (e) {
      console.warn("AudioManager: failed to load audio map", e);
    }
  }

  function play(clip, interrupt = true) {
    if (!clip || !loaded) return;
    const src = audioMap.audioBasePath + encodeURIComponent(clip);

    if (currentAudio && !interrupt) {
      return;
    }

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }

    currentAudio = new Audio(src);
    currentAudio.preload = "auto";
    currentAudio.play().catch(() => {});
  }

  function playOnce(triggerKey, clip, interrupt = true) {
    if (playedTriggers.has(triggerKey)) return;
    playedTriggers.add(triggerKey);
    play(clip, interrupt);
  }

  function findMapping(trigger) {
    return audioMap.mappings.find(m => m.trigger === trigger);
  }

  const unsubState = ExperienceStateManager.onStateChanged((newState) => {
    const mapping = findMapping("state:" + newState);
    if (mapping) {
      play(mapping.clip, mapping.interrupt);
    }
  });

  const unsubSubduction = EventBus.on("subduction_progress", (data) => {
    if (data && typeof data.progress === "number") {
      const thresholds = [0.3, 0.5, 0.8, 1.0];
      for (const t of thresholds) {
        if (Math.abs(data.progress - t) < 0.05) {
          const mapping = findMapping("event:subduction_progress:" + t.toFixed(1));
          if (mapping) {
            playOnce("subduction:" + t, mapping.clip, mapping.interrupt);
          }
        }
      }
    }
  });

  const unsubStage = EventBus.on("stage_changed", (data) => {
    if (data && typeof data.stage === "number") {
      const mapping = findMapping("event:stage_changed:" + data.stage);
      if (mapping) {
        play(mapping.clip, mapping.interrupt);
      }
      if (data.previousStage === 1 && data.stage === 2) {
        const completeMapping = findMapping("event:stage_changed:2_from_1");
        if (completeMapping) {
          playOnce("stage:2_from_1", completeMapping.clip, completeMapping.interrupt);
        }
      }
    }
  });

  const unsubPinch = EventBus.on("pinch_progress", (data) => {
    if (data && data.active) {
      const mapping = findMapping("event:pinch_active");
      if (mapping) {
        playOnce("pinch_active", mapping.clip, mapping.interrupt);
      }
    }
  });

  function dispose() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }
    unsubState();
    unsubSubduction();
    unsubStage();
    unsubPinch();
  }

  return { load, play, dispose };
}
