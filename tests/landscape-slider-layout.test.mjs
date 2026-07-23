import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app_Revised.js", import.meta.url), "utf8");

const landscapeStart = styles.indexOf("@media (orientation: landscape) {");
const portraitStart = styles.indexOf("@media (orientation: portrait) {");
assert.ok(landscapeStart >= 0 && portraitStart > landscapeStart, "landscape CSS block should exist");
const landscapeCss = styles.slice(landscapeStart, portraitStart);

function getRule(source, selector) {
  const start = source.indexOf(selector + " {");
  assert.ok(start >= 0, selector + " rule should exist");
  const end = source.indexOf("}", start);
  return source.slice(start, end + 1);
}

const railRule = getRule(landscapeCss, ".bottom-ui");
assert.match(railRule, /position:\s*absolute;/);
assert.match(railRule, /top:\s*0;/);
assert.match(railRule, /bottom:\s*0;/);
assert.match(railRule, /height:\s*auto;/);
assert.match(railRule, /place-items:\s*center;/);
assert.doesNotMatch(railRule, /visual-viewport|translateY\(-50%\)|position:\s*fixed/);

const sliderRule = getRule(landscapeCss, ".formation-slider");
assert.match(sliderRule, /height:\s*min\(70%,\s*480px\);/);
assert.match(sliderRule, /max-height:\s*calc\(100%/);

assert.match(landscapeCss, /flex-direction:\s*column-reverse;/);
assert.match(landscapeCss, /sliderActivationBounceVertical/);
assert.match(landscapeCss, /sliderPromptUp/);
assert.doesNotMatch(styles, /--ar-visual-viewport/);
assert.doesNotMatch(app, /viewportLayoutController|viewport-layout-controller/);
assert.match(app, /window\.addEventListener\("resize",\s*onResize\);/);

console.log("landscape slider HUD layout checks passed");