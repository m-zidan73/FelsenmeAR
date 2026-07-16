export function createOrientationController({
  targetElement,
  windowObject,
  documentObject,
  onResize,
  setXRDebug = () => {}
}) {
  const resizeDelaysMs = [0, 50, 150, 300, 600];
  const pendingTimers = new Set();
  let initialized = false;
  let lastOrientation = null;

  function getViewportSize() {
    const visualViewport = windowObject.visualViewport;
    const width = Math.round(visualViewport?.width || windowObject.innerWidth || 0);
    const height = Math.round(visualViewport?.height || windowObject.innerHeight || 0);
    return { width, height };
  }

  function applyOrientationClasses() {
    const { width, height } = getViewportSize();
    const orientation = width > height ? "landscape" : "portrait";
    const isShortLandscape = orientation === "landscape" && height <= 560;

    targetElement.classList.toggle("is-ar-landscape", orientation === "landscape");
    targetElement.classList.toggle("is-ar-portrait", orientation === "portrait");
    targetElement.classList.toggle("is-ar-short-landscape", isShortLandscape);
    targetElement.style.setProperty("--app-viewport-width", width + "px");
    targetElement.style.setProperty("--app-viewport-height", height + "px");

    if (orientation !== lastOrientation) {
      lastOrientation = orientation;
      setXRDebug("viewport " + orientation + " " + width + "x" + height);
    }
  }

  function refresh() {
    applyOrientationClasses();
    onResize();
  }

  function scheduleRefresh() {
    resizeDelaysMs.forEach((delay) => {
      const timer = windowObject.setTimeout(() => {
        pendingTimers.delete(timer);
        refresh();
      }, delay);
      pendingTimers.add(timer);
    });
  }

  function clearPendingTimers() {
    pendingTimers.forEach((timer) => windowObject.clearTimeout(timer));
    pendingTimers.clear();
  }

  function init() {
    if (initialized) return;
    initialized = true;

    windowObject.addEventListener("resize", scheduleRefresh);
    windowObject.addEventListener("orientationchange", scheduleRefresh);
    windowObject.visualViewport?.addEventListener("resize", scheduleRefresh);
    windowObject.visualViewport?.addEventListener("scroll", scheduleRefresh);
    windowObject.screen?.orientation?.addEventListener?.("change", scheduleRefresh);
    documentObject.addEventListener("fullscreenchange", scheduleRefresh);
    documentObject.addEventListener("webkitfullscreenchange", scheduleRefresh);

    scheduleRefresh();
  }

  function dispose() {
    if (!initialized) return;
    initialized = false;
    clearPendingTimers();

    windowObject.removeEventListener("resize", scheduleRefresh);
    windowObject.removeEventListener("orientationchange", scheduleRefresh);
    windowObject.visualViewport?.removeEventListener("resize", scheduleRefresh);
    windowObject.visualViewport?.removeEventListener("scroll", scheduleRefresh);
    windowObject.screen?.orientation?.removeEventListener?.("change", scheduleRefresh);
    documentObject.removeEventListener("fullscreenchange", scheduleRefresh);
    documentObject.removeEventListener("webkitfullscreenchange", scheduleRefresh);
  }

  return {
    dispose,
    init,
    refresh,
    scheduleRefresh
  };
}