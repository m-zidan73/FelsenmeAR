const TRANSITION_REFRESH_DELAYS_MS = [100, 300];

export function createViewportLayoutController({
  windowRef,
  documentRef,
  targetElement,
  onViewportChanged
}) {
  if (!windowRef || !documentRef || !targetElement?.style) {
    throw new Error("Viewport layout controller requires window, document, and a target element.");
  }
  if (typeof onViewportChanged !== "function") {
    throw new Error("Viewport layout controller requires an onViewportChanged callback.");
  }

  let started = false;
  let animationFrameId = null;
  let subscribedVisualViewport = null;
  const transitionTimerIds = new Set();

  function readViewportMetrics() {
    const visualViewport = windowRef.visualViewport;
    const visualHeight = Number(visualViewport?.height);
    const visualOffsetTop = Number(visualViewport?.offsetTop);

    return {
      height: Number.isFinite(visualHeight) && visualHeight > 0
        ? visualHeight
        : windowRef.innerHeight,
      offsetTop: Number.isFinite(visualOffsetTop) ? visualOffsetTop : 0
    };
  }

  function formatPixels(value) {
    return Math.round(value * 100) / 100 + "px";
  }

  function applyViewportMetrics() {
    animationFrameId = null;
    const { height, offsetTop } = readViewportMetrics();
    targetElement.style.setProperty("--ar-visual-viewport-top", formatPixels(offsetTop));
    targetElement.style.setProperty("--ar-visual-viewport-height", formatPixels(height));
    const isLandscape = windowRef.innerWidth > windowRef.innerHeight;
    const isShort = isLandscape && windowRef.innerHeight <= 560;
    windowRef.document.body.classList.toggle("is-landscape", isLandscape);
    windowRef.document.body.classList.toggle("is-portrait", !isLandscape);
    windowRef.document.body.classList.toggle("is-short", isShort);
    onViewportChanged();
  }

  function scheduleRefresh() {
    if (animationFrameId !== null) return;
    animationFrameId = windowRef.requestAnimationFrame(applyViewportMetrics);
  }

  function clearTransitionTimers() {
    for (const timerId of transitionTimerIds) {
      windowRef.clearTimeout(timerId);
    }
    transitionTimerIds.clear();
  }

  function refreshAfterTransition() {
    scheduleRefresh();
    clearTransitionTimers();
    for (const delay of TRANSITION_REFRESH_DELAYS_MS) {
      const timerId = windowRef.setTimeout(() => {
        transitionTimerIds.delete(timerId);
        scheduleRefresh();
      }, delay);
      transitionTimerIds.add(timerId);
    }
  }

  function start() {
    if (started) return;
    started = true;
    subscribedVisualViewport = windowRef.visualViewport || null;
    windowRef.addEventListener("resize", scheduleRefresh);
    subscribedVisualViewport?.addEventListener("resize", scheduleRefresh);
    subscribedVisualViewport?.addEventListener("scroll", scheduleRefresh);
    documentRef.addEventListener("fullscreenchange", refreshAfterTransition);
    scheduleRefresh();
  }

  function dispose() {
    if (!started) return;
    started = false;
    windowRef.removeEventListener("resize", scheduleRefresh);
    subscribedVisualViewport?.removeEventListener("resize", scheduleRefresh);
    subscribedVisualViewport?.removeEventListener("scroll", scheduleRefresh);
    documentRef.removeEventListener("fullscreenchange", refreshAfterTransition);
    subscribedVisualViewport = null;
    clearTransitionTimers();
    if (animationFrameId !== null) {
      windowRef.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    targetElement.style.removeProperty("--ar-visual-viewport-top");
    targetElement.style.removeProperty("--ar-visual-viewport-height");
  }

  return {
    dispose,
    refreshAfterTransition,
    start
  };
}