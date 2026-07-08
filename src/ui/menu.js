export function createMenuUi({ arHud, state, ui, clamp, updateHud }) {
  function setMenuLoading(percent, label, message) {
    const clampedPercent = clamp(percent, 0, 100);
    if (ui.loadingFill) {
      ui.loadingFill.style.width = clampedPercent.toFixed(1) + "%";
    }
    if (ui.loadingStateLabel) {
      ui.loadingStateLabel.textContent = label;
    }
    if (message) {
      updateHud(message);
    }
  }

  function refreshReadyState() {
    if (state.modelLoadError) {
      ui.startArButton.disabled = true;
      setMenuLoading(100, "Error", "Could not load assets.");
      return;
    }
    if (!state.arSupportChecked) {
      ui.startArButton.disabled = true;
      setMenuLoading(Math.max(12, state.assetProgress * 80), "Checking", "Checking AR capability.");
      return;
    }
    if (!state.arSupported) {
      ui.startArButton.disabled = true;
      setMenuLoading(100, "Blocked", "This browser does not expose WebXR AR.");
      return;
    }
    if (!state.modelsLoaded) {
      ui.startArButton.disabled = true;
      setMenuLoading(18 + state.assetProgress * 62, "Loading", "Downloading assets.");
      return;
    }

    ui.startArButton.disabled = false;
    setMenuLoading(100, "Ready", "You Are Ready to Go.");
  }

  function setGeoStatusVisible(isVisible) {
    ui.geoStatus.dataset.active = isVisible ? "true" : "false";
  }

  function setMenuButtonVisible(isVisible) {
    const useArHud = shouldUseArHud();
    if (ui.menuButton) {
      ui.menuButton.hidden = useArHud || !isVisible;
    }
    if (arHud) {
      arHud.setMenuButtonVisible(isVisible);
    }
  }

  function setFormationSliderVisible(isVisible) {
    const useArHud = shouldUseArHud();
    if (ui.bottomUi) {
      ui.bottomUi.hidden = useArHud || !isVisible;
    }
    if (arHud) {
      arHud.setFormationSliderVisible(isVisible);
    }
  }

  function setScanPromptVisible(isVisible) {
    const useArHud = shouldUseArHud();
    if (ui.scanPrompt) {
      ui.scanPrompt.hidden = useArHud || !isVisible;
    }
    if (arHud) {
      arHud.setScanPromptVisible(isVisible);
    }
  }

  function shouldUseArHud() {
    return Boolean(state.xrSession && arHud);
  }

  function bounceScanPrompt() {
    if (!ui.scanPrompt) {
      return;
    }
    ui.scanPrompt.classList.remove("is-bouncing");
    void ui.scanPrompt.offsetWidth;
    ui.scanPrompt.classList.add("is-bouncing");
  }

  return {
    bounceScanPrompt,
    refreshReadyState,
    setFormationSliderVisible,
    setGeoStatusVisible,
    setMenuButtonVisible,
    setMenuLoading,
    setScanPromptVisible
  };
}
