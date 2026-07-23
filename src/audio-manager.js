import { ExperienceStateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";

export function createAudioManager({ audioMapUrl }) {
  let audioMap = { mappings: [], audioBasePath: "" };
  let currentAudio = null;
  let playedOnce = new Set();
  let loaded = false;
  let sequenceIndex = 0;
  let sequenceClips = [];
  let sequenceTrigger = "";

  let pendingRetry = null;
  let unlockAttached = false;
  let pendingState = null;
  let deferredState = null;
  let sequenceGap = 0;
  let pendingPlaneDetected = false;
  let _pinchGate = 0;
  let _tectonicBg = null;

  function attachUnlock() {
    if (unlockAttached) return;
    unlockAttached = true;
    const handler = () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("touchstart", handler);
      unlockAttached = false;
      if (!pendingRetry) return;
      const audio = pendingRetry;
      pendingRetry = null;
      audio.play().catch(() => {});
    };
    document.addEventListener("pointerdown", handler);
    document.addEventListener("touchstart", handler);
  }

  async function load() {
    try {
      const res = await fetch(audioMapUrl);
      audioMap = await res.json();
      loaded = true;
      if (pendingState) {
        deferredState = pendingState;
        pendingState = null;
      }
      if (deferredState) {
        const ds = deferredState;
        deferredState = null;
        handleStateChange(ds);
      }
    } catch (e) {
      console.warn("AudioManager: failed to load audio map", e);
    }
  }

  function playClip(clip, interrupt = true) {
    if (!clip || !loaded) return;
    const src = audioMap.audioBasePath + encodeURIComponent(clip);
    if (currentAudio && !interrupt) return;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }
    const audio = new Audio(src);
    audio.preload = "auto";
    const promise = audio.play();
    if (promise) {
      promise.catch(() => {
        pendingRetry = audio;
        if (!unlockAttached) attachUnlock();
      });
    }
    currentAudio = audio;
    EventBus.raise("clip_started", { clip });
    audio.onended = () => {
      if (currentAudio === audio) {
        currentAudio = null;
        EventBus.raise("clip_ended", { clip });
      }
    };
    return audio;
  }

  function advanceSequence() {
    if (sequenceIndex >= sequenceClips.length) {
      sequenceClips = [];
      sequenceGap = 0;
      const trigger = sequenceTrigger;
      sequenceTrigger = "";
      sequenceIndex = 0;
      if (trigger) {
        EventBus.raise("sequence_completed", { trigger });
      }
      return;
    }
    const clip = sequenceClips[sequenceIndex++];
    const audio = playClip(clip, true);
    if (audio) {
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        EventBus.raise("clip_ended", { clip });
        if (sequenceGap > 0 && sequenceIndex === sequenceClips.length - 1) {
          const g = sequenceGap;
          sequenceGap = 0;
          setTimeout(() => advanceSequence(), g);
        } else {
          advanceSequence();
        }
      };
    } else {
      advanceSequence();
    }
  }

  function playSequence(clips, interrupt = true, trigger = "", gap = 0) {
    if (!clips || clips.length === 0) return false;
    if (currentAudio && !interrupt) return false;
    pendingRetry = null;
    sequenceClips = clips;
    sequenceIndex = 0;
    sequenceTrigger = trigger;
    sequenceGap = gap;
    if (trigger) {
      EventBus.raise("sequence_started", { trigger });
    }
    advanceSequence();
    return true;
  }

  function findMapping(trigger) {
    return audioMap.mappings.find(m => m.trigger === trigger);
  }

  function _startTectonicBg() {
    _stopTectonicBg();
    _tectonicBg = new Audio("TectonicModel/dist/audio/tectonic-passage.mp3");
    _tectonicBg.currentTime = 19;
    _tectonicBg.volume = 0.6;
    _tectonicBg.play().catch(() => {});
  }

  function _stopTectonicBg() {
    if (_tectonicBg) {
      _tectonicBg.pause();
      _tectonicBg.src = "";
      _tectonicBg = null;
    }
  }

  function handleStateChange(newState) {
    if (!loaded) {
      pendingState = newState;
      return;
    }
    if (newState === "Scanning") {
      const mapping = findMapping("state:Scanning");
      if (mapping && mapping.clips) {
        const clips = ["1a. welcome.mp3", ...mapping.clips];
        playSequence(clips, mapping.interrupt !== false, "state:Scanning", 0);
      }
      // After 1a+1c end, wait 2s, play 3.Scan if still scanning
      EventBus.on("sequence_completed", function handler(data) {
        if (data && data.trigger === "state:Scanning") {
          EventBus.off("sequence_completed", handler);
          setTimeout(() => {
            if (ExperienceStateManager.getState() === "Scanning") {
              playClip("3.Scan.mp3", true);
            }
          }, 2000);
        }
      });
      return;
    }
    if (newState === "PlaneDetected") {
      if (sequenceTrigger === "state:Scanning" && sequenceClips.length > 0) {
        pendingPlaneDetected = true;
        return;
      }
      const mapping = findMapping("state:PlaneDetected");
      if (mapping) {
        if (mapping.clips) {
          playSequence(mapping.clips, mapping.interrupt !== false, "state:PlaneDetected", mapping.gap || 0);
        } else if (mapping.clip) {
          playClip(mapping.clip, mapping.interrupt !== false);
        }
      }
      return;
    }
    const mapping = findMapping("state:" + newState);
    if (mapping) {
      if (newState === "Stage1") {
        playedOnce.delete("pinch_phase:1");
        playedOnce.delete("pinch_phase:2");
        playedOnce.delete("pinch_phase:3");
        _pinchGate = 0;
        _stopTectonicBg();
        if (mapping.clips) {
          playSequence(mapping.clips, mapping.interrupt !== false, "state:" + newState, mapping.gap || 0);
        } else if (mapping.clip) {
          playClip(mapping.clip, mapping.interrupt !== false);
        }
        const handler = (ev) => {
          if (ev && ev.trigger === "state:Stage1") {
            EventBus.off("sequence_completed", handler);
            _pinchGate = 1;
          }
        };
        EventBus.on("sequence_completed", handler);
        return;
      }
      _pinchGate = 0;
      _stopTectonicBg();
      if (mapping.clips) {
        playSequence(mapping.clips, mapping.interrupt !== false, "state:" + newState, mapping.gap || 0);
      } else if (mapping.clip) {
        playClip(mapping.clip, mapping.interrupt !== false);
      }
    }
  }

  function handlePinchPhase(data) {
    if (!data || typeof data.phase !== "number") return;
    if (data.phase !== _pinchGate) return;
    const key = "pinch_phase:" + data.phase;
    if (playedOnce.has(key)) return;
    const mapping = findMapping("event:" + key);
    if (mapping && mapping.clips) {
      playedOnce.add(key);
      _pinchGate = 0;
      _startTectonicBg();
      setTimeout(() => {
        playSequence(mapping.clips, mapping.interrupt !== false, "event:" + key);
      }, 1000);
      const handler = (ev) => {
        if (ev && ev.trigger === "event:" + key) {
          EventBus.off("sequence_completed", handler);
          setTimeout(() => {
            _stopTectonicBg();
            _pinchGate = data.phase + 1;
          }, 1000);
        }
      };
      EventBus.on("sequence_completed", handler);
    }
  }

  function handlePinchReset() {
    playedOnce.delete("pinch_phase:1");
    playedOnce.delete("pinch_phase:2");
    playedOnce.delete("pinch_phase:3");
  }

  const unsubState = ExperienceStateManager.onStateChanged(handleStateChange);

  const unsubPinchPhase = EventBus.on("pinch_phase", handlePinchPhase);

  const unsubPinchReset = EventBus.on("pinch_reset", handlePinchReset);

  const unsubStage = EventBus.on("stage_changed", (data) => {
    if (data && typeof data.stage === "number") {
      if (data.stage === 5 && data.previousStage !== undefined) {
        const reentryMapping = findMapping("event:stage_changed:reentry_5");
        if (reentryMapping) {
          if (reentryMapping.clips) {
            playSequence(reentryMapping.clips, reentryMapping.interrupt !== false);
          } else if (reentryMapping.clip) {
            playClip(reentryMapping.clip, reentryMapping.interrupt !== false);
          }
        }
      }
    }
  });

  const unsubPendingPlaneDetected = EventBus.on("sequence_completed", (data) => {
    if (pendingPlaneDetected && data && data.trigger === "state:Scanning") {
      pendingPlaneDetected = false;
      const mapping = findMapping("state:PlaneDetected");
      if (mapping) {
        if (mapping.clips) {
          playSequence(mapping.clips, mapping.interrupt !== false, "state:PlaneDetected", mapping.gap || 0);
        } else if (mapping.clip) {
          playClip(mapping.clip, mapping.interrupt !== false);
        }
      }
    }
  });

  const unsubSubduction = EventBus.on("subduction_progress", (data) => {
    if (data && typeof data.progress === "number") {
      const thresholds = [0.3, 0.5, 0.8, 1.0];
      for (const t of thresholds) {
        if (Math.abs(data.progress - t) < 0.05) {
          const key = "event:subduction_progress:" + t.toFixed(1);
          const mapping = findMapping(key);
          if (mapping) {
            if (mapping.clips) {
              playSequence(mapping.clips, mapping.interrupt !== false, key);
            } else if (mapping.clip) {
              playClip(mapping.clip, mapping.interrupt !== false);
            }
          }
        }
      }
    }
  });

  function dispose() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }
    _stopTectonicBg();
    unsubState();
    unsubPinchPhase();
    unsubPinchReset();
    unsubStage();
    unsubPendingPlaneDetected();
    unsubSubduction();
  }

  function hasPlayed(key) {
    return playedOnce.has(key);
  }

  function canAdvancePinch() {
    return _pinchGate > 0;
  }

  function setPinchGate(gate) {
    _pinchGate = Math.max(0, Math.min(3, Number(gate) || 0));
  }

  function setPinchGateForRestart() {
    // Set gate to 2 so next pinch plays phase 2 (11b__)
    _pinchGate = 2;
    // Clear playedOnce for phases 2 and 3 so they can play again
    playedOnce.delete("pinch_phase:2");
    playedOnce.delete("pinch_phase:3");
  }

  return { load, playClip, playSequence, dispose, hasPlayed, canAdvancePinch, setPinchGate, setPinchGateForRestart };
}
