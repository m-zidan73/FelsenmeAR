export function createFormationSlider({ state, ui, clamp, onStepSelected }) {
  function initFormationSlider() {
    if (!ui.formationRange || !ui.formationSlider) {
      return;
    }

    const snapThreshold = 0.16;
    let gestureStartStep = state.formationStep;
    let gestureCommitted = false;

    const applySliderValue = (rawValue, shouldSnap) => {
      const numericValue = clamp(Number(rawValue) || 0, 0, 4);
      const nearestStep = Math.round(numericValue);
      const snappedValue = shouldSnap
        ? nearestStep
        : Math.abs(numericValue - nearestStep) <= snapThreshold
          ? nearestStep
          : numericValue;
      const displayStep = Math.round(snappedValue);
      const progressPercent = (snappedValue / 4) * 100;

      ui.formationRange.value = snappedValue.toFixed(3);
      if (ui.formationFill) {
        ui.formationFill.style.width = progressPercent + "%";
      }

      ui.formationStages.forEach((stage, index) => {
        stage.classList.toggle("is-active", index === displayStep);
      });
      ui.formationDots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === displayStep);
      });

      if (shouldSnap && displayStep !== state.formationStep) {
        const previousStep = state.formationStep;
        state.formationStep = displayStep;
        onStepSelected(state.formationStep, previousStep);
      }
    };

    const commitSliderGesture = (rawValue) => {
      if (gestureCommitted) {
        return;
      }

      gestureCommitted = true;
      const requestedStep = Math.round(clamp(Number(rawValue) || 0, 0, 4));
      const adjacentStep = clamp(
        requestedStep,
        gestureStartStep - 1,
        gestureStartStep + 1
      );
      applySliderValue(adjacentStep, true);
    };

    state.setFormationSliderValue = applySliderValue;

    ui.formationRange.addEventListener("pointerdown", () => {
      gestureStartStep = state.formationStep;
      gestureCommitted = false;
      ui.formationSlider.classList.remove("is-prompting");
      ui.formationSlider.classList.add("is-dragging");
    });

    ui.formationRange.addEventListener("input", (event) => {
      applySliderValue(event.target.value, false);
    });

    ui.formationRange.addEventListener("change", (event) => {
      if (!gestureCommitted && !ui.formationSlider.classList.contains("is-dragging")) {
        gestureStartStep = state.formationStep;
      }
      commitSliderGesture(event.target.value);
    });

    ui.formationRange.addEventListener("keydown", () => {
      gestureStartStep = state.formationStep;
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

    ui.formationSlider.classList.add("is-prompting");
    applySliderValue(4, true);
  }

  function resetFormationSlider() {
    if (!ui.formationSlider || !state.setFormationSliderValue) {
      return;
    }

    state.formationStep = 4;
    ui.formationSlider.classList.add("is-prompting");
    state.setFormationSliderValue(4, true);
  }

  return {
    initFormationSlider,
    resetFormationSlider
  };
}
