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
| `triggerShakeLower()` | Temblor en capas inferiores (CapaInferiorA + CapaInferiorB) con audio |
| `triggerShakeUpper()` | Temblor en capas superiores (CapaSuperiorA + CapaSuperiorB + Sphere + Cylinder) con audio |
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

---

## Eventos EventBus (integración con `tectonic-collision-controller.js`)

Cuando el modelo se usa a través de [`tectonic-collision-controller.js`](src/tectonic-collision-controller.js), expone los siguientes eventos en el `EventBus`:

### Escuchar (enviados desde el controlador)

| Evento | Payload | Cuándo se emite |
|--------|---------|-----------------|
| `tectonic_model_ready` | `{}` | El modelo GLB se cargó y está listo |
| `tectonic_model_error` | `{ message }` | Error al cargar el modelo |
| `tectonic_phase_started` | `{ phase }` (1, 2, 3) | Comenzó una fase de subducción |
| `tectonic_phase_completed` | `{ phase }` (1, 2, 3) | Una fase terminó |
| `tectonic_animation_complete` | `{}` | La animación completa (fase 3) terminó |
| `tectonic_initial_shown` | `{}` | Se mostró el estado inicial (`showInitial()`) |
| `tectonic_final_shown` | `{}` | Se mostró el estado final (`showFinal()`) |
| `tectonic_shake_lower_triggered` | `{}` | Se activó temblor inferior |
| `tectonic_shake_upper_triggered` | `{}` | Se activó temblor superior |
| `subduction_progress` | `{ progress }` (0, 0.3, 0.5, 0.8, 1.0) | Hito de progreso de la animación |

### Enviar (para activar acciones en el modelo)

| Evento | Cómo enviarlo | Acción |
|--------|---------------|--------|
| `tectonic_show_initial` | `EventBus.raise("tectonic_show_initial", {})` | Muestra el estado inicial del modelo (progreso=0) |
| `tectonic_show_final` | `EventBus.raise("tectonic_show_final", {})` | Muestra el estado final del modelo (progreso=1) |
| `tectonic_shake_lower` | `EventBus.raise("tectonic_shake_lower", {})` | Activa temblor en capas inferiores con audio |
| `tectonic_shake_upper` | `EventBus.raise("tectonic_shake_upper", {})` | Activa temblor en capas superiores con audio |

### Ejemplo de uso

```js
import { EventBus } from "./event-bus.js";

// Escuchar cuando el modelo está listo
EventBus.on("tectonic_model_ready", () => {
  console.log("Modelo listo");
});

// Mostrar estado final
EventBus.raise("tectonic_show_final", {});

// Activar temblor inferior
EventBus.raise("tectonic_shake_lower", {});
```

> **Nota:** El controlador solo permite estas acciones si el modelo está cargado y listo (`tectonic_model_ready` emitido).
