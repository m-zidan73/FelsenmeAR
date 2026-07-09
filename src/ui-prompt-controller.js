import { ExperienceStateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";

export function createUIPromptController({ barElement, textElement }) {
  let currentText = "";
  let currentVisible = false;
  let sliderEverShown = false;

  function show(text) {
    if (text === currentText && currentVisible) return;
    currentText = text;
    currentVisible = !!text;
    if (textElement) {
      textElement.textContent = text;
    }
    if (barElement) {
      barElement.hidden = !text;
      if (text) {
        barElement.style.animation = "none";
        void barElement.offsetHeight;
        barElement.style.animation = "barIn 350ms ease";
      }
    }
  }

  function hide() {
    currentText = "";
    currentVisible = false;
    if (textElement) textElement.textContent = "";
    if (barElement) barElement.hidden = true;
  }

  const stateTextMap = {
    Loading: "",
    Ready: "",
    Scanning: "Move your device to scan the area",
    PlaneDetected: "A flat surface was found. Tap to place the rock formation.",
    FormationPlaced: "The formation is placed! Use the slider to explore geological stages.",
    Aligning: "Align the ghost rock with a real rock.",
    Aligned: "Tap to start.",
    RockRising: "",
    SliderActive: "Slide left to go back in time.",
    Stage5: "",
    Stage4: "",
    Stage3: "",
    Stage2: "",
    Stage1: "",
    PinchReady: "Pinch inward to collide the plates.",
    PinchActive: "Explore the stages freely.",
    TrackingLost: "Tracking lost. Point back at the rock.",
    SessionEnded: ""
  };

  const unsubState = ExperienceStateManager.onStateChanged((newState) => {
    if (newState === "SliderActive") sliderEverShown = true;

    if (newState === "Stage5" && sliderEverShown) {
      show("You've returned to the present.");
      return;
    }

    const text = stateTextMap[newState] || "";
    show(text);
  });

  const unsubSubduction = EventBus.on("subduction_progress", (data) => {
    if (data && data.progress >= 0.1 && data.progress < 1) {
      show("Plates are colliding — watch the magma rise");
    }
  });

  const unsubFormationPlaced = EventBus.on("formation_placed", () => {
    sliderEverShown = false;
  });

  const unsubPinchPhase = EventBus.on("pinch_phase", (data) => {
    if (data && typeof data.phase === "number") {
      show("");
    }
  });

  function dispose() {
    unsubState();
    unsubSubduction();
    unsubFormationPlaced();
    unsubPinchPhase();
  }

  return { show, hide, dispose };
}
