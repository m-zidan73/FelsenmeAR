import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createWaveCurve } from "./wavePath.js";

const BASE_DURATION = 8;
const PHASE_DURATION = BASE_DURATION / 3;
const REQUIRED_MESH_NAMES = [
  "CapaInferiorA",
  "CapaInferiorB",
  "CapaSuperiorA",
  "CapaSuperiorB",
  "Magma1",
  "Magma2",
  "Sphere",
  "Cylinder",
];

function makeCanvas(stripes, c1, c2) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const phase = Math.sin(t * stripes * Math.PI * 2) * 0.5 + 0.5;
    const r = c1.r + (c2.r - c1.r) * phase;
    const g = c1.g + (c2.g - c1.g) * phase;
    const b = c1.b + (c2.b - c1.b) * phase;
    ctx.fillStyle = `rgb(${(r*255)|0},${(g*255)|0},${(b*255)|0})`;
    ctx.fillRect(0, y, size, 1);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 32; i++) {
    const p = (i / 32) * size;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  return c;
}

function toTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = 4;
  return tex;
}

const _texA = toTex(makeCanvas(14, new THREE.Color(0xdd9944), new THREE.Color(0xffcc88)));
const _texB = toTex(makeCanvas(10, new THREE.Color(0x2a3a5a), new THREE.Color(0x5a7a9a)));

function defaultMatA() {
  return new THREE.MeshStandardMaterial({
    map: _texA, color: 0xffffff, flatShading: true, roughness: 0.8, metalness: 0.1,
  });
}

function defaultMatB() {
  return new THREE.MeshStandardMaterial({
    map: _texB, color: 0xffffff, flatShading: true, roughness: 0.8, metalness: 0.1,
  });
}

function defaultMatMagma(emissive) {
  return new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive, emissiveIntensity: 0.6, flatShading: true,
  });
}

function defaultMatSphere() {
  return new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.6, flatShading: true,
  });
}

function precomputeMesh(mesh) {
  const arr = mesh.geometry.attributes.position.array;
  const orig = new Float32Array(arr);
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 2; i < arr.length; i += 3) {
    const z = arr[i];
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const zRange = zMax - zMin || 1;
  const t = new Float32Array(arr.length / 3);
  for (let i = 2, vi = 0; i < arr.length; i += 3, vi++) {
    t[vi] = (zMax - arr[i]) / zRange;
  }
  return { orig, t, zMin, zMax };
}

function resolveMaterial(meshName, override, fallback) {
  if (override instanceof THREE.Material) return override;
  if (typeof fallback === "function") return fallback();
  return fallback;
}

export class FelsenmeARModel {
  constructor(parent, options = {}) {
    if (!parent || typeof parent.add !== "function") {
      throw new Error("FelsenmeARModel requires a Three.js parent object");
    }

    this.parent = parent;
    this.options = options;
    this.modelUrl = options.modelUrl || "FelsenmeAR.glb";
    const mats = options.materials || {};

    this._animTime = 0;
    this._currentPhase = 0;
    this._isAnimating = false;
    this._horizontal = 0.5;
    this._bending = 0.2;
    this._duration = BASE_DURATION;
    this._speed = 1;
    this._scrubbing = false;
    this._loaded = false;
    this._disposed = false;
    this._lastUpdateTime = null;

    this._onPhaseChange = null;
    this._onComplete = null;
    this._onLoadCallback = null;
    this._onErrorCallback = null;

    this._capaA = null;
    this._capaB = null;
    this._origA = null;
    this._origB = null;
    this._tA = null;
    this._magmas = [];
    this._sphereMesh = null;
    this._sphereOrigScale = null;
    this._sphereStartPos = null;
    this._sphereEndPos = null;
    this._cylinderMesh = null;
    this._cylinderOrigScale = null;
    this._cylinderYOffset = 0;

    this.root = new THREE.Group();
    this.root.name = "FelsenmeAR Tectonic Root";
    this.meshes = new Map();

    this._subductionCurve = createWaveCurve();
    this._curveStart = this._subductionCurve.getPointAt(0);
    this._curveEnd = this._subductionCurve.getPointAt(1);
    this._tempP = new THREE.Vector3();

    this.parent.add(this.root);
    this._loadModel(mats);
  }

  // ── Getters / Setters ──

  get phase() { return this._currentPhase; }
  get animTime() { return this._animTime; }
  get progress() {
    return this._duration > 0 ? Math.min(this._animTime / this._duration, 1) : 0;
  }
  get complete() { return this._currentPhase >= 3; }
  get isAnimating() { return this._isAnimating; }
  get loaded() { return this._loaded; }
  get horizontal() { return this._horizontal; }
  get bending() { return this._bending; }
  get speed() { return this._speed; }

  set horizontal(v) {
    this._horizontal = v;
    this._applyDeformation(this._animTime);
  }

  set bending(v) {
    this._bending = v;
    this._applyDeformation(this._animTime);
  }

  set speed(v) {
    const nextSpeed = Number(v);
    this._speed = Number.isFinite(nextSpeed) && nextSpeed > 0 ? nextSpeed : 1;
  }

  // ── Callbacks ──

  onPhaseChange(fn) { this._onPhaseChange = fn; }
  onComplete(fn) { this._onComplete = fn; }
  onLoad(fn) { this._onLoadCallback = fn; }
  onError(fn) { this._onErrorCallback = fn; }

  // ── Control ──

  playPhase1() {
    return this._startPhase(0);
  }

  playPhase2() {
    return this._startPhase(1);
  }

  playPhase3() {
    return this._startPhase(2);
  }

  togglePlay() {
    if (!this._loaded || this.complete) return false;
    this._isAnimating = !this._isAnimating;
    this._lastUpdateTime = null;
    return this._isAnimating;
  }

  reset() {
    this._animTime = 0;
    this._currentPhase = 0;
    this._isAnimating = false;
    this._scrubbing = false;
    this._lastUpdateTime = null;
    this._resetMeshes();
  }

  setProgress(t) {
    const progress = THREE.MathUtils.clamp(Number(t) || 0, 0, 1);
    this._scrubbing = true;
    this._isAnimating = false;
    this._animTime = progress * BASE_DURATION;
    this._currentPhase = progress >= 1 ? 3 : Math.floor(progress * 3);
    this._applyDeformation(this._animTime);
  }

  stopScrubbing() {
    this._scrubbing = false;
  }

  showInitial() {
    this._isAnimating = false;
    this._animTime = 0;
    this._currentPhase = 0;
    this._scrubbing = false;
    this._applyDeformation(0);
  }

  showFinal() {
    this._isAnimating = false;
    this._animTime = BASE_DURATION;
    this._currentPhase = 3;
    this._scrubbing = false;
    this._applyDeformation(BASE_DURATION);
  }

  // ── Main update (call each frame from host loop) ──

  update(deltaSeconds) {
    if (this._isAnimating && !this._scrubbing && this._loaded && !this._disposed) {
      let delta = 0;
      if (Number.isFinite(deltaSeconds)) {
        delta = Math.max(0, deltaSeconds);
        this._lastUpdateTime = null;
      } else {
        const now = performance.now();
        delta = this._lastUpdateTime === null ? 0 : Math.max(0, (now - this._lastUpdateTime) / 1000);
        this._lastUpdateTime = now;
      }
      this._animTime += delta * this._speed;
      const phaseEnd = (this._currentPhase + 1) * PHASE_DURATION;
      if (this._animTime >= phaseEnd) {
        this._animTime = phaseEnd;
        this._isAnimating = false;
        this._lastUpdateTime = null;
        this._currentPhase++;
        if (this._currentPhase >= 3) {
          if (this._onComplete) this._onComplete();
        } else {
          if (this._onPhaseChange) this._onPhaseChange(this._currentPhase);
        }
      }
      this._applyDeformation(this._animTime);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._isAnimating = false;
    this._lastUpdateTime = null;
    this.root.removeFromParent();
    this.root.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    });
    this.meshes.clear();
  }

  // Internal
  _loadModel(mats) {
    new GLTFLoader().load(
      this.modelUrl,
      (gltf) => {
        const importedRoot = gltf.scene;
        try {
          if (this._disposed) {
            this._disposeImportedRoot(importedRoot);
            return;
          }

          this.root.add(importedRoot);
          importedRoot.traverse((child) => {
            if (!child.isMesh) return;
            this.meshes.set(child.name, child);
            if (child.name === "CapaInferiorA") {
              this._capaA = child;
              const data = precomputeMesh(child);
              this._origA = data.orig;
              this._tA = data.t;
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatA);
            } else if (child.name === "CapaInferiorB") {
              this._capaB = child;
              const data = precomputeMesh(child);
              this._origB = data.orig;
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatB);
            } else if (child.name === "CapaSuperiorA" || child.name === "CapaSuperior.copia" || child.name === "Cube.001") {
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatA);
              if (child.name === "CapaSuperiorA" && !this._sphereStartPos) {
                child.geometry.computeBoundingBox();
                const bb = child.geometry.boundingBox;
                this._sphereStartPos = new THREE.Vector3();
                this._sphereStartPos.y = child.position.y + (bb ? bb.min.y : 0);
              }
            } else if (child.name === "CapaSuperiorB") {
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatB);
            } else if (child.name === "Magma1" || child.name === "Cube") {
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatMagma(0xff4400));
              this._magmas.push({ mesh: child, origZ: child.position.z });
            } else if (child.name === "Magma2") {
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatMagma(0xff2200));
            } else if (child.name === "Sphere") {
              this._sphereMesh = child;
              this._sphereOrigScale = child.scale.clone();
              this._sphereEndPos = child.position.clone();
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatSphere());
            } else if (child.name === "Cylinder") {
              this._cylinderMesh = child;
              this._cylinderOrigScale = child.scale.clone();
              if (this._sphereEndPos) {
                this._cylinderYOffset = this._sphereEndPos.y - child.position.y;
              }
              child.material = resolveMaterial(child.name, mats[child.name], defaultMatSphere());
            }
          });

          const missingMeshes = REQUIRED_MESH_NAMES.filter((name) => !this.meshes.has(name));
          if (missingMeshes.length) {
            throw new Error("FelsenmeAR model is missing meshes: " + missingMeshes.join(", "));
          }

          this._loaded = true;
          this.showInitial();
          const callback = this.options.onLoad || this._onLoadCallback;
          if (callback) callback(this);
        } catch (error) {
          importedRoot.removeFromParent();
          this._disposeImportedRoot(importedRoot);
          this._handleLoadError(error);
        }
      },
      undefined,
      (error) => this._handleLoadError(error)
    );
  }

  _startPhase(phaseIndex) {
    if (
      !this._loaded
      || this._disposed
      || this._isAnimating
      || this._currentPhase !== phaseIndex
      || phaseIndex < 0
      || phaseIndex >= 3
    ) {
      return false;
    }

    this._scrubbing = false;
    this._animTime = phaseIndex * PHASE_DURATION;
    this._lastUpdateTime = null;
    this._isAnimating = true;
    return true;
  }

  _handleLoadError(error) {
    if (this._disposed) return;
    this._loaded = false;
    this._isAnimating = false;
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const callback = this.options.onError || this._onErrorCallback;
    if (callback) callback(normalizedError);
    else console.error("FelsenmeAR model load failed:", normalizedError);
  }

  _disposeImportedRoot(root) {
    root.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    });
  }
  _applyDeformation(time) {
    const progress = Math.min(time / this._duration, 1);

    const dz = (this._curveEnd.z - this._curveStart.z) * progress * this._horizontal;
    this._subductionCurve.getPointAt(progress, this._tempP);
    const dyBend = (this._tempP.y - this._curveStart.y) * this._bending;

    if (this._sphereMesh && this._sphereOrigScale) {
      const s = 0.5 + 0.5 * progress;
      this._sphereMesh.scale.set(
        this._sphereOrigScale.x * s,
        this._sphereOrigScale.y * s,
        this._sphereOrigScale.z * s,
      );

      if (this._sphereStartPos && this._sphereEndPos) {
        this._sphereMesh.position.x = this._sphereEndPos.x;
        this._sphereMesh.position.z = this._sphereEndPos.z;
        this._sphereMesh.position.y = this._sphereStartPos.y + (this._sphereEndPos.y - this._sphereStartPos.y) * progress;
      }

      if (this._cylinderMesh && this._cylinderOrigScale) {
        const phase1t = Math.min(progress * 3, 1);
        const phase2t = Math.max(0, Math.min((progress - 1 / 3) * 3, 1));
        const csY = 0.95 + 0.05 * phase1t;
        const csXZ = 0.85 + 0.05 * phase1t + 0.1 * phase2t;
        this._cylinderMesh.scale.set(
          this._cylinderOrigScale.x * csXZ,
          this._cylinderOrigScale.y * csY,
          this._cylinderOrigScale.z * csXZ,
        );
        const lowerOffset = 0.35 * (1 - phase1t);
        this._cylinderMesh.position.y =
          this._sphereMesh.position.y - this._cylinderYOffset + 0.2 - lowerOffset;
      }
    }

    if (this._capaB && this._origB) {
      const arrB = this._capaB.geometry.attributes.position.array;
      arrB.set(this._origB);
      for (let i = 0; i < arrB.length; i += 3) {
        arrB[i + 2] += dz;
      }
      this._capaB.geometry.attributes.position.needsUpdate = true;
      this._capaB.geometry.computeVertexNormals();
    }

    for (const m of this._magmas) {
      m.mesh.position.z = m.origZ + dz;
    }

    if (this._capaA && this._origA && this._tA) {
      const arrA = this._capaA.geometry.attributes.position.array;
      arrA.set(this._origA);
      for (let i = 0, vi = 0; i < arrA.length; i += 3, vi++) {
        arrA[i + 2] += dz;
        arrA[i + 1] += dyBend * this._tA[vi];
      }
      this._capaA.geometry.attributes.position.needsUpdate = true;
      this._capaA.geometry.computeVertexNormals();
    }
  }

  _resetMeshes() {
    if (this._capaA && this._origA) {
      this._capaA.geometry.attributes.position.array.set(this._origA);
      this._capaA.geometry.attributes.position.needsUpdate = true;
      this._capaA.geometry.computeVertexNormals();
    }
    if (this._capaB && this._origB) {
      this._capaB.geometry.attributes.position.array.set(this._origB);
      this._capaB.geometry.attributes.position.needsUpdate = true;
      this._capaB.geometry.computeVertexNormals();
    }
    for (const m of this._magmas) {
      m.mesh.position.z = m.origZ;
    }
    if (this._sphereMesh && this._sphereStartPos && this._sphereEndPos) {
      this._sphereMesh.position.set(this._sphereEndPos.x, this._sphereStartPos.y, this._sphereEndPos.z);
    }
    if (this._sphereMesh && this._sphereOrigScale) {
      this._sphereMesh.scale.copy(this._sphereOrigScale);
    }
  }
}
