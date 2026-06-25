export function installRuntimeErrorCapture() {
  window.__runtimeErrors = [];
  window.addEventListener("error", (event) => {
    window.__runtimeErrors.push(event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    window.__runtimeErrors.push(String(event.reason));
  });
}
