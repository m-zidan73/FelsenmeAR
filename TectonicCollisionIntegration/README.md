# FelsenmeAR Model

Simulación 3D de deformación de placas tectónicas con Three.js.

## Arquitectura

El proyecto se divide en **tres archivos principales** desacoplados:

```
src/
  FelsenmeARModel.js   → Clase pura del modelo (sin escena, cámara, luces, UI)
  ui.js                → Panel de control HTML (demo)
  main.js              → Punto de entrada de la demo (crea escena, cámara, renderer, luces, controles)
  wavePath.js          → Curva de subducción (puntos de control)
public/
  FelsenmeAR.glb       → Modelo 3D exportado desde Blender
```

## Cómo integrar `FelsenmeARModel` en otro proyecto

```js
import { FelsenmeARModel } from "./FelsenmeARModel.js";

// 1. Tener una escena Three.js
const scene = new THREE.Scene();

// 2. Crear el modelo (se agrega solo a la escena)
const model = new FelsenmeARModel(scene, {
  // (opcional) materiales custom por nombre de mesh:
  materials: { CapaInferiorA: myMaterial },
});

// 3. Llamar model.update() cada frame
function animate() {
  requestAnimationFrame(animate);
  model.update();
  renderer.render(scene, camera);
}
```

### API del modelo

| Método | Descripción |
|--------|-------------|
| `playPhase1()` | Inicia animación fase 1 |
| `playPhase2()` | Inicia animación fase 2 |
| `playPhase3()` | Inicia animación fase 3 |
| `togglePlay()` | Pausa/reanuda animación |
| `reset()` | Restaura el modelo a su estado GLB original (sin deformación) |
| `showInitial()` | Fija el modelo en progreso=0 (esfera al 50%, capas sin deformar) |
| `showFinal()` | Fija el modelo en progreso=1 (deformación completa) |
| `setProgress(t)` | Scrub manual (t entre 0 y 1) |
| `stopScrubbing()` | Detiene el scrub manual |
| `update()` | Llama cada frame para avanzar la animación |

**Callbacks:**

| Método | Descripción |
|--------|-------------|
| `onPhaseChange(fn)` | Se llama al terminar una fase `fn(phaseNumber)` |
| `onComplete(fn)` | Se llama al terminar la fase 3 |
| `onLoad(fn)` | Se llama cuando el GLB termina de cargar. `fn(model)` |

**Setters:**

| Propiedad | Descripción |
|-----------|-------------|
| `model.speed = v` | Velocidad de animación (1 = normal) |
| `model.horizontal = v` | Desplazamiento horizontal (0-3, default 0.5) |
| `model.bending = v` | Curvatura vertical (0-2, default 0.2) |

**Getters:**

- `model.phase` — fase actual (0-3)
- `model.animTime` — tiempo transcurrido en segundos
- `model.progress` — progreso normalizado (0-1)
- `model.complete` — bool, si la animación terminó
- `model.horizontal`, `model.bending` — valores actuales

### Dependencias

- `three` (r152+)
- `GLTFLoader` (incluido en `three/addons/loaders/GLTFLoader.js`)

### Notas

- El modelo se carga automáticamente desde `"FelsenmeAR.glb"` en el constructor. Asegúrate de que el archivo esté servible en esa ruta.
- Al cargar, el modelo se coloca automáticamente en estado Inicial (`showInitial()`).
- El modelo no crea escena, cámara, renderer ni luces. Todo eso debe venir del host.
- `ui.js` es solo para la demo. No es necesario incluirlo en el proyecto final.
