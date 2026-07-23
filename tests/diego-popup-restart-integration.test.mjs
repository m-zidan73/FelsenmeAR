import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const app = read("src/app_Revised.js");
const audio = read("src/audio-manager.js");
const factory = read("src/formation/model-factory.js");
const html = read("index.html");
const styles = read("src/styles.css");
const tectonic = read("TectonicModel/src/tectonic-collision-controller.js");

assert.match(factory, /"1st Stage Rock#comp"/);
assert.match(factory, /labels\.__colliders = colliders/);
assert.match(factory, /export function toggleLabelSprite/);
assert.doesNotMatch(factory, /EdgesGeometry|wireframe:\s*true/);

assert.match(app, /tapRaycaster\.addTarget\("formation_labels", colliders\)/);
assert.match(app, /tapRaycaster\.addTarget\("tectonic_labels", tectonicColliders\)/);
assert.equal(
  (app.match(/tapRaycaster\.addTarget\("tectonic_labels"/g) || []).length,
  1,
  "tectonic label colliders must be registered as one target collection"
);
assert.match(app, /function resetPopupState/);
assert.match(app, /function restartStageOne\(\)[\s\S]*audioManager\.restartStageOne\(\)/);
const restartCoordinator = app.match(/function restartStageOne\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
assert.doesNotMatch(restartCoordinator, /resetFormationState|resetPlacement|requestStage/);

assert.match(tectonic, /function restartStageOne\(\)/);
assert.match(tectonic, /model\.showInitial\(\)/);
assert.match(tectonic, /restartStageOne,\s*\n\s*reset,/);
assert.match(audio, /function restartStageOne\(\) \{\s*handleStateChange\("Stage1"\)/);

assert.match(html, /id="popupToggle"[^>]*hidden/);
assert.match(html, /id="restartStageOneButton"[^>]*hidden/);
assert.match(styles, /\.popup-toggle\s*\{/);
assert.match(styles, /\.restart-stage-one-button\s*\{/);
assert.doesNotMatch(styles.slice(styles.indexOf("\/\* AR control positions")), /is-landscape|is-portrait|visualViewport/);

assert.match(styles, /\.bottom-ui\s*\{[\s\S]*?justify-self:\s*center/);
assert.match(styles, /@media \(orientation:\s*landscape\)[\s\S]*?\.bottom-ui\s*\{[\s\S]*?left:\s*50%/);

console.log("Diego popup and isolated Stage 1 restart integration checks passed");
