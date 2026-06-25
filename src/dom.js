export function getUiElements() {
  return {
    mainMenu: document.getElementById("mainMenu"),
    canvasRoot: document.getElementById("canvasRoot"),
    overlay: document.getElementById("overlay"),
    statusText: document.getElementById("statusText"),
    loadingFill: document.getElementById("loadingFill"),
    loadingStateLabel: document.getElementById("loadingStateLabel"),
    scanPrompt: document.getElementById("scanPrompt"),
    startFromHereButton: document.getElementById("startFromHereButton"),
    heightValue: document.getElementById("heightValue"),
    separationValue: document.getElementById("separationValue"),
    xrDebugText: document.getElementById("xrDebugText"),
    startArButton: document.getElementById("startArButton"),
    resetButton: document.getElementById("resetButton"),
    menuButton: document.getElementById("menuButton"),
    bottomUi: document.querySelector(".bottom-ui"),
    formationSlider: document.getElementById("formationSlider"),
    formationRange: document.getElementById("formationRange"),
    formationFill: document.querySelector(".formation-fill"),
    formationStages: Array.from(document.querySelectorAll(".formation-stage")),
    formationDots: Array.from(document.querySelectorAll(".formation-dot")),
    geoStatus: document.getElementById("geoStatus"),
    geoDistanceValue: document.getElementById("geoDistanceValue"),
    geoHeadingValue: document.getElementById("geoHeadingValue"),
    geoGateValue: document.getElementById("geoGateValue")
  };
}
