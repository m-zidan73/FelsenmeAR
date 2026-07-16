import { EventBus } from "./event-bus.js";
import { ExperienceStateManager } from "./state-manager.js";

export function createDataOverlayController({
  stageDataUrl,
  nameElement
}) {
  let stageData = [];
  let pinchData = null;
  let loaded = false;

  function setName(el, value) {
    if (!el) return;
    const has = value && value.trim() !== "";
    el.textContent = has ? value.trim() : "";
    el.hidden = !has;
  }

  async function load() {
    try {
      const res = await fetch(stageDataUrl);
      const json = await res.json();
      stageData = json.stages || [];
      pinchData = json.pinch || null;
      loaded = true;
    } catch (e) {
      console.warn("DataOverlay: failed to load stage data", e);
    }
  }

  function showStageData(stageIndex) {
    const data = stageData.find(s => s.index === stageIndex);
    if (data) setName(nameElement, data.name);
  }

  function hideAll() {
    if (nameElement) nameElement.hidden = true;
  }

  const unsubStage = EventBus.on("stage_changed", (data) => {
    if (data && typeof data.stage === "number") {
      showStageData(data.stage);
    }
  });

  const unsubFormation = EventBus.on("formation_placed", () => {
    showStageData(5);
  });

  const unsubState = ExperienceStateManager.onStateChanged((newState) => {
    if (newState === "PinchReady" && pinchData) {
      setName(nameElement, pinchData.name || "");
    } else if (newState === "SliderActive") {
      showStageData(5);
    } else if (newState === "PinchActive") {
      showStageData(1);
    } else if (newState !== "PinchReady" && newState !== "SliderActive" && newState !== "PinchActive") {
      hideAll();
    }
  });

  function dispose() {
    unsubStage();
    unsubFormation();
    unsubState();
  }

  return { load, showStageData, hideAll, dispose, getStageData: () => stageData, getPinchData: () => pinchData };
}
