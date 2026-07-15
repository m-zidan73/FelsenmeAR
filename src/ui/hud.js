export function createHudUi({ ui }) {
  function updateHud(message) {
    if (message) {
      ui.statusText.textContent = message;
    }
  }

  function setXRDebug(message) {
    ui.xrDebugText.textContent = "XR: " + message;
  }

  function setStageInstructionVisible(visible, message = "Tap on the 1st Stage") {
    if (!ui.stageInstruction) return;
    ui.stageInstruction.textContent = message;
    ui.stageInstruction.hidden = !visible;
  }

  return {
    setStageInstructionVisible,
    setXRDebug,
    updateHud
  };
}