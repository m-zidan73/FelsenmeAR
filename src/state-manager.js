import { EventBus } from "./event-bus.js";

export const ExperienceState = Object.freeze({
  Loading: "Loading",
  Ready: "Ready",
  Scanning: "Scanning",
  PlaneDetected: "PlaneDetected",
  FormationPlaced: "FormationPlaced",
  Stage5: "Stage5",
  Stage4: "Stage4",
  Stage3: "Stage3",
  Stage2: "Stage2",
  Stage1: "Stage1",
  PinchActive: "PinchActive",
  SessionEnded: "SessionEnded"
});

const stateChangeListeners = new Set();
let currentState = ExperienceState.Loading;

export const ExperienceStateManager = {
  getState() {
    return currentState;
  },

  setState(newState) {
    if (currentState === newState) return;
    currentState = newState;
    stateChangeListeners.forEach(cb => { try { cb(newState); } catch (e) { console.warn("StateManager:", e); } });
    EventBus.raise("experience_state", newState);
  },

  onStateChanged(callback) {
    stateChangeListeners.add(callback);
    return () => stateChangeListeners.delete(callback);
  },

  reset() {
    stateChangeListeners.clear();
    currentState = ExperienceState.Loading;
  }
};
