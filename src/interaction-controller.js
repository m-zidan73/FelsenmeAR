export function createCanvasInteractionController({
  pinchActivityTimeoutMs,
  pinchDistanceThresholdPixels,
  onHudPointerInput = () => false,
  onHudSelectInput = () => false,
  onPinchChange,
  onPlacementTap
}) {
  const touchPointers = new Map();
  let canvas = null;
  let xrSession = null;
  let previousPinchDistance = null;
  let pinchActive = false;
  let lastInwardMovementTime = 0;
  let lastHudInputTime = 0;

  function attach(nextCanvas) {
    canvas = nextCanvas;
    canvas.addEventListener("click", handlePlacementInput);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerEnd);
    canvas.addEventListener("pointercancel", handlePointerEnd);
  }

  function setXrSession(nextSession) {
    if (xrSession === nextSession) {
      return;
    }
    if (xrSession) {
      xrSession.removeEventListener("select", handlePlacementInput);
    }
    xrSession = nextSession;
    if (xrSession) {
      xrSession.addEventListener("select", handlePlacementInput);
    }
  }

  function handlePlacementInput(event) {
    if (event && event.type === "click") {
      if (performance.now() - lastHudInputTime < 500 || consumeHudPointerInput(event)) {
        return;
      }
    } else if (event && consumeHudSelectInput(event)) {
      return;
    }

    onPlacementTap();
  }

  function handlePointerDown(event) {
    if (consumeHudPointerInput(event)) {
      return;
    }

    if (event.pointerType !== "touch") {
      return;
    }

    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPointers.size === 2) {
      previousPinchDistance = getPinchDistance();
    }
  }

  function handlePointerMove(event) {
    if (consumeHudPointerInput(event)) {
      return;
    }

    if (!touchPointers.has(event.pointerId)) {
      return;
    }

    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPointers.size !== 2) {
      setPinchActive(false);
      previousPinchDistance = null;
      return;
    }

    const distance = getPinchDistance();
    if (previousPinchDistance !== null) {
      const distanceDelta = distance - previousPinchDistance;
      if (distanceDelta <= -pinchDistanceThresholdPixels) {
        lastInwardMovementTime = performance.now();
        setPinchActive(true);
      } else {
        setPinchActive(false);
      }
    }
    previousPinchDistance = distance;
  }

  function handlePointerEnd(event) {
    if (consumeHudPointerInput(event)) {
      return;
    }

    touchPointers.delete(event.pointerId);
    previousPinchDistance = touchPointers.size === 2 ? getPinchDistance() : null;
    if (touchPointers.size < 2) {
      setPinchActive(false);
    }
  }

  function consumeHudPointerInput(event) {
    const consumed = onHudPointerInput(event);
    if (consumed) {
      lastHudInputTime = performance.now();
    }
    return consumed;
  }

  function consumeHudSelectInput(event) {
    const consumed = onHudSelectInput(event);
    if (consumed) {
      lastHudInputTime = performance.now();
    }
    return consumed;
  }

  function getPinchDistance() {
    const [first, second] = Array.from(touchPointers.values());
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function setPinchActive(isActive) {
    const nextValue = Boolean(isActive);
    if (pinchActive === nextValue) {
      return;
    }
    pinchActive = nextValue;
    onPinchChange(pinchActive);
  }

  function update(now) {
    if (pinchActive && now - lastInwardMovementTime > pinchActivityTimeoutMs) {
      setPinchActive(false);
    }
  }

  function reset() {
    touchPointers.clear();
    previousPinchDistance = null;
    lastInwardMovementTime = 0;
    setPinchActive(false);
  }

  return { attach, reset, setXrSession, update };
}
