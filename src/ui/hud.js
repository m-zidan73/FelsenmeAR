export function createHudUi({ ui }) {
  function updateHud(message) {
    if (message) {
      ui.statusText.textContent = message;
    }
  }

  function setXRDebug(message) {
    ui.xrDebugText.textContent = "XR: " + message;
  }

  return {
    setXRDebug,
    updateHud
  };
}
