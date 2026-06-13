# Group 6 Felsenmear Web AR Prototype

Static WebXR prototype for GitLab Pages hosting.

## Hosting

GitLab Pages publishes the contents of `index.html`, `src/`, and `Assets/` through the pipeline in `.gitlab-ci.yml`.

The site must be opened over HTTPS for camera, location, motion sensors, and WebXR permissions to work.

## Local Preview

From this folder:

```powershell
node static-server.mjs
```

Then open:

```text
http://127.0.0.1:5173/
```
