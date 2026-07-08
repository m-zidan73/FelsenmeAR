const HUD_DISTANCE = 1.15;
const HUD_RENDER_ORDER = 1000;
const MENU_SIZE = 0.18;
const PROMPT_HEIGHT = 0.16;
const SLIDER_HEIGHT = 0.28;
const SLIDER_TRACK_HEIGHT = 0.018;
const DOT_RADIUS = 0.026;
const ACTIVE_DOT_RADIUS = 0.038;

export function createArHud({
  state,
  THREE,
  onMenuSelected,
  onSliderCommit,
  onSliderGestureStart,
  onSliderPreview
}) {
  const group = new THREE.Group();
  group.name = "XR Screen HUD";
  group.position.set(0, 0, -HUD_DISTANCE);
  group.visible = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitTargets = [];
  const sliderDots = [];

  let initialized = false;
  let menuVisible = false;
  let scanPromptVisible = false;
  let sliderVisible = false;
  let sliderValue = 4;
  let sliderDisplayStep = 4;
  let sliderPrompting = false;
  let activeSliderPointerId = null;
  let menuButton = null;
  let scanPrompt = null;
  let sliderGroup = null;
  let sliderPanel = null;
  let sliderTrack = null;
  let sliderFill = null;
  let activeDot = null;
  let sliderHitArea = null;
  let sliderTrackMin = -0.4;
  let sliderTrackMax = 0.4;
  let lastViewportKey = "";

  function initialize() {
    if (initialized) {
      return;
    }

    state.scene.add(state.camera);
    state.camera.add(group);

    menuButton = createTextPanel("Menu", MENU_SIZE, MENU_SIZE, {
      background: "rgba(8, 10, 12, 0.78)",
      border: "rgba(246, 239, 230, 0.72)",
      color: "#f6efe6",
      font: "700 44px Inter, sans-serif",
      radius: 44
    });
    menuButton.name = "XR HUD Menu Button";
    menuButton.userData.arHudAction = "menu";
    hitTargets.push(menuButton);
    group.add(menuButton);

    scanPrompt = createTextPanel("Please face the camera on top of a flat surface", 1, PROMPT_HEIGHT, {
      background: "rgba(8, 10, 12, 0.72)",
      border: "rgba(246, 239, 230, 0.24)",
      color: "#f6efe6",
      font: "700 34px Inter, sans-serif",
      radius: 48
    });
    scanPrompt.name = "XR HUD Scan Prompt";
    group.add(scanPrompt);

    sliderGroup = new THREE.Group();
    sliderGroup.name = "XR HUD Formation Slider";
    group.add(sliderGroup);

    sliderPanel = createPanelMesh(1, SLIDER_HEIGHT, createPanelTexture("", {
      background: "rgba(238, 241, 242, 0.9)",
      border: "rgba(246, 239, 230, 0.32)",
      color: "#111820",
      font: "600 24px Inter, sans-serif",
      radius: 34
    }));
    sliderPanel.name = "XR HUD Slider Panel";
    sliderGroup.add(sliderPanel);

    sliderTrack = createColorPlane(1, SLIDER_TRACK_HEIGHT, 0x293241, 0.38);
    sliderTrack.name = "XR HUD Slider Track";
    sliderTrack.position.y = -0.045;
    sliderGroup.add(sliderTrack);

    sliderFill = createColorPlane(1, SLIDER_TRACK_HEIGHT, 0xc82b13, 0.95);
    sliderFill.name = "XR HUD Slider Fill";
    sliderFill.position.y = sliderTrack.position.y;
    sliderGroup.add(sliderFill);

    for (let index = 0; index < 5; index += 1) {
      const dot = createDot(DOT_RADIUS, 0x5fa7bd, 0.92);
      dot.name = "XR HUD Slider Dot " + (index + 1);
      dot.userData.arHudAction = "slider";
      sliderDots.push(dot);
      hitTargets.push(dot);
      sliderGroup.add(dot);
    }

    activeDot = createDot(ACTIVE_DOT_RADIUS, 0xf6efe6, 1);
    activeDot.name = "XR HUD Slider Active Dot";
    activeDot.userData.arHudAction = "slider";
    hitTargets.push(activeDot);
    sliderGroup.add(activeDot);

    sliderHitArea = createColorPlane(1, SLIDER_HEIGHT, 0xffffff, 0.001);
    sliderHitArea.name = "XR HUD Slider Hit Area";
    sliderHitArea.userData.arHudAction = "slider";
    sliderHitArea.position.z = 0.006;
    hitTargets.push(sliderHitArea);
    sliderGroup.add(sliderHitArea);

    initialized = true;
    updateLayout(true);
    updateVisibility();
    updateSliderVisual();
  }

  function setMenuButtonVisible(isVisible) {
    menuVisible = Boolean(isVisible);
    updateVisibility();
  }

  function setScanPromptVisible(isVisible) {
    scanPromptVisible = Boolean(isVisible);
    updateVisibility();
  }

  function setFormationSliderVisible(isVisible) {
    sliderVisible = Boolean(isVisible);
    updateVisibility();
  }

  function setSliderPrompting(isPrompting) {
    sliderPrompting = Boolean(isPrompting);
    updateSliderVisual();
  }

  function setSliderValue(value, displayStep) {
    sliderValue = THREE.MathUtils.clamp(Number(value) || 0, 0, 4);
    sliderDisplayStep = THREE.MathUtils.clamp(Math.round(Number(displayStep) || 0), 0, 4);
    updateSliderVisual();
  }

  function handlePointerEvent(event) {
    if (!isInteractive()) {
      return false;
    }

    if (event.type === "pointermove" && activeSliderPointerId !== event.pointerId) {
      return false;
    }

    if ((event.type === "pointerup" || event.type === "pointercancel") && activeSliderPointerId !== event.pointerId) {
      return false;
    }

    const hit = hitTestPointer(event);
    if (activeSliderPointerId === event.pointerId) {
      if (hit && hit.action === "slider") {
        onSliderPreview(hit.value);
      }
      if (event.type === "pointerup" || event.type === "pointercancel") {
        activeSliderPointerId = null;
        onSliderCommit(hit && hit.action === "slider" ? hit.value : sliderValue);
      }
      consumeEvent(event);
      return true;
    }

    if (!hit) {
      return false;
    }

    if (hit.action === "menu") {
      if (event.type === "pointerdown" || event.type === "click") {
        onMenuSelected();
      }
      consumeEvent(event);
      return true;
    }

    if (hit.action === "slider") {
      if (event.type === "pointerdown") {
        activeSliderPointerId = event.pointerId;
        onSliderGestureStart();
        onSliderPreview(hit.value);
      } else if (event.type === "click") {
        onSliderGestureStart();
        onSliderCommit(hit.value);
      }
      consumeEvent(event);
      return true;
    }

    return false;
  }

  function handleSelect(event) {
    if (!isInteractive() || !event.frame || !event.inputSource || !event.inputSource.targetRaySpace) {
      return false;
    }

    const pose = event.frame.getPose(event.inputSource.targetRaySpace, state.xrReferenceSpace);
    if (!pose) {
      return false;
    }

    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    raycaster.ray.origin.setFromMatrixPosition(matrix);
    raycaster.ray.direction.set(0, 0, -1).transformDirection(matrix);
    const hit = hitTestRaycaster();
    if (!hit) {
      return false;
    }

    if (hit.action === "menu") {
      onMenuSelected();
      return true;
    }

    if (hit.action === "slider") {
      onSliderGestureStart();
      onSliderCommit(hit.value);
      return true;
    }

    return false;
  }

  function update() {
    if (!initialized) {
      return;
    }
    updateLayout(false);
    updateVisibility();
  }

  function updateVisibility() {
    if (!initialized) {
      return;
    }

    const shouldRenderHud = Boolean(state.xrSession);
    menuButton.visible = shouldRenderHud && menuVisible;
    scanPrompt.visible = shouldRenderHud && scanPromptVisible;
    sliderGroup.visible = shouldRenderHud && sliderVisible;
    group.visible = shouldRenderHud && (menuButton.visible || scanPrompt.visible || sliderGroup.visible);
  }

  function updateLayout(force) {
    if (!initialized || !state.camera) {
      return;
    }

    const viewportHeight = 2 * HUD_DISTANCE * Math.tan(THREE.MathUtils.degToRad(state.camera.fov) * 0.5);
    const viewportWidth = viewportHeight * state.camera.aspect;
    const viewportKey = viewportWidth.toFixed(3) + "x" + viewportHeight.toFixed(3);
    if (!force && viewportKey === lastViewportKey) {
      return;
    }
    lastViewportKey = viewportKey;

    const margin = Math.min(0.12, viewportHeight * 0.06);
    const bottomY = -viewportHeight * 0.5 + margin;
    const topY = viewportHeight * 0.5 - margin;

    menuButton.position.set(-viewportWidth * 0.5 + margin + MENU_SIZE * 0.5, topY - MENU_SIZE * 0.5, 0);

    const promptWidth = Math.min(viewportWidth * 0.84, 1.05);
    scanPrompt.scale.set(promptWidth, PROMPT_HEIGHT, 1);
    scanPrompt.position.set(0, bottomY + PROMPT_HEIGHT * 0.5, 0);

    const sliderWidth = Math.min(viewportWidth * 0.84, 1.18);
    sliderPanel.scale.set(sliderWidth, SLIDER_HEIGHT, 1);
    sliderHitArea.scale.set(sliderWidth, SLIDER_HEIGHT, 1);
    sliderGroup.position.set(0, bottomY + SLIDER_HEIGHT * 0.5, 0);

    sliderTrackMin = -sliderWidth * 0.38;
    sliderTrackMax = sliderWidth * 0.38;
    const trackWidth = sliderTrackMax - sliderTrackMin;
    sliderTrack.scale.set(trackWidth, SLIDER_TRACK_HEIGHT, 1);
    sliderTrack.position.x = 0;
    sliderFill.scale.y = SLIDER_TRACK_HEIGHT;

    sliderDots.forEach((dot, index) => {
      dot.position.set(stepToX(index), sliderTrack.position.y, 0.012);
    });
    updateSliderVisual();
  }

  function updateSliderVisual() {
    if (!initialized) {
      return;
    }

    const progress = THREE.MathUtils.clamp(sliderValue / 4, 0, 1);
    const fillWidth = Math.max((sliderTrackMax - sliderTrackMin) * progress, 0.001);
    sliderFill.scale.x = fillWidth;
    sliderFill.position.x = sliderTrackMin + fillWidth * 0.5;
    activeDot.position.set(stepToX(sliderDisplayStep), sliderTrack.position.y, 0.018);
    activeDot.scale.setScalar(sliderPrompting ? 1.08 : 1);
  }

  function hitTestPointer(event) {
    const rect = state.renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    state.camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, state.camera);
    return hitTestRaycaster();
  }

  function hitTestRaycaster() {
    state.camera.updateMatrixWorld(true);
    group.updateMatrixWorld(true);
    const intersections = raycaster.intersectObjects(hitTargets, false);
    const hit = intersections.find((intersection) => isVisible(intersection.object));
    if (!hit) {
      return null;
    }

    const action = hit.object.userData.arHudAction;
    return {
      action,
      value: action === "slider" ? sliderValueFromPoint(hit.point) : null
    };
  }

  function sliderValueFromPoint(point) {
    const localPoint = sliderGroup.worldToLocal(point.clone());
    const ratio = THREE.MathUtils.clamp(
      (localPoint.x - sliderTrackMin) / Math.max(sliderTrackMax - sliderTrackMin, 0.001),
      0,
      1
    );
    return ratio * 4;
  }

  function isInteractive() {
    return initialized && group.visible;
  }

  function isVisible(object) {
    let current = object;
    while (current) {
      if (!current.visible) {
        return false;
      }
      current = current.parent;
    }
    return true;
  }

  function stepToX(step) {
    return THREE.MathUtils.lerp(sliderTrackMin, sliderTrackMax, step / 4);
  }

  function createTextPanel(text, width, height, options) {
    return createPanelMesh(width, height, createPanelTexture(text, options));
  }

  function createPanelMesh(width, height, texture) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.scale.set(width, height, 1);
    mesh.renderOrder = HUD_RENDER_ORDER;
    return mesh;
  }

  function createColorPlane(width, height, color, opacity) {
    const material = new THREE.MeshBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.scale.set(width, height, 1);
    mesh.renderOrder = HUD_RENDER_ORDER + 1;
    return mesh;
  }

  function createDot(radius, color, opacity) {
    const material = new THREE.MeshBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), material);
    mesh.renderOrder = HUD_RENDER_ORDER + 2;
    return mesh;
  }

  function createPanelTexture(text, options) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const radius = options.radius || 32;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = options.background;
    roundedRect(context, 8, 8, canvas.width - 16, canvas.height - 16, radius);
    context.fill();

    context.strokeStyle = options.border;
    context.lineWidth = 8;
    roundedRect(context, 8, 8, canvas.width - 16, canvas.height - 16, radius);
    context.stroke();

    if (text) {
      context.fillStyle = options.color;
      context.font = options.font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.86);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width * 0.5, height * 0.5);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }

  function consumeEvent(event) {
    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
  }

  return {
    handlePointerEvent,
    handleSelect,
    initialize,
    setFormationSliderVisible,
    setMenuButtonVisible,
    setScanPromptVisible,
    setSliderPrompting,
    setSliderValue,
    update
  };
}
