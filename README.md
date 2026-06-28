# Group 6 Felsenmear Web AR Prototype

Static WebXR prototype for GitLab Pages hosting.

## Development Guidelines

All future changes must keep the code loosely coupled. Prefer small modules with explicit dependencies over shared global state or tightly connected functions. When adding or changing behavior, preserve existing functionality, reduce interdependency where practical, and verify the change before stacking additional work on top.

For larger changes, refactor in small phases and commit after each verified phase so regressions are easier to isolate.

## Safe Change Workflow

Treat every requested change as a small product decision plus a small architecture change. Every feature should have an owner module, explicit dependencies, a removal path, and a verification step.

### Change Request

When requesting changes, include the desired behavior, what must stay unchanged, and whether any older behavior is now obsolete.

```text
I want to change/add/remove [feature].

Desired behavior:
- ...

Keep unchanged:
- ...

Obsolete behavior to remove:
- ...

Safety requirement:
- Keep this loosely coupled.
- Do not add hidden dependencies or shared global state.
- Remove dead code if this replaces an older feature.
- Verify the app still loads and the relevant flow still works.
```

### Implementation Rules

- Inspect the affected modules before editing.
- Keep feature logic in the smallest appropriate owner module.
- Keep `src/app.js` as the composition root only.
- Pass dependencies explicitly instead of importing from `src/app.js`.
- Avoid shared global state unless it is already part of the app state model.
- Preserve existing behavior unless the request explicitly replaces it.
- Do not keep obsolete fallback branches, unused functions, stale comments, unused imports, or dead UI code.

### Obsolete Code Removal

When replacing behavior, remove the old path completely:

- unused functions
- unused state fields
- unused imports
- unused event listeners
- unused UI elements or CSS classes
- unused debug hooks
- stale comments or documentation

Search for the old feature name before committing so stale references do not remain.

### Verification

After each meaningful change:

- run JavaScript syntax checks
- confirm relative module imports resolve
- start the local preview server
- smoke-test the affected UI, AR, debug, or reset flow
- review `git diff` for unrelated changes

### Prompt Templates

Adding a feature:

```text
Add [feature].

Behavior:
- ...

Keep unchanged:
- ...

Architecture:
- Keep it loosely coupled.
- Put the feature logic in the smallest appropriate owner module.
- Use explicit dependency injection instead of importing from app.js.
- Do not add global state unless there is no safer option.

Verification:
- Run syntax checks.
- Confirm imports resolve.
- Run the local server smoke test.
- Tell me what changed and what files own the behavior.
```

Changing an existing feature:

```text
Change [existing feature] so that [new behavior].

Important:
- Preserve [specific behavior].
- Replace [old behavior] if it conflicts.
- Remove obsolete code instead of leaving fallback branches behind.
- Search for stale references after the change.

Keep the code loosely coupled and commit the change separately.
```

Removing a feature:

```text
Remove [feature] completely.

Please remove:
- behavior logic
- unused state fields
- unused UI elements/classes
- unused imports
- stale debug hooks
- stale docs/comments

Do not remove unrelated code. Verify that the app still loads and that nearby features still work.
```

Refactoring only:

```text
Refactor [area/module] without changing behavior.

Rules:
- No feature changes.
- Keep public behavior and messages the same.
- Move code into smaller modules with explicit dependencies.
- Remove duplicated or dead code only when it is clearly unused.
- Commit after verification.
```

For any change that replaces old behavior, include this line:

```text
Also remove anything made obsolete by this change.
```

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
