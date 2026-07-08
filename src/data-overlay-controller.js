import { EventBus } from "./event-bus.js";

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
  let loaded = false;

  async function load() {
    try {
      const res = await fetch(stageDataUrl);
      const json = await res.json();
      stageData = json.stages || [];
      loaded = true;
    } catch (e) {
      console.warn("DataOverlay: failed to load stage data", e);
    }
  }

  function showStageData(stageIndex) {
    const data = stageData.find(s => s.index === stageIndex);
    if (!data) return;

    if (nameElement) {
      nameElement.textContent = data.name;
      nameElement.hidden = false;
    }
    if (eraElement) {
      eraElement.textContent = data.era;
      eraElement.hidden = false;
    }
    if (epochElement) {
      epochElement.textContent = data.epoch;
      epochElement.hidden = false;
    }
    if (rockTypeElement) {
      rockTypeElement.textContent = data.rockType;
      rockTypeElement.hidden = false;
    }
    if (plateElement) {
      plateElement.textContent = data.plateName;
      plateElement.hidden = false;
    }
    if (descriptionElement) {
      descriptionElement.textContent = data.description;
      descriptionElement.hidden = false;
    }
  }

  function hideAll() {
    const elements = [nameElement, eraElement, epochElement, rockTypeElement, plateElement, descriptionElement];
    elements.forEach(el => { if (el) el.hidden = true; });
  }

  const unsubStage = EventBus.on("stage_changed", (data) => {
    if (data && typeof data.stage === "number") {
      showStageData(data.stage);
    }
  });

  const unsubFormation = EventBus.on("formation_placed", () => {
    showStageData(5);
  });

  function dispose() {
    unsubStage();
    unsubFormation();
  }

  return { load, showStageData, hideAll, dispose };
}
