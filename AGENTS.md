# AGENTS.md — Contexto del proyecto FelsenmeAR

## Rama activa
`audio-ui-integration` (basada en `origin/Refactor-Decoupled`)

## Proyecto
WebXR (no AR.js). Hit-testing + anchors. Reticle verde + tap to place. Slider de 5 etapas geológicas. Pinch para subducción en Stage 1.

## Archivos del proyecto (base `Refactor-Decoupled`)
```
index.html
src/
  app.js              ← composición original (NO modificar)
  app_Revised.js      ← copia con instrumentación (este es el que se carga)
  ar-controller.js    ← WebXR session, hit-test, anchors
  config.js           ← CONSTANTES
  debug-hooks.js
  dom.js              ← referencias DOM
  event-bus.js        ← NUEVO: bus estático de eventos
  state-manager.js    ← NUEVO: ExperienceState + state machine
  audio-manager.js    ← NUEVO: reproduce audios según estado/evento
  ui-prompt-controller.js ← NUEVO: textos instruccionales (tutorial bar)
  data-overlay-controller.js ← NUEVO: datos geológicos en pantalla
  interaction-controller.js ← pinch + tap detection
  location-controller.js    ← GPS + sun
  scene.js            ← Three.js scene, renderer, reticle
  state.js            ← estado mutable compartido
  three-utils.js
  runtime-errors.js
  formation/
    model-factory.js
    model-loader.js
    placement-controller.js
    stage-controller.js   ← 5-stage animation state machine
  ui/
    formation-slider.js
    hud.js
    menu.js
styles.css
config/
  stage-data.json     ← datos geológicos por etapa (nombre, época, roca)
  audio-map.json      ← mapeo estado/evento → clip de audio
  prompt-texts.json   ← textos instruccionales (referencia)
static-server.mjs
```

## Lo que ya está implementado

### Infraestructura base
- `src/event-bus.js` — `EventBus.on(event, cb)`, `EventBus.raise(event, data)`, `EventBus.off()`
- `src/state-manager.js` — `ExperienceStateManager.setState(newState)`, `onStateChanged(cb)`
  - Enum `ExperienceState`: Loading, Ready, Scanning, PlaneDetected, FormationPlaced, Stage5..Stage1, PinchActive, SessionEnded

### Controladores nuevos
- **UIPromptController** — escucha cambios de estado y muestra texto en `#tutorialText` dentro de `#tutorialBar`
- **AudioManager** — carga `config/audio-map.json`, escucha estados y eventos, reproduce Audio con interrupt/no-interrupt
- **DataOverlayController** — carga `config/stage-data.json`, muestra nombre/era/época/roca/placa en `#dataOverlay`

### Puntos de emisión en `app_Revised.js`
| Evento | Dónde se emite | Cómo |
|--------|----------------|------|
| `stage_changed` | Wrapper de `requestStage` | slider commit exitoso |
| `formation_placed` | Wrapper de `placeFormation` | AR tap + anchor creado |
| `pinch_progress` | `onPinchChange` wrapper | pinch activo/inactivo |
| `session_started` | Render loop | `hadSession` flanco positivo |
| `session_ended` | Render loop | `hadSession` flanco negativo |
| `plane_detected` | Render loop | reticle visibility flanco positivo |
| `subduction_progress` | Render loop | progreso de animación 0..1 (hitos en 0.3, 0.5, 0.8, 1.0) |

### UI nueva en `index.html`
- `#tutorialBar` > `#tutorialText` — barra superior con texto guía (se muestra/oculta por estado)
- `#sliderTimeLabel` — dentro del slider, muestra la época geológica en vivo
- `#rockInfoBadge` > `#rockBadgeMaterial`, `#rockBadgeEra` — burbuja con tipo de roca + era
- `#dataOverlay` — panel con nombre, era, época, tipo de roca, placa, descripción

### Eventos del bus (además de cambios de estado)
- `experience_state` — `{ newState }` (lo mismo que onStateChanged)
- `stage_changed` — `{ stage, previousStage, stageIndex }`
- `subduction_progress` — `{ progress }`  (valores: 0, 0.3, 0.5, 0.8, 1.0)
- `pinch_progress` — `{ active }`
- `formation_placed` — `{}`
- `session_started` / `session_ended` — `{}`
- `plane_detected` — `{}`

### Mapeo slider → stage (en STAGE_DATA dentro de app_Revised.js)
```
Slider 0 → Stage 1 (Continental Collision, ~340mya)
Slider 1 → Stage 2 (Solid Quartz Diorite, ~290mya)
Slider 2 → Stage 3 (Cracked Slab, ~245mya)
Slider 3 → Stage 4 (Rounded Boulders, ~180mya)
Slider 4 → Stage 5 (Final Boulder, Present Day)
```

## Lo que falta / pendiente

### Funcionalidad no implementada (para futuro)
- **Plate touch detection** — requiere raycasting sobre el modelo 3D (no existe aún)
- **Pinch gesture tuning** — el pinch existe pero solo como flag on/off, no como progreso continuo real desde el hardware
- **Subduction progress real** — actualmente es un timer de 3s estimado, no lee el animation clip real
- **Audio clips con espacios** — los nombres tipo `"7. stage 2.mp3"` pueden fallar en URL; sanitizar

### Problemas conocidos
- WebXR solo funciona en dispositivos móviles con HTTPS. Usar `cloudflared tunnel --url http://localhost:5173` para pruebas desde celular.
- El modo `?debug` + `window.__arFormationDebug.placeAtOrigin()` permite test sin WebXR en PC
- `ui-concept-demo.html` existe en raíz como demo visual descartable (no forma parte de la app real)

### Para nueva sesión
1. Leer este AGENTS.md
2. Revisar `src/app_Revised.js` (entry point real)
3. `node static-server.mjs` para servidor local
4. Los archivos originales (`app.js`, `ar-controller.js`, etc.) NO deben modificarse directamente
5. Para probar desde celular: `cloudflared tunnel --url http://localhost:5173`

### ⚠️ Regla crítica: Sincronización con Refactor-Decoupled
Cada vez que aparezca un **nuevo commit en `origin/Refactor-Decoupled`**, debes **pedir autorización antes de actuar**. NO hacer merge ni rebase automáticamente. El flujo correcto es:

1. **Preguntar al usuario** si se debe integrar el nuevo commit
2. Si autoriza, **revisar `app.js`** comparándolo con la versión anterior para detectar cambios en:
   - Llamadas a `createPlacementController` (requiere `THREE`)
   - Callbacks de `createCanvasInteractionController` (requiere `onPinchDebug`)
   - Firmas de `requestStage` y `onStepSelected`
   - Cualquier nueva dependencia o parámetro
3. **Actualizar `app_Revised.js`** reflejando esos cambios manteniendo la instrumentación (EventBus, state machine, audio, UI controllers)
4. **NUNCA modificar `app.js` ni archivos originales de `Refactor-Decoupled`** directamente

### Historial de fixes en app_Revised.js
- **`THREE` faltante en `createPlacementController`** — causaba crash en `orientFormationToCameraHeading()` al hacer `new THREE.Vector3()`, rompiendo todo el anchoring system. Fix: añadir `THREE,` como parámetro.
- **`onPinchDebug` faltante** — no rompía la app (default `() => {}`), pero perdía debug info del pinch. Fix: añadir `reportPinchDebug` + pasarlo como callback.

### Comandos útiles
```powershell
node static-server.mjs
# Abrir http://localhost:5173/

$env:TEMP\cloudflared.exe tunnel --url http://localhost:5173
# Da URL HTTPS para probar en celular
```
