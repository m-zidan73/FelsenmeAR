# CONTRATO — FelsenmeAR Tectonic Plates

## Objetivo
Simular subducción de placas tectónicas (Avalonia + Amorica) en WebXR con Three.js, usando 3 capas geológicas low-poly.

---

## Stack técnico
- **Modelado:** Blender 4.5/5.1
- **Runtime:** Three.js (WebXR)
- **Comunicación MCP:** `blender-mcp` (ahujasid/blender-mcp) vía `uvx`
- **Animación:** Vertex displacement en CPU (Three.js), no shape keys
- **Exportación:** glTF (Binary `.glb`), geometría estática sin animaciones

---

## Decisión arquitectural

| Elemento | Decisión | Por qué |
|----------|----------|---------|
| Animación | **Vertex displacement en Three.js** | Mesh editable en Blender post-export, sin re-exportar |
| El mesh exportado | Solo geometría base, sin deformaciones | Tamaño mínimo (~5 KB para WebXR) |
| Texturas | Procedurales (canvas/shaders) o imágenes ligeras | WebXR no debe pesar |
| Curva | Puntos hardcodeados en JS | No depende de archivos externos |

---

## Objetos en escena (Blender)

| Nombre | Tipo | Vértices | Caras | Rol |
|--------|------|:--------:|:-----:|-----|
| `CapaSuperior` | MESH | 22 | 19 | Corteza continental (rocas/montañas) |
| `CapaInferior` | MESH | 32 | 34 | Litosfera rígida (se subduce) |
| `Magma` | MESH | 8 | 6 | Astenosfera (magma emisivo) |
| `WavePath` | CURVE | 8 pts | — | Límite de contacto/subducción |

---

## Fase 1 — Blender (modelado base para exportar)

| Paso | Estado | Descripción |
|------|:------:|-------------|
| **P1.1** | ✅ Hecho | Nombres verificados: `CapaSuperior`, `CapaInferior`, `Magma` |
| **P1.2** | ✅ Hecho | Subdivisiones verificadas: 11 filas Y en zona activa. Suficiente para low-poly. |
| **P1.3** | ✅ Hecho | Materiales base asignados: CapaSuperior=verde `Mat_CapaSuperior`, CapaInferior=gris `Mat_CapaInferior`, Magma=naranja `Mat_Magma`. |
| **P1.4** | ✅ Hecho | Puntos de `WavePath` ya capturados (ver abajo) |
| **P1.5** | ✅ Hecho | Exportado como `FelsenmeAR.glb` (~8.2 KB). Nodes: CapaSuperior, CapaInferior, Magma. Sin animaciones. |

### Puntos de WavePath (para hardcodear en Three.js)

```js
const wavePathPoints = [
  [ 0.000, -2.921,  2.843 ],
  [ 0.000, -2.192,  2.819 ],
  [ 0.000, -1.454,  2.786 ],
  [ 0.000, -0.725,  2.701 ],
  [ 0.000, -0.005,  2.627 ],
  [ 0.000,  0.694,  2.382 ],
  [-0.004,  1.201,  1.852 ],
  [-0.175,  1.550,  1.250 ],
];
```

---

## Fase 2 — Three.js (implementada ✅)

| Paso | Estado | Descripción |
|------|:------:|-------------|
| **P2.1** | ✅ | Proyecto Vite + Three.js + GLTFLoader |
| **P2.2** | ✅ | `CatmullRomCurve3` con 8 puntos hardcodeados |
| **P2.3** | ✅ | Vertex displacement CPU: desplazamiento Z sinusoidal progresivo sobre CapaInferior |
| **P2.4** | ⚠️ Parcial | Colores base asignados. Falta: texturas procedurales |
| **P2.5** | ✅ | VRButton integrado, renderer.xr.enabled |

---

## Fase 3 — Iteración estética

- Tú editas `CapaSuperior`, `CapaInferior`, `Magma` en Blender (topología, vértices de montañas, forma) **sin restricciones**
- Re-exportas el glTF
- Three.js lo carga con la nueva geometría, la deformación se aplica automáticamente
- No se toca el código de animación

---

## Pendientes inmediatos para la próxima sesión

1. [x] Fase 1 completa (modelado + exportación)
2. [x] Fase 2: proyecto Three.js creado y funcionando
3. [ ] Ajustar estética: texturas, colores, animación
4. [ ] Probar en WebXR

---

## Fase 2 — Three.js (implementada)

| Paso | Estado | Descripción |
|------|:------:|-------------|
| **P2.1** | ✅ | Proyecto Vite + Three.js creado |
| **P2.2** | ✅ | `CatmullRomCurve3` reconstruida desde 8 puntos |
| **P2.3** | ✅ | Vertex displacement sobre CapaInferior: desplazamiento Z sinusoidal con progreso temporal |
| **P2.4** | ⚠️ Parcial | Materiales base asignados (colores planos). Texturas procedurales pendientes |
| **P2.5** | ✅ | WebXR (VRButton) integrado |

### Archivos del proyecto

```
FelsenmeAR/
├── index.html          — Entry point
├── package.json        — Vite + Three.js
├── vite.config.js      — Configuración Vite
├── src/
│   ├── main.js         — App: escena, carga glTF, vertex displacement
│   └── wavePath.js     — 8 puntos de la curva WavePath
├── public/
│   └── FelsenmeAR.glb  — Modelo exportado (8.2 KB)
└── CONTRATO_FelsenmeAR.md — Este documento
```

### Comandos

```bash
npm run dev     # Servidor de desarrollo (localhost:5173)
npm run build   # Build producción (dist/)
npm run preview # Preview del build
```

---

## Notas adicionales
- El `Smooth by Angle` (Geometry Nodes) en `CapaInferior` puede eliminarse antes de exportar si causa problemas
- `WavePath`, `Camera`, `Light`, `Sphere`, `Cube*`, `ChainLink` **no se exportan**
- El peso estimado del glTF final: **<10 KB**
- La animación en Three.js es determinística: dados los mismos puntos de curva y tiempo, produce el mismo resultado
