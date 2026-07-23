import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const sliderScript = await readFile(new URL("../src/ui/formation-slider.js", import.meta.url), "utf8");

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

const bottomUiRule = getRule(landscapeCss, ".bottom-ui");
assert.match(bottomUiRule, /position:\s*fixed;/);
assert.match(bottomUiRule, /left:\s*50%;/);
assert.match(bottomUiRule, /bottom:\s*calc\(/);
assert.match(bottomUiRule, /transform:\s*translateX\(-50%\);/);
assert.match(bottomUiRule, /width:\s*min\(58vw,\s*760px\);/);
assert.doesNotMatch(bottomUiRule, /right:|top:\s*0|place-items|translateY/);

const sliderRule = getRule(landscapeCss, ".formation-slider");
assert.match(sliderRule, /padding:\s*7px 12px 8px;/);
assert.doesNotMatch(sliderRule, /grid-template-columns|height:\s*min\(/);

assert.doesNotMatch(landscapeCss, /flex-direction:\s*column-reverse;/);
assert.doesNotMatch(landscapeCss, /writing-mode:\s*vertical/);
assert.doesNotMatch(styles, /sliderActivationBounceVertical|sliderPromptUp/);
assert.doesNotMatch(styles, /--landscape-slider-width|--landscape-slider-edge-gap|--slider-progress/);
assert.match(sliderScript, /formationFill\.style\.width\s*=\s*progressPercent \+ "%";/);

console.log("bottom-centered landscape slider layout checks passed");
