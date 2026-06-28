export function createSceneController({ state, ui, THREE, disposeObject }) {
  function initializeScene() {
    state.scene = new THREE.Scene();
    state.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(window.devicePixelRatio);
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.xr.enabled = true;
    state.renderer.xr.setReferenceSpaceType("local");
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    ui.canvasRoot.appendChild(state.renderer.domElement);

    addLights();
    addDesktopFallbackFloor();
    createPlacementReticle();
  }

  function addLights() {
    state.scene.add(new THREE.HemisphereLight(0xf8fbff, 0x293241, 1.15));
    state.sunLight = new THREE.DirectionalLight(0xffffff, 2.1);
    state.sunLight.position.set(-1.4, 4, 2.4);
    state.sunLight.castShadow = true;
    state.sunLight.shadow.mapSize.set(1024, 1024);
    state.sunLight.shadow.camera.near = 0.01;
    state.sunLight.shadow.camera.far = 12;
    state.sunLight.shadow.camera.left = -4;
    state.sunLight.shadow.camera.right = 4;
    state.sunLight.shadow.camera.top = 4;
    state.sunLight.shadow.camera.bottom = -4;
    state.scene.add(state.sunLight);
    state.scene.add(state.sunLight.target);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  function addDesktopFallbackFloor() {
    const floor = new THREE.GridHelper(8, 16, 0x7bdff2, 0x7bdff2);
    floor.name = "Desktop Fallback Floor";
    floor.material.transparent = true;
    floor.material.opacity = 0.18;
    state.scene.add(floor);
  }

  function createPlacementReticle() {
    state.placementReticle = new THREE.Group();
    state.placementReticle.name = "Placement Reticle";

    const grid = new THREE.GridHelper(0.8, 8, 0x24f2a9, 0x24f2a9);
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    grid.material.depthWrite = false;
    state.placementReticle.add(grid);

    state.placementReticle.visible = false;
    state.scene.add(state.placementReticle);
  }

  function setPlacementReticleModel(source) {
    const model = source.clone(true);
    model.name = "PolyCam Rock Sample";
    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const transparentMaterials = materials.map((material) => {
        const transparentMaterial = material.clone();
        transparentMaterial.transparent = true;
        transparentMaterial.opacity = 0.7;
        transparentMaterial.depthWrite = false;
        return transparentMaterial;
      });
      child.material = Array.isArray(child.material) ? transparentMaterials : transparentMaterials[0];
    });

    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.scale.setScalar(0.5 / Math.max(size.x, size.z, 0.001));
    bounds.setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y + 0.01, -center.z);
    state.placementReticle.add(model);
  }

  function onResize() {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function createShadowReceiver(center, orientation) {
    if (state.shadowReceiver) {
      state.scene.remove(state.shadowReceiver);
      disposeObject(state.shadowReceiver);
    }

    state.shadowReceiver = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI * 0.5),
      new THREE.ShadowMaterial({
        color: 0x000000,
        opacity: 0.38,
        transparent: true,
        depthWrite: false
      })
    );
    state.shadowReceiver.name = "Detected Plane Shadow Receiver";
    state.shadowReceiver.receiveShadow = true;
    state.shadowReceiver.position.copy(center);
    state.shadowReceiver.position.y += 0.004;
    if (orientation) {
      state.shadowReceiver.quaternion.copy(orientation);
    }
    state.scene.add(state.shadowReceiver);
  }

  return {
    createShadowReceiver,
    initializeScene,
    onResize,
    setPlacementReticleModel
  };
}
