import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const controllerUrl = new URL("../src/ui/viewport-layout-controller.js", import.meta.url);
const controllerSource = await readFile(controllerUrl, "utf8");
const controllerModule = await import(
  "data:text/javascript;base64," + Buffer.from(controllerSource).toString("base64")
);
const { createViewportLayoutController } = controllerModule;

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  dispatch(type) {
    for (const callback of this.listeners.get(type) || []) callback();
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  getPropertyValue(name) {
    return this.values.get(name) || "";
  }

  removeProperty(name) {
    this.values.delete(name);
  }

  setProperty(name, value) {
    this.values.set(name, value);
  }
}

function createEnvironment({ height = 768, offsetTop = 0, withVisualViewport = true } = {}) {
  const windowRef = new FakeEventTarget();
  const documentRef = new FakeEventTarget();
  const visualViewport = withVisualViewport ? new FakeEventTarget() : null;
  const targetElement = { style: new FakeStyle() };
  let frameId = 0;
  const frameCallbacks = new Map();
  let timerId = 0;
  const timers = new Map();

  windowRef.innerHeight = height;
  if (visualViewport) {
    visualViewport.height = height;
    visualViewport.offsetTop = offsetTop;
    windowRef.visualViewport = visualViewport;
  }
  windowRef.requestAnimationFrame = (callback) => {
    const id = ++frameId;
    frameCallbacks.set(id, callback);
    return id;
  };
  windowRef.cancelAnimationFrame = (id) => frameCallbacks.delete(id);
  windowRef.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  windowRef.clearTimeout = (id) => timers.delete(id);

  function flushAnimationFrame() {
    const callbacks = Array.from(frameCallbacks.values());
    frameCallbacks.clear();
    for (const callback of callbacks) callback();
  }

  function runNextTimer() {
    const next = Array.from(timers.entries()).sort((a, b) => a[1].delay - b[1].delay)[0];
    if (!next) return false;
    timers.delete(next[0]);
    next[1].callback();
    return true;
  }

  return {
    documentRef,
    flushAnimationFrame,
    frameCallbacks,
    runNextTimer,
    targetElement,
    timers,
    visualViewport,
    windowRef
  };
}

{
  const environment = createEnvironment({ height: 412.25, offsetTop: 18.5 });
  let resizeCount = 0;
  const controller = createViewportLayoutController({
    windowRef: environment.windowRef,
    documentRef: environment.documentRef,
    targetElement: environment.targetElement,
    onViewportChanged: () => { resizeCount += 1; }
  });

  controller.start();
  environment.flushAnimationFrame();
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-top"), "18.5px");
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-height"), "412.25px");
  assert.equal(resizeCount, 1);

  environment.visualViewport.height = 390;
  environment.visualViewport.offsetTop = 6;
  environment.windowRef.dispatch("resize");
  environment.visualViewport.dispatch("resize");
  assert.equal(environment.frameCallbacks.size, 1, "resize events should be batched");
  environment.flushAnimationFrame();
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-height"), "390px");
  assert.equal(resizeCount, 2);

  environment.documentRef.dispatch("fullscreenchange");
  assert.equal(environment.timers.size, 2);
  environment.flushAnimationFrame();
  assert.equal(resizeCount, 3);
  environment.visualViewport.height = 380;
  assert.equal(environment.runNextTimer(), true);
  environment.flushAnimationFrame();
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-height"), "380px");
  environment.visualViewport.height = 370;
  assert.equal(environment.runNextTimer(), true);
  environment.flushAnimationFrame();
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-height"), "370px");
  assert.equal(resizeCount, 5, "transition refreshes should capture delayed viewport changes");

  controller.dispose();
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-height"), "");
  environment.windowRef.dispatch("resize");
  assert.equal(environment.frameCallbacks.size, 0, "dispose should remove viewport listeners");
}

{
  const environment = createEnvironment({ height: 768, withVisualViewport: false });
  let resizeCount = 0;
  const controller = createViewportLayoutController({
    windowRef: environment.windowRef,
    documentRef: environment.documentRef,
    targetElement: environment.targetElement,
    onViewportChanged: () => { resizeCount += 1; }
  });

  controller.start();
  environment.flushAnimationFrame();
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-top"), "0px");
  assert.equal(environment.targetElement.style.getPropertyValue("--ar-visual-viewport-height"), "768px");
  assert.equal(resizeCount, 1);
  controller.dispose();
}

console.log("viewport-layout-controller regression checks passed");