import { EventBus } from "./event-bus.js";
import { ExperienceStateManager } from "./state-manager.js";

export function createDataOverlayController({
  stageDataUrl,
  nameElement,
  eraElement,
  epochElement,
  rockTypeElement,
  plateElement,
  descriptionElement
}) {
  let stageData = [];
  let pinchData = null;
  let loaded = false;

  const elements = { nameElement, eraElement, epochElement, rockTypeElement, plateElement, descriptionElement };

  function setField(el, value) {
    if (!el) return;
    const hasValue = value && value.trim() !== "";
    el.textContent = hasValue ? value.trim() : "";
    el.hidden = !hasValue;
  }

  function showData(data) {
    if (!data) { hideAll(); return; }
    setField(nameElement, data.name);
    setField(eraElement, data.era);
    setField(epochElement, data.epoch);
    setField(rockTypeElement, data.rockType);
    setField(plateElement, data.plateName);
    setField(descriptionElement, data.description);
  }

  function showFormattedStats(formattedStr) {
    if (!formattedStr) { hideAll(); return; }
    const parts = formattedStr.split(" / ").map(s => s.trim());
    setField(nameElement, parts[0] || "");
    setField(eraElement, parts[1] || "");
    setField(epochElement, parts[2] || "");
    setField(rockTypeElement, parts[3] || "");
    setField(plateElement, parts[4] || "");
    setField(descriptionElement, parts[5] || "");
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
    if (data) showData(data);
  }

  function hideAll() {
    Object.values(elements).forEach(el => { if (el) el.hidden = true; });
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
      showData(pinchData);
    } else if (newState === "SliderActive") {
      showStageData(5);
    } else if (newState === "PinchActive") {
      showStageData(1);
    } else if (newState !== "PinchReady" && newState !== "SliderActive" && newState !== "PinchActive") {
      hideAll();
    }
  });

  const unsubPlateTouched = EventBus.on("plate_touched", (data) => {
    if (!data || !plateElement) return;
    const originalText = plateElement.textContent;
    const originalHidden = plateElement.hidden;
    setField(plateElement, data.plateName || data);
    setTimeout(() => {
      if (originalHidden) {
        plateElement.hidden = true;
      } else {
        setField(plateElement, originalText);
      }
    }, 3000);
  });

  function dispose() {
    unsubStage();
    unsubFormation();
    unsubState();
    unsubPlateTouched();
  }

  return { load, showStageData, hideAll, dispose, getStageData: () => stageData, getPinchData: () => pinchData };
}
