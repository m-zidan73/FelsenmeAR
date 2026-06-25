export function createHudUi({ state, ui, THREE }) {
  function createXrFallbackHud() {
    state.scene.add(state.camera);

    const root = new THREE.Group();
    root.name = "XR Fallback HUD";
    root.visible = false;
    state.camera.add(root);

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
      })
    );
    panel.renderOrder = 1000;
    root.add(panel);

    state.xrHud = {
      root,
      canvas,
      context: canvas.getContext("2d"),
      texture,
      panel,
      lastText: "",
      lastAspect: 0
    };

    refreshXrHudTexture();
    updateXrHudLayout();
  }

  function setXrHudVisible(isVisible) {
    if (!state.xrHud) {
      return;
    }

    state.xrHud.root.visible = isVisible;
    refreshXrHudTexture();
    updateXrHudLayout();
  }

  function updateXrHudLayout() {
    if (!state.xrHud || !state.xrHud.root.visible) {
      return;
    }

    const distance = 1.25;
    const aspect = Math.max(0.55, state.camera.aspect || (window.innerWidth / window.innerHeight));
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(state.camera.fov) * 0.5) * distance;
    const visibleWidth = visibleHeight * aspect;
    const margin = Math.max(0.08, Math.min(0.16, visibleWidth * 0.045));
    const panelWidth = Math.min(1.12, visibleWidth - margin * 2);
    const panelHeight = panelWidth * 0.45;

    state.xrHud.panel.scale.set(panelWidth, panelHeight, 1);
    state.xrHud.panel.position.set(
      -visibleWidth * 0.5 + panelWidth * 0.5 + margin,
      visibleHeight * 0.5 - panelHeight * 0.5 - margin,
      -distance
    );

    state.xrHud.lastAspect = aspect;
  }

  function refreshXrHudTexture() {
    if (!state.xrHud) {
      return;
    }

    const text = [
      ui.statusText.textContent,
      ui.scanPrompt ? ui.scanPrompt.textContent : "",
      ui.xrDebugText.textContent
    ].join("|");

    if (text === state.xrHud.lastText) {
      return;
    }

    state.xrHud.lastText = text;
    const context = state.xrHud.context;
    const canvas = state.xrHud.canvas;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawRoundedRect(context, 18, 18, canvas.width - 36, 250, 32, "rgba(8, 10, 12, 0.72)", "rgba(246, 239, 230, 0.24)", 4);

    context.fillStyle = "#f6efe6";
    context.font = "800 46px Arial";
    context.textAlign = "center";
    context.textBaseline = "top";
    drawWrappedText(context, ui.scanPrompt && !ui.scanPrompt.hidden ? ui.scanPrompt.textContent : ui.statusText.textContent, canvas.width * 0.5, 62, 860, 56, 3);

    state.xrHud.texture.needsUpdate = true;
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || "").split(/\s+/);
    let line = "";
    let lineCount = 0;

    for (let index = 0; index < words.length; index += 1) {
      const testLine = line ? line + " " + words[index] : words[index];
      if (context.measureText(testLine).width > maxWidth && line) {
        context.fillText(line, x, y + lineCount * lineHeight);
        line = words[index];
        lineCount += 1;
        if (lineCount >= maxLines) {
          return;
        }
      } else {
        line = testLine;
      }
    }

    if (line && lineCount < maxLines) {
      context.fillText(line, x, y + lineCount * lineHeight);
    }
  }

  function drawRoundedRect(context, x, y, width, height, radius, fill, stroke, lineWidth) {
    const right = x + width;
    const bottom = y + height;
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(right - radius, y);
    context.quadraticCurveTo(right, y, right, y + radius);
    context.lineTo(right, bottom - radius);
    context.quadraticCurveTo(right, bottom, right - radius, bottom);
    context.lineTo(x + radius, bottom);
    context.quadraticCurveTo(x, bottom, x, bottom - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke && lineWidth > 0) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;
      context.stroke();
    }
  }

  function shouldUseXrFallbackHud() {
    return Boolean(state.xrSession) && (!state.domOverlayActive || isLikelyIpadDevice());
  }

  function isLikelyIpadDevice() {
    const userAgent = navigator.userAgent || "";
    return /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
  }

  function updateHud(message) {
    if (message) {
      ui.statusText.textContent = message;
    }

    let currentHeight = Math.max(0, state.placementCenter.y - state.planeHeight);
    if (state.floatingObject) {
      const floatingWorldPosition = new THREE.Vector3();
      state.floatingObject.getWorldPosition(floatingWorldPosition);
      currentHeight = Math.max(0, floatingWorldPosition.y - state.floatingObjectBaseWorldPosition.y);
    }
    ui.heightValue.textContent = currentHeight.toFixed(2);
    ui.separationValue.textContent = "0.00";
    refreshXrHudTexture();
  }

  function setXRDebug(message) {
    ui.xrDebugText.textContent = "XR: " + message;
  }

  return {
    createXrFallbackHud,
    refreshXrHudTexture,
    setXRDebug,
    setXrHudVisible,
    shouldUseXrFallbackHud,
    updateHud,
    updateXrHudLayout
  };
}
