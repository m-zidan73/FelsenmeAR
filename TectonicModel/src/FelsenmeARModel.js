import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createWaveCurve } from "./wavePath.js";

const BASE_DURATION = 8;
const PHASE_DURATION = BASE_DURATION / 3;


const SELECTED_STRETCH_VERTS = new Set([
  8, 9, 10, 11, 12, 13, 14, 15, 39, 40, 41, 42,
  87, 88, 89, 90,
  402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415,
  416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429,
  430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443,
  444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457,
  458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471,
  472, 473,
  569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582,
  583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596,
  597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610,
  611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624,
  625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638,
  639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652,
  653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666,
  667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680,
  681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694,
  695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708,
  709, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 722,
  723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736,
  737, 738, 739, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750,
  751, 752, 753, 754, 755, 756, 757, 758, 759, 760, 761, 762, 763, 764,
  765, 766, 767, 768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778,
  779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792,
  793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806,
  807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820,
  821, 822, 823, 824, 825, 826, 827, 828, 829, 830, 831, 832, 833, 834,
  835, 836, 837, 838, 839, 840, 841, 842, 843, 844, 845, 846, 847, 848,
  849, 850, 851, 852, 853, 854, 855, 856, 857, 858, 859, 860, 861, 862,
  863, 864, 865, 866, 867, 868, 869, 870, 871, 872, 873, 874, 875, 876,
  877, 878, 879, 880, 881, 882, 883, 884, 885, 886, 887, 888, 889, 890,
  891, 892, 893, 894, 895, 896, 897, 898, 899, 900, 901, 902, 903, 904,
  905, 906, 907, 908, 909, 910, 911, 912, 913, 914, 915, 916, 917, 918,
  919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 930, 931, 932,
  933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943,
]);

const REQUIRED_MESH_NAMES = [
  "CapaInferiorA",
  "CapaInferiorB",
  "CapaSuperiorA",
  "CapaSuperiorB",
  "Magma2",
  "Sphere",
  "Cylinder",
];

function makeOpaqueOrange(mat) {
  if (!mat) return;
  mat.color.setHex(0xff6600);
  mat.roughness = 0.8;
  mat.metalness = 0;
  mat.transparent = false;
  mat.opacity = 1;
  if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.2;
  if (mat.specularColor) mat.specularColor.setHex(0x444444);
  mat.envMapIntensity = 0.3;
}

function randomizeUV(mat) {
  for (const key of Object.keys(mat)) {
    const tex = mat[key];
    if (tex && tex.isTexture) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.offset.set(Math.random(), Math.random());
    }
  }
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
    this._bending = 0.5;
    this._stretch = 1.0;
    this._verticalStretch = 1;
    this._duration = BASE_DURATION;
    this._speed = 1;
    this._scrubbing = false;
    this._loaded = false;
    this._disposed = false;
    this._lastUpdateTime = null;
    this._modelGroup = null;
    this._shakeTime = 0;
    this._shakeAmplitude = 0;
    this._shakeDecay = 2.5;
    this._shakeFreq = 12;
    this._quickShakeMeshes = [];
    this._quickShakeTime = 0;
    this._quickShakeAmp = 0;
    this._quickShakeOffset = 0;
    this._quickShakeDecay = 4;
    this._quickShakeFreq = 15;
    this._glowMeshes = new Set();
    this._modelQuickShakeAmp = 0;
    this._modelQuickShakeTime = 0;
    this._modelQuickShakeDecay = 4;
    this._modelQuickShakeFreq = 15;
    this._quickAudio = new Audio("TectonicModel/dist/audio/tectonic-passage.mp3");
    this._quickAudio.volume = 1.0;
    this._grabLower = false;
    this._grabUpper = false;
    this._grabLowerApplied = 0;
    this._grabUpperApplied = 0;
    this._grabElevation = 0.05;
    this._grabLowerShakeTime = 0;
    this._grabLowerShakeAmp = 0;
    this._grabLowerShakeOffset = 0;
    this._grabUpperShakeTime = 0;
    this._grabUpperShakeAmp = 0;
    this._grabUpperShakeOffset = 0;

    this._onPhaseChange = null;
    this._onComplete = null;
    this._onLoadCallback = null;
    this._onErrorCallback = null;

    this._capaA = null;
    this._capaB = null;
    this._origA = null;
    this._origB = null;
    this._tA = null;
    this._zMinA = null;
    this._zMaxA = null;
    this._selectedVertsYMax = null;
    this._selectedVertsYMin = null;
    this._magmas = [];
    this._magma2Mesh = null;
    this._origMagma2 = null;
    this._magma2AnchorZ = null;
    this._magma2Flatten = 1.0;
    this._magma2OffsetZ = 0;
    this._sphereMesh = null;
    this._sphereOrigScale = null;
    this._sphereStartPos = null;
    this._sphereEndPos = null;
    this._cylinderMesh = null;
    this._cylinderOrigScale = null;
    this._cylinderOrigPos = null;
    this._cylinderYOffset = 0;
    this._cylinderBasePos = null;
    this._spherePosX = 1.26;
    this._spherePosY = 1.89;
    this._cylinderPosX = 1.19;
    this._cylinderPosY = 1.63;
    this._sphereAnimStart = new THREE.Vector3(1.11, 1.67, 0);
    this._cylinderAnimStart = new THREE.Vector3(1.01, 1.46, 0);
    this._lastAnimSpherePos = new THREE.Vector3(NaN, NaN, NaN);
    this._lastAnimCylPos = new THREE.Vector3(NaN, NaN, NaN);

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
  get stretch() { return this._stretch; }
  get verticalStretch() { return this._verticalStretch; }
  get magma2Flatten() { return this._magma2Flatten; }
  get magma2OffsetZ() { return this._magma2OffsetZ; }
  get speed() { return this._speed; }

  set horizontal(v) {
    this._horizontal = v;
    this._shakeAmplitude = 0;
    this._applyDeformation(this._animTime);
  }

  set bending(v) {
    this._bending = v;
    this._shakeAmplitude = 0;
    this._applyDeformation(this._animTime);
  }

  set stretch(v) {
    this._stretch = v;
    this._shakeAmplitude = 0;
    this._applyDeformation(this._animTime);
  }

  set verticalStretch(v) {
    this._verticalStretch = v;
    this._shakeAmplitude = 0;
    this._applyDeformation(this._animTime);
  }

  set magma2Flatten(v) {
    this._magma2Flatten = v;
    this._shakeAmplitude = 0;
    this._applyDeformation(this._animTime);
  }

  set magma2OffsetZ(v) {
    this._magma2OffsetZ = v;
    this._shakeAmplitude = 0;
    this._applyDeformation(this._animTime);
  }

  set speed(v) {
    const nextSpeed = Number(v);
    this._speed = Number.isFinite(nextSpeed) && nextSpeed > 0 ? nextSpeed : 1;
  }

  get spherePosX() { return this._spherePosX; }
  set spherePosX(v) { this._spherePosX = v; this._applyDeformation(this._animTime); }

  get spherePosY() { return this._spherePosY; }
  set spherePosY(v) { this._spherePosY = v; this._applyDeformation(this._animTime); }

  get cylinderPosX() { return this._cylinderPosX; }
  set cylinderPosX(v) { this._cylinderPosX = v; this._applyDeformation(this._animTime); }

  get cylinderPosY() { return this._cylinderPosY; }
  set cylinderPosY(v) { this._cylinderPosY = v; this._applyDeformation(this._animTime); }

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
    this._stretch = 0.70;
    this._verticalStretch = 0.05;
    this._bending = 0.5;
    this._magma2Flatten = 1.0;
    this._magma2OffsetZ = 0;
    this._lastAnimSpherePos.set(NaN, NaN, NaN);
    this._lastAnimCylPos.set(NaN, NaN, NaN);
    this._shakeAmplitude = 0;
    this._applyDeformation(0);
    if (this._sphereMesh && this._sphereAnimStart) {
      this._sphereMesh.position.x = this._sphereAnimStart.x;
      this._sphereMesh.position.y = this._sphereAnimStart.y;
    }
    if (this._cylinderMesh && this._cylinderAnimStart) {
      this._cylinderMesh.position.x = this._cylinderAnimStart.x;
      this._cylinderMesh.position.y = this._cylinderAnimStart.y;
    }
  }

  setProgress(t) {
    const progress = THREE.MathUtils.clamp(Number(t) || 0, 0, 1);
    this._scrubbing = true;
    this._isAnimating = false;
    this._animTime = progress * BASE_DURATION;
    this._currentPhase = progress >= 1 ? 3 : Math.floor(progress * 3);
    if (progress <= 1 / 3) {
      this._stretch = 0.70 + (0.90 - 0.70) * (progress / (1 / 3));
    } else if (progress <= 2 / 3) {
      this._stretch = 0.90 + (1.0 - 0.90) * ((progress - 1 / 3) / (1 / 3));
    } else {
      this._stretch = 1.0 + (1.05 - 1.0) * ((progress - 2 / 3) / (1 / 3));
    }
    this._verticalStretch = 0.05 + (1.10 - 0.05) * progress;
    this._bending = 0.50 + (0.10 - 0.50) * progress;
    this._magma2Flatten = 1.0 + (0.84 - 1.0) * progress;
    this._magma2OffsetZ = 0 + (-0.11 - 0) * progress;
    this._shakeAmplitude = 0;
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
    this._stretch = 0.70;
    this._verticalStretch = 0.05;
    this._bending = 0.5;
    this._magma2Flatten = 1.0;
    this._magma2OffsetZ = 0;
    this._lastAnimSpherePos.set(NaN, NaN, NaN);
    this._lastAnimCylPos.set(NaN, NaN, NaN);
    this._shakeAmplitude = 0;
    this._applyDeformation(0);
    if (this._sphereMesh && this._sphereAnimStart) {
      this._sphereMesh.position.x = this._sphereAnimStart.x;
      this._sphereMesh.position.y = this._sphereAnimStart.y;
    }
    if (this._cylinderMesh && this._cylinderAnimStart) {
      this._cylinderMesh.position.x = this._cylinderAnimStart.x;
      this._cylinderMesh.position.y = this._cylinderAnimStart.y;
    }
    this.triggerShakeLower();
    setTimeout(() => this.triggerShakeUpper(), 250);
  }

  showFinal() {
    this._isAnimating = false;
    this._animTime = BASE_DURATION;
    this._currentPhase = 3;
    this._scrubbing = false;
    this._stretch = 1.05;
    this._verticalStretch = 1.10;
    this._bending = 0.10;
    this._magma2Flatten = 0.84;
    this._magma2OffsetZ = -0.11;
    this._lastAnimSpherePos.set(NaN, NaN, NaN);
    this._lastAnimCylPos.set(NaN, NaN, NaN);
    this._shakeAmplitude = 0;
    this._applyDeformation(BASE_DURATION);
    const allMeshes = Array.from(this.meshes.values()).filter(Boolean);
    this._applyGlow(allMeshes);
    this._modelQuickShakeTime = 0;
    this._modelQuickShakeAmp = 0.059;
  }

  _clearAllGlow() {
    for (const child of this._glowMeshes) {
      if (!child || !child.material) continue;
      const mat = child.material;
      if (child.__origEmissive && mat.emissive) mat.emissive.copy(child.__origEmissive);
      if (child.__origEmissiveIntensity !== undefined) mat.emissiveIntensity = child.__origEmissiveIntensity;
      delete child.__origEmissive;
      delete child.__origEmissiveIntensity;
    }
    this._glowMeshes.clear();
  }

  _applyGlow(meshes) {
    this._clearAllGlow();
    for (const child of meshes) {
      if (!child || !child.material) continue;
      if (!child.__glowOwnMat) {
        child.material = child.material.clone();
        child.__glowOwnMat = true;
      }
      const mat = child.material;
      child.__origEmissive = mat.emissive ? mat.emissive.clone() : null;
      child.__origEmissiveIntensity = mat.emissiveIntensity;
      if (mat.emissive) mat.emissive.set(0xffaa44);
      mat.emissiveIntensity = 0.15;
      this._glowMeshes.add(child);
    }
  }

  _addGlow(meshes) {
    for (const child of meshes) {
      if (!child || !child.material) continue;
      if (!child.__glowOwnMat) {
        child.material = child.material.clone();
        child.__glowOwnMat = true;
      }
      const mat = child.material;
      if (!child.__origEmissive) {
        child.__origEmissive = mat.emissive ? mat.emissive.clone() : null;
        child.__origEmissiveIntensity = mat.emissiveIntensity;
      }
      if (mat.emissive) mat.emissive.set(0xffaa44);
      mat.emissiveIntensity = 0.15;
      this._glowMeshes.add(child);
    }
  }

  _clearGlow(meshes) {
    for (const child of meshes) {
      if (!child || !child.material || !this._glowMeshes.has(child)) continue;
      const mat = child.material;
      if (child.__origEmissive && mat.emissive) mat.emissive.copy(child.__origEmissive);
      if (child.__origEmissiveIntensity !== undefined) mat.emissiveIntensity = child.__origEmissiveIntensity;
      delete child.__origEmissive;
      delete child.__origEmissiveIntensity;
      this._glowMeshes.delete(child);
    }
  }

  triggerShakeLower() {
    const meshes = [this._capaA, this._capaB].filter(Boolean);
    this._applyGlow(meshes);
    this._quickShakeMeshes = meshes;
    this._quickShakeTime = 0;
    this._quickShakeAmp = 0.02;
    this._quickShakeOffset = 0;
    this._quickShakeDecay = 3;
    this._quickShakeFreq = 5;
    this._quickAudio.currentTime = 21.5;
    this._quickAudio.volume = 0;
    this._quickAudio.play().catch(() => {});
    setTimeout(() => { this._quickAudio.volume = 0.08; }, 50);
    setTimeout(() => { this._quickAudio.volume = 0.18; }, 120);
    setTimeout(() => { this._quickAudio.volume = 1.0; }, 250);
    setTimeout(() => {
      const fadeId = setInterval(() => {
        if (this._quickAudio.volume > 0.02) this._quickAudio.volume -= 0.05;
      }, 100);
      setTimeout(() => {
        clearInterval(fadeId);
        this._quickAudio.pause();
        this._quickAudio.currentTime = 0;
        this._quickAudio.volume = 1.0;
      }, 1500);
    }, 1500);
  }

  triggerShakeUpper() {
    const meshes = [];
    const supA = this.meshes.get("CapaSuperiorA");
    const supB = this.meshes.get("CapaSuperiorB");
    if (supA) meshes.push(supA);
    if (supB) meshes.push(supB);
    if (this._sphereMesh) meshes.push(this._sphereMesh);
    if (this._cylinderMesh) meshes.push(this._cylinderMesh);
    this._applyGlow([supA, supB, this._sphereMesh, this._cylinderMesh].filter(Boolean));
    this._quickShakeMeshes = meshes;
    this._quickShakeTime = 0;
    this._quickShakeAmp = 0.02;
    this._quickShakeOffset = 0;
    this._quickShakeDecay = 3;
    this._quickShakeFreq = 5;
    this._quickAudio.currentTime = 21.5;
    this._quickAudio.volume = 0;
    this._quickAudio.play().catch(() => {});
    setTimeout(() => { this._quickAudio.volume = 0.08; }, 50);
    setTimeout(() => { this._quickAudio.volume = 0.18; }, 120);
    setTimeout(() => { this._quickAudio.volume = 1.0; }, 250);
    setTimeout(() => {
      const fadeId = setInterval(() => {
        if (this._quickAudio.volume > 0.02) this._quickAudio.volume -= 0.05;
      }, 100);
      setTimeout(() => {
        clearInterval(fadeId);
        this._quickAudio.pause();
        this._quickAudio.currentTime = 0;
        this._quickAudio.volume = 1.0;
      }, 1500);
    }, 1500);
  }

  _triggerModelShake() {
    this._modelQuickShakeTime = 0;
    this._modelQuickShakeAmp = 0.059;
    this._quickAudio.pause();
    this._quickAudio.currentTime = 21.5;
    this._quickAudio.volume = 0;
    this._quickAudio.play().catch(() => {});
    setTimeout(() => { this._quickAudio.volume = 0.08; }, 100);
    setTimeout(() => { this._quickAudio.volume = 0.18; }, 250);
    setTimeout(() => { this._quickAudio.volume = 1.0; }, 500);
    setTimeout(() => {
      const fadeId = setInterval(() => {
        if (this._quickAudio.volume > 0.02) this._quickAudio.volume -= 0.025;
      }, 100);
      setTimeout(() => {
        clearInterval(fadeId);
        this._quickAudio.pause();
        this._quickAudio.currentTime = 0;
        this._quickAudio.volume = 1.0;
      }, 2000);
    }, 4000);
  }

  grabLower(active) {
    this._grabLower = active;
    if (active) {
      this._grabLowerShakeTime = 0;
      this._grabLowerShakeAmp = 0.015;
      this._grabLowerShakeOffset = 0;
      this._addGlow([this._capaA, this._capaB].filter(Boolean));
      this._quickAudio.currentTime = 21.5;
      this._quickAudio.volume = 0;
      this._quickAudio.play().catch(() => {});
      setTimeout(() => { this._quickAudio.volume = 0.3; }, 30);
      setTimeout(() => { this._quickAudio.volume = 0.6; }, 80);
      setTimeout(() => { this._quickAudio.volume = 1.0; }, 150);
      setTimeout(() => {
        const fadeId = setInterval(() => {
          if (this._quickAudio.volume > 0.02) this._quickAudio.volume -= 0.1;
        }, 50);
        setTimeout(() => {
          clearInterval(fadeId);
          this._quickAudio.pause();
          this._quickAudio.currentTime = 0;
          this._quickAudio.volume = 1.0;
        }, 500);
      }, 350);
    }
    if (!active) {
      this._clearGlow([this._capaA, this._capaB].filter(Boolean));
      this._grabLowerShakeAmp = 0;
    }
  }

  grabUpper(active) {
    this._grabUpper = active;
    const meshes = [
      this.meshes.get("CapaSuperiorA"), this.meshes.get("CapaSuperiorB")
    ].filter(Boolean);
    if (active) {
      this._grabUpperShakeTime = 0;
      this._grabUpperShakeAmp = 0.015;
      this._grabUpperShakeOffset = 0;
      this._addGlow(meshes);
      this._quickAudio.currentTime = 21.5;
      this._quickAudio.volume = 0;
      this._quickAudio.play().catch(() => {});
      setTimeout(() => { this._quickAudio.volume = 0.3; }, 30);
      setTimeout(() => { this._quickAudio.volume = 0.6; }, 80);
      setTimeout(() => { this._quickAudio.volume = 1.0; }, 150);
      setTimeout(() => {
        const fadeId = setInterval(() => {
          if (this._quickAudio.volume > 0.02) this._quickAudio.volume -= 0.1;
        }, 50);
        setTimeout(() => {
          clearInterval(fadeId);
          this._quickAudio.pause();
          this._quickAudio.currentTime = 0;
          this._quickAudio.volume = 1.0;
        }, 500);
      }, 350);
    }
    if (!active) {
      this._clearGlow(meshes);
      this._grabUpperShakeAmp = 0;
    }
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
          this._triggerShake(0.045, 8, 40);
          if (this._onComplete) this._onComplete();
        } else {
          this._triggerShake(0.045 + this._currentPhase * 0.01, 8, 40);
          if (this._onPhaseChange) this._onPhaseChange(this._currentPhase);
        }
      }
      const p = this.progress;
      if (p <= 1 / 3) {
        this._stretch = 0.70 + (0.90 - 0.70) * (p / (1 / 3));
      } else if (p <= 2 / 3) {
        this._stretch = 0.90 + (1.0 - 0.90) * ((p - 1 / 3) / (1 / 3));
      } else {
        this._stretch = 1.0 + (1.05 - 1.0) * ((p - 2 / 3) / (1 / 3));
      }
      this._verticalStretch = 0.05 + (1.10 - 0.05) * p;
      this._bending = 0.50 + (0.10 - 0.50) * p;
      this._magma2Flatten = 1.0 + (0.84 - 1.0) * p;
      this._magma2OffsetZ = 0 + (-0.11 - 0) * p;
    }
    if (this._loaded && !this._disposed) {
      if (this._shakeAmplitude > 0) this._shakeTime += 0.016;
      if (this._shakeAmplitude > 0 && this._shakeAmplitude < 0.001) this._shakeAmplitude = 0;
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
          this._modelGroup = importedRoot;
          importedRoot.traverse((child) => {
            if (!child.isMesh) return;
            this.meshes.set(child.name, child);
            if (child.name === "CapaInferiorA") {
              this._capaA = child;
              const data = precomputeMesh(child);
              this._origA = data.orig;
              this._tA = data.t;
              this._zMinA = data.zMin;
              this._zMaxA = data.zMax;
              {
                const origArr = this._origA;
                let maxY = -Infinity, minY = Infinity;
                for (let vi = 0; vi < origArr.length / 3; vi++) {
                  if (SELECTED_STRETCH_VERTS.has(vi)) {
                    const y = origArr[vi * 3 + 1];
                    if (y > maxY) maxY = y;
                    if (y < minY) minY = y;
                  }
                }
                this._selectedVertsYMax = maxY;
                this._selectedVertsYMin = minY;
              }
              if (mats[child.name]) child.material = mats[child.name];
            } else if (child.name === "CapaInferiorB") {
              this._capaB = child;
              const data = precomputeMesh(child);
              this._origB = data.orig;
              if (mats[child.name]) child.material = mats[child.name];
            } else if (child.name === "CapaSuperiorA" || child.name === "CapaSuperior.copia" || child.name === "Cube.001") {
              if (mats[child.name]) child.material = mats[child.name];
              if (child.name === "CapaSuperiorA" && !this._sphereStartPos) {
                child.geometry.computeBoundingBox();
                const bb = child.geometry.boundingBox;
                this._sphereStartPos = new THREE.Vector3();
                this._sphereStartPos.y = child.position.y + (bb ? bb.min.y : 0);
              }
            } else if (child.name === "CapaSuperiorB") {
              if (mats[child.name]) child.material = mats[child.name];
              child.geometry.computeBoundingBox();
              const bb = child.geometry.boundingBox;
              if (bb && this._magma2AnchorZ === null) {
                this._magma2AnchorZ = bb.min.z;
              }
            } else if (child.name === "Magma2") {
              this._magma2Mesh = child;
              const arr = child.geometry.attributes.position.array;
              this._origMagma2 = new Float32Array(arr);
              if (!mats[child.name]) child.material = child.material.clone();
              makeOpaqueOrange(mats[child.name] || child.material);
              randomizeUV(mats[child.name] || child.material);
            } else if (child.name === "Sphere") {
              this._sphereMesh = child;
              this._sphereOrigScale = child.scale.clone();
              this._sphereEndPos = child.position.clone();
              this._spherePosX = 1.26;
    this._spherePosY = 1.89;
              if (!mats[child.name]) child.material = child.material.clone();
              makeOpaqueOrange(mats[child.name] || child.material);
            } else if (child.name === "Cylinder") {
              this._cylinderMesh = child;
              this._cylinderOrigScale = child.scale.clone();
              this._cylinderOrigPos = child.geometry.attributes.position.array.slice();
              const posArr = child.geometry.attributes.position.array;
              const loopVerts = [];
              for (let i = 0, vi = 0; i < posArr.length; i += 3, vi++) {
                if (Math.abs(posArr[i + 1] - 0.2559) < 0.001) loopVerts.push(vi);
              }
              this._cylinderLoopVerts = loopVerts;
              if (this._sphereEndPos) {
                this._cylinderYOffset = this._sphereEndPos.y - child.position.y;
              }
              child.position.x -= 0.15;
              this._cylinderBasePos = child.position.clone();
              this._cylinderPosX = 1.19;
              this._cylinderPosY = 1.63;
              if (!mats[child.name]) child.material = child.material.clone();
              makeOpaqueOrange(mats[child.name] || child.material);
              randomizeUV(mats[child.name] || child.material);
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
    this._clearAllGlow();
    this._triggerShake(0.045 + phaseIndex * 0.01, 2.5, 12);
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

  _triggerShake(amplitude, decay, freq) {
    this._shakeAmplitude = amplitude;
    this._shakeTime = 0;
    this._shakeDecay = decay;
    this._shakeFreq = freq;
  }

  _applyDeformation(time) {
    const progress = Math.min(time / this._duration, 1);
    const phase2t = Math.max(0, Math.min((progress - 1 / 3) * 3, 1));
    const phase3t = Math.max(0, Math.min((progress - 2 / 3) * 3, 1));

    const dz = (this._curveEnd.z - this._curveStart.z) * progress * this._horizontal;
    this._subductionCurve.getPointAt(progress, this._tempP);
    const dyBend = (this._tempP.y - this._curveStart.y) * this._bending;
    const globalX = -this._horizontal * 0.5 * progress;
    const shake = this._shakeAmplitude * Math.exp(-this._shakeDecay * this._shakeTime) * Math.sin(this._shakeFreq * this._shakeTime);
    const tremor = this._isAnimating ? 0.01 * (Math.sin(17 * time) * 0.5 + Math.sin(31 * time) * 0.5) : 0;
    if (this._modelGroup) {
      this._modelGroup.position.x = globalX + shake + tremor;
      this._modelGroup.position.y = tremor * 0.5;
    }
    if (this._modelQuickShakeAmp > 0) {
      const qs = this._modelQuickShakeAmp * Math.exp(-this._modelQuickShakeDecay * this._modelQuickShakeTime) * Math.cos(this._modelQuickShakeFreq * this._modelQuickShakeTime);
      this._modelGroup.position.x += qs;
      this._modelGroup.position.y += qs * 0.5;
      this._modelQuickShakeTime += 0.016;
      const envelope = this._modelQuickShakeAmp * Math.exp(-this._modelQuickShakeDecay * this._modelQuickShakeTime);
      if (Math.abs(envelope) < 0.0005) {
        this._modelQuickShakeAmp = 0;
        this._clearAllGlow();
      }
    }

      if (this._sphereMesh && this._sphereOrigScale) {
        const phase2delayed = Math.max(0, (phase2t - 0.9) / 0.1);
        const s = 0.5 + (phase2delayed + phase3t) / 6;
      this._sphereMesh.scale.set(
        this._sphereOrigScale.x * s,
        this._sphereOrigScale.y * s,
        this._sphereOrigScale.z * s,
      );

      if (this._sphereEndPos && this._sphereAnimStart) {
        if (this._isAnimating && progress > 2 / 3) {
          const t = Math.min((progress - 2 / 3) * 3, 1);
          this._sphereMesh.position.x = this._sphereAnimStart.x + (this._spherePosX - this._sphereAnimStart.x) * t;
          this._sphereMesh.position.y = this._sphereAnimStart.y + (this._spherePosY - this._sphereAnimStart.y) * t;
          this._lastAnimSpherePos.copy(this._sphereMesh.position);
        } else if (this._isAnimating) {
          this._sphereMesh.position.x = this._sphereAnimStart.x;
          this._sphereMesh.position.y = this._sphereAnimStart.y;
          this._lastAnimSpherePos.copy(this._sphereMesh.position);
        } else if (Number.isFinite(this._lastAnimSpherePos.x) && this._currentPhase > 0 && this._currentPhase < 3) {
          this._sphereMesh.position.copy(this._lastAnimSpherePos);
        } else {
          this._sphereMesh.position.x = this._spherePosX;
          this._sphereMesh.position.y = this._spherePosY;
        }
        this._sphereMesh.position.z = this._sphereEndPos.z;
      }

      if (this._cylinderMesh && this._cylinderBasePos && this._cylinderAnimStart) {
        if (this._isAnimating && progress > 2 / 3) {
          const t = Math.min((progress - 2 / 3) * 3, 1);
          this._cylinderMesh.position.x = this._cylinderAnimStart.x + (this._cylinderPosX - this._cylinderAnimStart.x) * t;
          this._cylinderMesh.position.y = this._cylinderAnimStart.y + (this._cylinderPosY - this._cylinderAnimStart.y) * t;
          this._lastAnimCylPos.copy(this._cylinderMesh.position);
        } else if (this._isAnimating) {
          this._cylinderMesh.position.x = this._cylinderAnimStart.x;
          this._cylinderMesh.position.y = this._cylinderAnimStart.y;
          this._lastAnimCylPos.copy(this._cylinderMesh.position);
        } else if (Number.isFinite(this._lastAnimCylPos.x) && this._currentPhase > 0 && this._currentPhase < 3) {
          this._cylinderMesh.position.copy(this._lastAnimCylPos);
        } else {
          this._cylinderMesh.position.x = this._cylinderPosX;
          this._cylinderMesh.position.y = this._cylinderPosY;
        }
        this._cylinderMesh.position.z = this._cylinderBasePos.z;
        this._cylinderMesh.rotation.set(THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(90), 0, 'ZYX');
        const loopS = Math.min(phase2t * 0.75 + phase3t * 0.10, 0.85);
        const loopSX = Math.min(phase2t * 0.75 + phase3t * 0.25, 1);
        this._cylinderMesh.scale.x = this._cylinderOrigScale.x * (0.95 + 0.05 * phase2t);
        this._cylinderMesh.scale.z = this._cylinderOrigScale.z * (0.8 * phase2t);
        if (this._cylinderOrigPos) {
          const pos = this._cylinderMesh.geometry.attributes.position.array;
          pos.set(this._cylinderOrigPos);
          for (const vi of this._cylinderLoopVerts) {
            const i = vi * 3;
            pos[i] *= loopS;
            pos[i + 2] *= loopSX;
          }
          this._cylinderMesh.geometry.attributes.position.needsUpdate = true;
          this._cylinderMesh.geometry.computeVertexNormals();
        }
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

    if (this._magma2Mesh && this._origMagma2 && this._magma2AnchorZ !== null) {
      const arrM2 = this._magma2Mesh.geometry.attributes.position.array;
      arrM2.set(this._origMagma2);
      const anchorZ = this._magma2AnchorZ;
      const f = this._magma2Flatten;
      const offsetZ = this._magma2OffsetZ;
      for (let i = 0; i < arrM2.length; i += 3) {
        arrM2[i + 2] = anchorZ + (arrM2[i + 2] - anchorZ) * f + offsetZ;
      }
      this._magma2Mesh.geometry.attributes.position.needsUpdate = true;
      this._magma2Mesh.geometry.computeVertexNormals();
    }

    if (this._capaA && this._origA && this._tA) {
      const arrA = this._capaA.geometry.attributes.position.array;
      arrA.set(this._origA);
      const zMax = this._zMaxA;
      const s = this._stretch;
      const vs = this._verticalStretch;
      const topY = this._selectedVertsYMax;
      for (let i = 0, vi = 0; i < arrA.length; i += 3, vi++) {
        arrA[i + 2] = zMax + (arrA[i + 2] - zMax) * s;
        arrA[i + 2] += dz;
        if (vs > 0 && SELECTED_STRETCH_VERTS.has(vi)) {
          arrA[i + 1] = topY + (arrA[i + 1] - topY) * vs;
        }
        arrA[i + 1] += dyBend * this._tA[vi];
      }
      this._capaA.geometry.attributes.position.needsUpdate = true;
      this._capaA.geometry.computeVertexNormals();
    }
    if (this._quickShakeAmp > 0) {
      const qs = this._quickShakeAmp * Math.exp(-this._quickShakeDecay * this._quickShakeTime) * Math.cos(this._quickShakeFreq * this._quickShakeTime);
      const delta = qs - this._quickShakeOffset;
      this._quickShakeOffset = qs;
      for (const child of this._quickShakeMeshes) {
        if (!child) continue;
        child.position.x += delta;
        child.position.y += delta * 0.5;
      }
      this._quickShakeTime += 0.016;
      if (Math.abs(qs) < 0.0005) {
        const finalDelta = -this._quickShakeOffset;
        for (const child of this._quickShakeMeshes) {
          if (!child) continue;
          child.position.x += finalDelta;
          child.position.y += finalDelta * 0.5;
        }
        this._quickShakeAmp = 0;
        this._clearAllGlow();
        this._quickShakeMeshes = [];
        this._quickShakeOffset = 0;
      }
    }
    const lowerMeshes = [this._capaA, this._capaB].filter(Boolean);
    const targetLowerY = this._grabLower ? this._grabElevation : 0;
    const grabLowerDY = targetLowerY - this._grabLowerApplied;
    const grabLowerShake = this._grabLowerShakeAmp > 0;
    if (grabLowerShake) {
      const qs = this._grabLowerShakeAmp * Math.exp(-4 * this._grabLowerShakeTime) * Math.cos(12 * this._grabLowerShakeTime);
      const delta = qs - this._grabLowerShakeOffset;
      this._grabLowerShakeOffset = qs;
      for (const child of lowerMeshes) {
        child.position.x += delta;
        child.position.y += delta * 0.5;
      }
      this._grabLowerShakeTime += 0.016;
      if (Math.abs(qs) < 0.0005) {
        const finalDelta = -this._grabLowerShakeOffset;
        for (const child of lowerMeshes) {
          child.position.x += finalDelta;
          child.position.y += finalDelta * 0.5;
        }
        this._grabLowerShakeAmp = 0;
        this._grabLowerShakeOffset = 0;
        for (const child of lowerMeshes) {
          if (child && child.material && this._glowMeshes.has(child)) {
            child.material.emissiveIntensity = 0.04;
          }
        }
      }
    }
    if (Math.abs(grabLowerDY) > 0.0001) {
      for (const child of lowerMeshes) child.position.y += grabLowerDY;
      this._grabLowerApplied = targetLowerY;
    }
    const upperMeshes = [
      this.meshes.get("CapaSuperiorA"), this.meshes.get("CapaSuperiorB")
    ].filter(Boolean);
    const targetUpperY = this._grabUpper ? this._grabElevation : 0;
    const grabUpperDY = targetUpperY - this._grabUpperApplied;
    const grabUpperShake = this._grabUpperShakeAmp > 0;
    if (grabUpperShake) {
      const qs = this._grabUpperShakeAmp * Math.exp(-4 * this._grabUpperShakeTime) * Math.cos(12 * this._grabUpperShakeTime);
      const delta = qs - this._grabUpperShakeOffset;
      this._grabUpperShakeOffset = qs;
      for (const child of upperMeshes) {
        child.position.x += delta;
        child.position.y += delta * 0.5;
      }
      this._grabUpperShakeTime += 0.016;
      if (Math.abs(qs) < 0.0005) {
        const finalDelta = -this._grabUpperShakeOffset;
        for (const child of upperMeshes) {
          child.position.x += finalDelta;
          child.position.y += finalDelta * 0.5;
        }
        this._grabUpperShakeAmp = 0;
        this._grabUpperShakeOffset = 0;
        for (const child of upperMeshes) {
          if (child && child.material && this._glowMeshes.has(child)) {
            child.material.emissiveIntensity = 0.04;
          }
        }
      }
    }
    if (Math.abs(grabUpperDY) > 0.0001) {
      for (const child of upperMeshes) child.position.y += grabUpperDY;
      this._grabUpperApplied = targetUpperY;
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
    if (this._cylinderMesh && this._cylinderOrigPos) {
      this._cylinderMesh.geometry.attributes.position.array.set(this._cylinderOrigPos);
      this._cylinderMesh.geometry.attributes.position.needsUpdate = true;
      this._cylinderMesh.geometry.computeVertexNormals();
    }
  }
}
