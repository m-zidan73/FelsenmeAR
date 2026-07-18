export function createFormationSlider({ ui, clamp, onStepSelected }) {
  const snapThreshold = 0.16;
  let currentStep = 0;
  let gestureCommitted = false;
  let activationPromptActive = true;
  let slidePromptActive = false;
  let slidePromptConsumed = false;

  function initFormationSlider() {
    if (!ui.formationRange || !ui.formationSlider) {
      return;
    }

    ui.formationRange.addEventListener("pointerdown", () => {
      gestureCommitted = false;
      clearPromptClasses();
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
    const accepted = onStepSelected(requestedStep, currentStep);
    if (accepted) {
      currentStep = requestedStep;
      activationPromptActive = false;
      if (currentStep === 0 && !slidePromptConsumed) {
        slidePromptActive = true;
      } else {
        slidePromptActive = false;
        slidePromptConsumed = true;
      }
    } else if (activationPromptActive && currentStep === 0) {
      slidePromptActive = false;
    }
    applyPromptClasses();
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
    if (ui.formationSlider) {
      ui.formationSlider.style.setProperty("--slider-progress", progressPercent + "%");
    }
    ui.formationStages.forEach((stage, index) => {
      stage.classList.toggle("is-active", index === displayStep);
    });
    ui.formationDots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === displayStep);
    });
  }

  function applyPromptClasses() {
    clearPromptClasses();
    if (activationPromptActive) {
      ui.formationSlider.classList.add("is-activation-prompting");
    } else if (slidePromptActive) {
      ui.formationSlider.classList.add("is-prompting");
    }
  }

  function clearPromptClasses() {
    ui.formationSlider.classList.remove("is-prompting", "is-activation-prompting");
  }

  function resetFormationSlider() {
    if (!ui.formationSlider || !ui.formationRange) {
      return;
    }

    currentStep = 0;
    gestureCommitted = false;
    activationPromptActive = true;
    slidePromptActive = false;
    slidePromptConsumed = false;
    applyPromptClasses();
    renderSliderValue(currentStep, true);
  }

  return { initFormationSlider, resetFormationSlider };
}
