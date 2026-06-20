# Group 6 Felsenmear Web AR Prototype

Static marker-based WebAR prototype for GitHub Pages hosting.

## Hosting

The site must be opened over HTTPS for camera, location, and motion-sensor permissions to work.

## Marker Tracking

The app uses the official AR.js 3.4.8 ES module build in `vendor/arjs/`. AR.js imports the same bare `three` module as the application, so the import map supplies one shared Three.js 0.160 instance.

Tracking uses ARToolKit barcode marker `0` from matrix family `4x4_BCH_13_5_5`. Marker width, local rock offset, rotation, and scale are configured in `MARKER_CALIBRATION` near the top of `src/app.js`.

Open the app with `?debug` to show camera, marker pose, tracking-loss, calibration, and marker-width diagnostics.

## Local Preview

From this folder:

```powershell
node static-server.mjs
```

Then open:

```text
http://127.0.0.1:5173/
```
