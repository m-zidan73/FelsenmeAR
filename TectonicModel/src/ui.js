const BASE_DURATION = 8;

export function buildUI(model) {
  const panel = document.createElement("div");
  panel.style.cssText = "position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.7);color:#ccc;padding:12px 16px;border-radius:8px;font:13px monospace;z-index:10;display:flex;flex-direction:column;gap:8px;min-width:230px;";
  panel.innerHTML = `
    <div style="font-weight:bold;color:#fff;">FelsenmeAR</div>
    <div id="info-label" style="font-size:11px;color:#ff8;">loading...</div>
    <div>
      <input id="scrub-slider" type="range" min="0" max="1" step="0.001" value="0" style="width:100%;margin:4px 0">
      <div id="time-label" style="text-align:center;font-size:11px;">0.0s / ${BASE_DURATION.toFixed(1)}s</div>
    </div>
    <div style="display:flex;gap:6px;">
      <button id="btn-phase" style="flex:1;">Play Phase 1/3</button>
      <button id="btn-pause">Pause</button>
      <button id="btn-restart">Restart</button>
    </div>
    <div style="display:flex;gap:6px;">
      <button id="btn-inicial" style="flex:1;">Inicial</button>
      <button id="btn-final" style="flex:1;">Final</button>
    </div>
    <div style="display:flex;gap:6px;margin-top:4px;border-top:1px solid #555;padding-top:4px;">
      <button id="btn-shake-lower" style="flex:1;background:#553;color:#fa8;">Temblor Inferior</button>
      <button id="btn-shake-upper" style="flex:1;background:#535;color:#f8a;">Temblor Superior</button>
    </div>
    <div id="phase-label" style="text-align:center;font-size:11px;color:#ff8;">Phase 0 / 3</div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Speed</label>
      <input id="speed-slider" type="range" min="0.1" max="5" step="0.1" value="1" style="width:90px;">
      <span id="speed-label" style="min-width:32px;text-align:right;">1x</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Horizontal</label>
      <input id="h-slider" type="range" min="0" max="3" step="0.05" value="0.5" style="width:90px;">
      <span id="h-label" style="min-width:32px;text-align:right;">0.5</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Bending A</label>
      <input id="bend-slider" type="range" min="0" max="2" step="0.05" value="0.5" style="width:90px;">
      <span id="bend-label" style="min-width:32px;text-align:right;">0.5</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Stretch X</label>
      <input id="stretch-slider" type="range" min="0.5" max="2.5" step="0.05" value="1.0" style="width:90px;">
      <span id="stretch-label" style="min-width:32px;text-align:right;">1.0</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Vert.Stretch</label>
      <input id="vstretch-slider" type="range" min="0" max="3" step="0.05" value="1" style="width:90px;">
      <span id="vstretch-label" style="min-width:32px;text-align:right;">1.0</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Magma2 Flatten</label>
      <input id="magma2-slider" type="range" min="0.50" max="1.0" step="0.01" value="1.0" style="width:90px;">
      <span id="magma2-label" style="min-width:32px;text-align:right;">1.0</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Magma2 OffsetZ</label>
      <input id="magma2oz-slider" type="range" min="-0.5" max="0.5" step="0.01" value="0" style="width:90px;">
      <span id="magma2oz-label" style="min-width:32px;text-align:right;">0.0</span>
    </div>
    <div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;"></div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Sphere V</label>
      <input id="sphere-v" type="range" min="-2" max="3" step="0.01" value="1.96" style="width:90px;">
      <span id="sphere-v-label" style="min-width:32px;text-align:right;">1.96</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Sphere L</label>
      <input id="sphere-l" type="range" min="-2" max="3" step="0.01" value="1.26" style="width:90px;">
      <span id="sphere-l-label" style="min-width:32px;text-align:right;">1.26</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Cylinder V</label>
      <input id="cyl-v" type="range" min="-2" max="3" step="0.01" value="1.63" style="width:90px;">
      <span id="cyl-v-label" style="min-width:32px;text-align:right;">1.63</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:11px;">Cylinder L</label>
      <input id="cyl-l" type="range" min="-2" max="3" step="0.01" value="1.19" style="width:90px;">
      <span id="cyl-l-label" style="min-width:32px;text-align:right;">1.19</span>
    </div>
  `;
  document.body.appendChild(panel);

  const infoLabel = panel.querySelector("#info-label");
  const timeLabel = panel.querySelector("#time-label");
  const btnPause = panel.querySelector("#btn-pause");
  const btnRestart = panel.querySelector("#btn-restart");
  const btnPhase = panel.querySelector("#btn-phase");
  const phaseLabel = panel.querySelector("#phase-label");
  const speedSlider = panel.querySelector("#speed-slider");
  const speedLabel = panel.querySelector("#speed-label");
  const scrubSlider = panel.querySelector("#scrub-slider");
  const hSlider = panel.querySelector("#h-slider");
  const hLabel = panel.querySelector("#h-label");
  const bendSlider = panel.querySelector("#bend-slider");
  const bendLabel = panel.querySelector("#bend-label");
  const stretchSlider = panel.querySelector("#stretch-slider");
  const stretchLabel = panel.querySelector("#stretch-label");
  const vstretchSlider = panel.querySelector("#vstretch-slider");
  const vstretchLabel = panel.querySelector("#vstretch-label");
  const magma2Slider = panel.querySelector("#magma2-slider");
  const magma2Label = panel.querySelector("#magma2-label");
  const magma2ozSlider = panel.querySelector("#magma2oz-slider");
  const magma2ozLabel = panel.querySelector("#magma2oz-label");

  const sphereVSlider = panel.querySelector("#sphere-v");
  const sphereVLabel = panel.querySelector("#sphere-v-label");
  const sphereLSlider = panel.querySelector("#sphere-l");
  const sphereLLabel = panel.querySelector("#sphere-l-label");
  const cylVSlider = panel.querySelector("#cyl-v");
  const cylVLabel = panel.querySelector("#cyl-v-label");
  const cylLSlider = panel.querySelector("#cyl-l");
  const cylLLabel = panel.querySelector("#cyl-l-label");

  let currentPhaseUI = 0;
  let isAnimatingUI = false;
  let animTimeUI = 0;

  function updateTimeDisplay() {
    timeLabel.textContent = animTimeUI.toFixed(1) + "s / " + BASE_DURATION.toFixed(1) + "s";
    scrubSlider.value = Math.min(animTimeUI / BASE_DURATION, 1);
  }

  btnPhase.onclick = () => {
    if (currentPhaseUI >= 3) return;
    const p = currentPhaseUI;
    if (p === 0) model.playPhase1();
    else if (p === 1) model.playPhase2();
    else if (p === 2) model.playPhase3();
    animTimeUI = p * (BASE_DURATION / 3);
    isAnimatingUI = true;
    btnPause.textContent = "Pause";
    phaseLabel.textContent = `Phase ${p + 1} / 3`;
    btnPhase.textContent = `Playing ${p + 1}/3...`;
    btnPhase.disabled = true;
  };

  btnPause.onclick = () => {
    isAnimatingUI = model.togglePlay();
    btnPause.textContent = isAnimatingUI ? "Pause" : "Play";
  };

  const btnInicial = panel.querySelector("#btn-inicial");
  const btnFinal = panel.querySelector("#btn-final");

  btnRestart.onclick = () => {
    model.reset();
    currentPhaseUI = 0;
    animTimeUI = 0;
    isAnimatingUI = false;
    btnPause.textContent = "Pause";
    btnPhase.textContent = "Play Phase 1/3";
    btnPhase.disabled = false;
    phaseLabel.textContent = "Phase 0 / 3";
    updateTimeDisplay();
  };

  btnInicial.onclick = () => {
    model.showInitial();
    currentPhaseUI = 0;
    animTimeUI = 0;
    isAnimatingUI = false;
    btnPause.textContent = "Pause";
    btnPhase.textContent = "Play Phase 1/3";
    btnPhase.disabled = false;
    phaseLabel.textContent = "Static: Inicio";
    updateTimeDisplay();
  };

  btnFinal.onclick = () => {
    model.showFinal();
    currentPhaseUI = 3;
    animTimeUI = BASE_DURATION;
    isAnimatingUI = false;
    btnPause.textContent = "Pause";
    btnPhase.textContent = "Done";
    btnPhase.disabled = true;
    phaseLabel.textContent = "Static: Completo";
    updateTimeDisplay();
  };

  const btnShakeLower = panel.querySelector("#btn-shake-lower");
  const btnShakeUpper = panel.querySelector("#btn-shake-upper");
  btnShakeLower.onclick = () => { model.triggerShakeLower(); };
  btnShakeUpper.onclick = () => { model.triggerShakeUpper(); };

  speedSlider.oninput = () => {
    const val = parseFloat(speedSlider.value);
    model.speed = val;
    speedLabel.textContent = val.toFixed(1) + "x";
  };

  hSlider.oninput = () => {
    const val = parseFloat(hSlider.value);
    model.horizontal = val;
    hLabel.textContent = val.toFixed(1);
  };

  bendSlider.oninput = () => {
    const val = parseFloat(bendSlider.value);
    model.bending = val;
    bendLabel.textContent = val.toFixed(2);
  };

  stretchSlider.oninput = () => {
    const val = parseFloat(stretchSlider.value);
    model.stretch = val;
    stretchLabel.textContent = val.toFixed(2);
  };

  vstretchSlider.oninput = () => {
    const val = parseFloat(vstretchSlider.value);
    model.verticalStretch = val;
    vstretchLabel.textContent = val.toFixed(2);
  };

  magma2Slider.oninput = () => {
    const val = parseFloat(magma2Slider.value);
    model.magma2Flatten = val;
    magma2Label.textContent = val.toFixed(2);
  };

  magma2ozSlider.oninput = () => {
    const val = parseFloat(magma2ozSlider.value);
    model.magma2OffsetZ = val;
    magma2ozLabel.textContent = val.toFixed(2);
  };

  sphereVSlider.oninput = () => {
    const val = parseFloat(sphereVSlider.value);
    model.spherePosY = val;
    sphereVLabel.textContent = val.toFixed(2);
  };
  sphereLSlider.oninput = () => {
    const val = parseFloat(sphereLSlider.value);
    model.spherePosX = val;
    sphereLLabel.textContent = val.toFixed(2);
  };
  cylVSlider.oninput = () => {
    const val = parseFloat(cylVSlider.value);
    model.cylinderPosY = val;
    cylVLabel.textContent = val.toFixed(2);
  };
  cylLSlider.oninput = () => {
    const val = parseFloat(cylLSlider.value);
    model.cylinderPosX = val;
    cylLLabel.textContent = val.toFixed(2);
  };

  scrubSlider.oninput = () => {
    model.setProgress(parseFloat(scrubSlider.value));
    animTimeUI = parseFloat(scrubSlider.value) * BASE_DURATION;
    updateTimeDisplay();
  };
  scrubSlider.onchange = () => { model.stopScrubbing(); };

  // Expose UI state sync for the animation loop
  model.__ui = {
    phase: currentPhaseUI,
    isAnimating: isAnimatingUI,
    animTime: animTimeUI,
    setPhase(v) { currentPhaseUI = v; },
    setAnimating(v) { isAnimatingUI = v; },
    setAnimTime(v) { animTimeUI = v; },
    updateDisplay() {
      updateTimeDisplay();
      stretchLabel.textContent = model.stretch.toFixed(2);
      vstretchLabel.textContent = model.verticalStretch.toFixed(2);
      bendLabel.textContent = model.bending.toFixed(2);
      magma2Label.textContent = model.magma2Flatten.toFixed(2);
      magma2ozLabel.textContent = model.magma2OffsetZ.toFixed(2);
      sphereVLabel.textContent = model.spherePosY.toFixed(2);
      sphereLLabel.textContent = model.spherePosX.toFixed(2);
      cylVLabel.textContent = model.cylinderPosY.toFixed(2);
      cylLLabel.textContent = model.cylinderPosX.toFixed(2);
    },
    btnPhase,
    btnPause,
    phaseLabel,
    infoLabel,
  };

  model.onPhaseChange((phase) => {
    currentPhaseUI = phase;
    btnPhase.textContent = `Play Phase ${phase + 1}/3`;
    btnPhase.disabled = false;
    phaseLabel.textContent = `Phase ${phase} / 3 (paused)`;
  });

  model.onComplete(() => {
    currentPhaseUI = 3;
    btnPhase.textContent = "Done";
    btnPhase.disabled = true;
    phaseLabel.textContent = "Complete";
  });

  model.onLoad((m) => {
    infoLabel.textContent = "meshes: " + Array.from(m.meshes.keys()).join(", ");
  });
}
