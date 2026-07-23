import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [html, styles, dom, menu, app, ar, placement, tutorial, hud] = await Promise.all([
  read("../index.html"), read("../src/styles.css"), read("../src/dom.js"),
  read("../src/ui/menu.js"), read("../src/app_Revised.js"), read("../src/ar-controller.js"),
  read("../src/formation/placement-controller.js"), read("../src/tutorial-controller.js"), read("../src/ui/hud.js")
]);
const activeUiSources = [html, styles, dom, menu, app, ar, placement].join("\n");
assert.doesNotMatch(activeUiSources, /scanPrompt|setScanPromptVisible|bounceScanPrompt/);
assert.doesNotMatch(html, /Please face the camera on top of a flat surface|class="placement-controls"/);
assert.doesNotMatch(styles, /\.scan-prompt|promptBounce|\.placement-controls/);
const tutorialPanel = styles.match(/\.tutorial-panel\s*\{([^}]*)\}/s)?.[1] || "";
assert.match(tutorialPanel, /background:\s*rgba\(0,\s*0,\s*0,\s*0\.2\);/);
const stageInstruction = styles.match(/\.stage-instruction\s*\{([^}]*)\}/s)?.[1] || "";
assert.match(stageInstruction, /transform:\s*translate\(-50%,\s*-50%\) scale\(0\.5\);/);
assert.match(stageInstruction, /background:\s*rgba\(0,\s*0,\s*0,\s*0\.88\);/);
assert.match(stageInstruction, /border:\s*2px solid rgba\(255,\s*255,\s*255,\s*0\.88\);/);
assert.match(tutorial, /Scanning:\s*"Scan a flat surface slowly"/);
assert.match(hud, /Tap on the 1st Stage/);
console.log("tutorial and AR instruction UI checks passed");
