import { ExperienceStateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";

export function createTutorialController({ toggleElement, iconBtn, panelElement, textElement, prevBtn, nextBtn, indicator }) {
  let messageHistory = [];
  let historyIndex = -1;
  let panelOpen = false;
  let autoCollapseTimer = null;
  let collapseEnabled = false;
  let hasPinched = false;
  let stage1Seen = false;

  function pushToHistory(text) {
    if (!text) return;
    if (messageHistory.length === 0 || messageHistory[messageHistory.length - 1] !== text) {
      messageHistory.push(text);
      historyIndex = messageHistory.length - 1;
    }
  }

  function addMessage(text) {
    pushToHistory(text);
    if (text) {
      updatePanelContent();
      openPanel();
    }
  }

  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    panelElement.classList.remove("is-closing");
    panelElement.hidden = false;
    updatePanelContent();
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panelElement.classList.add("is-closing");
    panelElement.addEventListener("animationend", function onEnd() {
      panelElement.removeEventListener("animationend", onEnd);
      panelElement.hidden = true;
      panelElement.classList.remove("is-closing");
    });
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  function updatePanelContent() {
    if (historyIndex < 0 || historyIndex >= messageHistory.length) {
      textElement.textContent = "";
      indicator.textContent = "";
      return;
    }
    textElement.textContent = messageHistory[historyIndex];
    indicator.textContent = (historyIndex + 1) + "/" + messageHistory.length;
  }

  function navigatePrev() {
    if (messageHistory.length === 0) return;
    historyIndex = (historyIndex - 1 + messageHistory.length) % messageHistory.length;
    updatePanelContent();
  }

  function navigateNext() {
    if (messageHistory.length === 0) return;
    historyIndex = (historyIndex + 1) % messageHistory.length;
    updatePanelContent();
  }

  function scheduleAutoCollapse(delayMs) {
    if (autoCollapseTimer) clearTimeout(autoCollapseTimer);
    autoCollapseTimer = setTimeout(() => {
      if (panelOpen) closePanel();
      autoCollapseTimer = null;
    }, delayMs);
  }

  function show() {
    toggleElement.hidden = false;
  }

  function hide() {
    toggleElement.hidden = true;
    if (autoCollapseTimer) { clearTimeout(autoCollapseTimer); autoCollapseTimer = null; }
    closePanel();
  }

  iconBtn.addEventListener("click", togglePanel);
  prevBtn.addEventListener("click", navigatePrev);
  nextBtn.addEventListener("click", navigateNext);

  const stateToMsg = {
    Scanning: "Move your device to scan the area",
    PlaneDetected: "A flat surface was found. Tap to place the rock formation."
  };

  const unsubState = ExperienceStateManager.onStateChanged((newState) => {
    if (newState === "SessionEnded") { hide(); return; }
    const msg = stateToMsg[newState];
    if (msg) addMessage(msg);
  });

  const unsubStageChanged = EventBus.on("stage_changed", (data) => {
    if (data && data.stage === 1 && !stage1Seen) {
      stage1Seen = true;
      addMessage("Use your fingers to move the tectonic plates");
      collapseEnabled = true;
    }
  });

  const unsubPinch = EventBus.on("pinch_progress", (data) => {
    if (data && data.active && collapseEnabled && !hasPinched) {
      hasPinched = true;
      hide();
    }
  });

  const unsubSessionStart = EventBus.on("session_started", () => {
    show();
    hasPinched = false;
    collapseEnabled = false;
    stage1Seen = false;
  });

  const unsubSessionEnd = EventBus.on("session_ended", () => {
    hide();
  });

  const unsubFormationPlaced = EventBus.on("formation_placed", () => {
    addMessage("The formation is placed! Use the slider to explore geological stages.");
  });

  function dispose() {
    unsubState();
    unsubStageChanged();
    unsubPinch();
    unsubSessionStart();
    unsubSessionEnd();
    unsubFormationPlaced();
    iconBtn.removeEventListener("click", togglePanel);
    prevBtn.removeEventListener("click", navigatePrev);
    nextBtn.removeEventListener("click", navigateNext);
    if (autoCollapseTimer) clearTimeout(autoCollapseTimer);
  }

  return { show, hide, addMessage, dispose };
}