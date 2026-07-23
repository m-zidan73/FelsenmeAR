import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const sliderScript = await readFile(new URL("../src/ui/formation-slider.js", import.meta.url), "utf8");

const landscapeStart = styles.indexOf("@media (orientation: landscape) {");
const portraitStart = styles.indexOf("@media (orientation: portrait) {");
const shortLandscapeStart = styles.indexOf("@media (max-height: 560px) and (orientation: landscape) {");
assert.ok(landscapeStart >= 0 && portraitStart > landscapeStart, "landscape CSS block should exist");
assert.ok(shortLandscapeStart > portraitStart, "short-landscape CSS block should exist");
const landscapeCss = styles.slice(landscapeStart, portraitStart);
const shortLandscapeCss = styles.slice(shortLandscapeStart);

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
assert.match(sliderRule, /padding:\s*5px 12px;/);
assert.match(sliderRule, /background:\s*rgba\(238,\s*241,\s*242,\s*0\.4\);/);
assert.doesNotMatch(sliderRule, /grid-template-columns|height:\s*min\(/);

const iconRule = getRule(landscapeCss, ".formation-stage img");
assert.match(iconRule, /width:\s*min\(80%,\s*52px\);/);
assert.match(iconRule, /height:\s*clamp\(27px,\s*6\.3svh,\s*41px\);/);

const trackWrapRule = getRule(landscapeCss, ".formation-track-wrap");
assert.match(trackWrapRule, /height:\s*20px;/);

const rangeRule = getRule(landscapeCss, ".formation-range");
assert.match(rangeRule, /height:\s*28px;/);
assert.match(rangeRule, /top:\s*50%;/);

const trackRule = getRule(landscapeCss, ".formation-track");
assert.match(trackRule, /height:\s*6px;/);

const dotRule = getRule(landscapeCss, ".formation-dot");
assert.match(dotRule, /width:\s*10px;/);
assert.match(dotRule, /height:\s*10px;/);

const activeDotRule = getRule(landscapeCss, ".formation-dot.is-active");
assert.match(activeDotRule, /width:\s*16px;/);
assert.match(activeDotRule, /height:\s*16px;/);

const shortSliderRule = getRule(shortLandscapeCss, ".formation-slider");
assert.match(shortSliderRule, /padding:\s*4px 10px;/);

const shortIconRule = getRule(shortLandscapeCss, ".formation-stage img");
assert.match(shortIconRule, /width:\s*min\(80%,\s*36px\);/);
assert.match(shortIconRule, /height:\s*clamp\(21px,\s*5\.6svh,\s*31px\);/);

assert.doesNotMatch(landscapeCss, /flex-direction:\s*column-reverse;/);
assert.doesNotMatch(landscapeCss, /writing-mode:\s*vertical/);
assert.doesNotMatch(styles, /sliderActivationBounceVertical|sliderPromptUp/);
assert.doesNotMatch(styles, /--landscape-slider-width|--landscape-slider-edge-gap|--slider-progress/);
assert.match(styles, /animation:\s*sliderActivationBounce 0\.9s ease-in-out infinite;/);
assert.match(styles, /animation:\s*sliderPromptLeft 1\.35s ease-in-out infinite;/);
assert.match(sliderScript, /formationFill\.style\.width\s*=\s*progressPercent \+ "%";/);

console.log("bottom-centered landscape slider layout checks passed");
