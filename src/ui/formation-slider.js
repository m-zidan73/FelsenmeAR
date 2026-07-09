export function createFormationSlider({ ui, clamp, onStepSelected }) {
  const snapThreshold = 0.16;
  let currentStep = 4;
  let gestureCommitted = false;

  function initFormationSlider() {
    if (!ui.formationRange || !ui.formationSlider) {
      return;
    }

    ui.formationRange.addEventListener("pointerdown", () => {
      gestureCommitted = false;
      ui.formationSlider.classList.remove("is-prompting");
      ui.formationSlider.classList.add("is-dragging");
    });

    ui.formationRange.addEventListener("input", (event) => {
      renderSliderValue(event.target.value, false);
    });

    ui.formationRange.addEventListener("change", (event) => {
      commitSliderGesture(event.target.value);
    });

    ui.formationRange.addEventListener("keydown", () => {
      gestureCommitted = false;
    });

    window.addEventListener("pointerup", () => {
      if (!ui.formationSlider.classList.contains("is-dragging")) {
        return;
      }
      ui.formationSlider.classList.remove("is-dragging");
      commitSliderGesture(ui.formationRange.value);
    });

    window.addEventListener("pointercancel", () => {
      ui.formationSlider.classList.remove("is-dragging");
      commitSliderGesture(ui.formationRange.value);
    });

    resetFormationSlider();
  }

  function commitSliderGesture(rawValue) {
    if (gestureCommitted) {
      return;
    }

    gestureCommitted = true;
    const requestedStep = Math.round(clamp(Number(rawValue) || 0, 0, 4));
    const accepted = requestedStep !== currentStep && onStepSelected(requestedStep, currentStep);
    if (accepted) {
      currentStep = requestedStep;
    }
    renderSliderValue(currentStep, true);
  }

  function renderSliderValue(rawValue, shouldSnap) {
    const numericValue = clamp(Number(rawValue) || 0, 0, 4);
    const nearestStep = Math.round(numericValue);
    const displayedValue = shouldSnap || Math.abs(numericValue - nearestStep) <= snapThreshold
      ? nearestStep
      : numericValue;
    const displayStep = Math.round(displayedValue);
    const progressPercent = (displayedValue / 4) * 100;

    ui.formationRange.value = displayedValue.toFixed(3);
    if (ui.formationFill) {
      ui.formationFill.style.width = progressPercent + "%";
    }
    ui.formationStages.forEach((stage, index) => {
      stage.classList.toggle("is-active", index === displayStep);
    });
    ui.formationDots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === displayStep);
    });
  }

  function resetFormationSlider() {
    if (!ui.formationSlider || !ui.formationRange) {
      return;
    }

    currentStep = 4;
    gestureCommitted = false;
    ui.formationSlider.classList.add("is-prompting");
    renderSliderValue(currentStep, true);
  }

  return { initFormationSlider, resetFormationSlider };
}
