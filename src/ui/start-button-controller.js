export function createStartButtonController({
  button,
  holdDurationMs,
  onStart,
  onGreenscreenStart
}) {
  let holdTimer = null;
  let greenscreenStartTriggered = false;

  function initStartButtonController() {
    if (!button) {
      return;
    }

    button.addEventListener("pointerdown", handlePointerDown);
    button.addEventListener("pointerup", clearHoldTimer);
    button.addEventListener("pointercancel", clearHoldTimer);
    button.addEventListener("pointerleave", clearHoldTimer);
    button.addEventListener("click", handleClick);
    button.addEventListener("contextmenu", preventContextMenu);
  }

  function handlePointerDown() {
    if (button.disabled) {
      return;
    }

    clearHoldTimer();
    greenscreenStartTriggered = false;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      greenscreenStartTriggered = true;
      onGreenscreenStart();
    }, holdDurationMs);
  }

  function handleClick(event) {
    if (greenscreenStartTriggered) {
      event.preventDefault();
      event.stopPropagation();
      greenscreenStartTriggered = false;
      return;
    }

    if (!button.disabled) {
      onStart();
    }
  }

  function preventContextMenu(event) {
    if (holdTimer || greenscreenStartTriggered) {
      event.preventDefault();
    }
  }

  function clearHoldTimer() {
    if (!holdTimer) {
      return;
    }

    window.clearTimeout(holdTimer);
    holdTimer = null;
  }

  return { initStartButtonController };
}