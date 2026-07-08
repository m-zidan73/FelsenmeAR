export function createFormationSlider({ ui, clamp, onStepSelected, onPromptingChange = () => {}, onRender = () => {} }) {
  const snapThreshold = 0.16;
  let currentStep = 4;
  let gestureStartStep = 4;
  let gestureCommitted = false;

  function initFormationSlider() {
    if (!ui.formationRange || !ui.formationSlider) {
      return;
    }

    ui.formationRange.addEventListener("pointerdown", () => {
      beginFormationSliderGesture();
    });

    ui.formationRange.addEventListener("input", (event) => {
      renderSliderValue(event.target.value, false);
    });

    ui.formationRange.addEventListener("change", (event) => {
      if (!gestureCommitted && !ui.formationSlider.classList.contains("is-dragging")) {
        gestureStartStep = currentStep;
      }
      commitFormationSliderGesture(event.target.value);
    });

    ui.formationRange.addEventListener("keydown", () => {
      beginFormationSliderGesture();
    });

    window.addEventListener("pointerup", () => {
      if (!ui.formationSlider.classList.contains("is-dragging")) {
        return;
      }
      ui.formationSlider.classList.remove("is-dragging");
      commitFormationSliderGesture(ui.formationRange.value);
    });

    window.addEventListener("pointercancel", () => {
      ui.formationSlider.classList.remove("is-dragging");
      commitFormationSliderGesture(ui.formationRange.value);
    });

    resetFormationSlider();
  }

  function beginFormationSliderGesture() {
    gestureStartStep = currentStep;
    gestureCommitted = false;
    setPrompting(false);
    if (ui.formationSlider) {
      ui.formationSlider.classList.add("is-dragging");
    }
  }

  function commitFormationSliderGesture(rawValue) {
    if (gestureCommitted) {
      return;
    }

    gestureCommitted = true;
    if (ui.formationSlider) {
      ui.formationSlider.classList.remove("is-dragging");
    }
    const requestedStep = Math.round(clamp(Number(rawValue) || 0, 0, 4));
    const adjacentStep = clamp(requestedStep, gestureStartStep - 1, gestureStartStep + 1);
    const accepted = adjacentStep !== currentStep && onStepSelected(adjacentStep, currentStep);
    if (accepted) {
      currentStep = adjacentStep;
    }
    renderSliderValue(currentStep, true);
  }

  function previewFormationSliderValue(rawValue) {
    renderSliderValue(rawValue, false);
  }

  function renderSliderValue(rawValue, shouldSnap) {
    const numericValue = clamp(Number(rawValue) || 0, 0, 4);
    const nearestStep = Math.round(numericValue);
    const displayedValue = shouldSnap || Math.abs(numericValue - nearestStep) <= snapThreshold
      ? nearestStep
      : numericValue;
    const displayStep = Math.round(displayedValue);
    const progressPercent = (displayedValue / 4) * 100;

    if (ui.formationRange) {
      ui.formationRange.value = displayedValue.toFixed(3);
    }
    if (ui.formationFill) {
      ui.formationFill.style.width = progressPercent + "%";
    }
    ui.formationStages.forEach((stage, index) => {
      stage.classList.toggle("is-active", index === displayStep);
    });
    ui.formationDots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === displayStep);
    });
    onRender(displayedValue, displayStep, progressPercent);
  }

  function resetFormationSlider() {
    currentStep = 4;
    gestureStartStep = 4;
    gestureCommitted = false;
    setPrompting(true);
    if (ui.formationSlider) {
      ui.formationSlider.classList.remove("is-dragging");
    }
    renderSliderValue(currentStep, true);
  }

  function setPrompting(isPrompting) {
    if (ui.formationSlider) {
      ui.formationSlider.classList.toggle("is-prompting", isPrompting);
    }
    onPromptingChange(isPrompting);
  }

  return {
    beginFormationSliderGesture,
    commitFormationSliderGesture,
    initFormationSlider,
    previewFormationSliderValue,
    resetFormationSlider
  };
}
