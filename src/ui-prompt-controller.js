import { ExperienceStateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";

export function createUIPromptController({ barElement, textElement }) {
  let currentText = "";
  let currentVisible = false;

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
    Loading: "Loading 3D assets...",
    Ready: "Press Start to begin",
    Scanning: "Move your device to scan the area",
    PlaneDetected: "A flat surface was found. Tap to place the rock formation.",
    FormationPlaced: "The formation is placed! Use the slider to explore geological stages.",
    Stage5: "Final Boulder — the present-day form",
    Stage4: "Rounded Boulders — erosion shapes the rock over time",
    Stage3: "Cracked Slab of Diorite — tectonic forces at work",
    Stage2: "Solid Quartz Diorite — magma cools underground",
    Stage1: "Continental Collision — the beginning of the journey",
    PinchActive: "Pinch inward to collide the plates",
    SessionEnded: ""
  };

  const unsubState = ExperienceStateManager.onStateChanged((newState) => {
    const text = stateTextMap[newState] || "";
    show(text);
  });

  const unsubEvents = EventBus.on("subduction_progress", (data) => {
    if (data.progress >= 1) {
      show("The collision is complete! Slide to see the result.");
    } else if (data.progress >= 0.1) {
      show("Plates are colliding — watch the magma rise");
    }
  });

  function dispose() {
    unsubState();
    unsubEvents();
  }

  return { show, hide, dispose };
}
