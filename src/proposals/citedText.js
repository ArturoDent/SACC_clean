// @ts-check
import { isBlankElement, isIgnorableElement } from "../cleanup/wordCleanup.js";

const CITED_COLOR_RE = /color\s*:\s*#0070c0/i;

// A paragraph that's only partly colored (e.g. one tracked-change letter like
// "(A)" inside an otherwise normal sentence) is noise, not a real quoted block.
// Real quoted paragraphs have the color applied to nearly all of their text.
const MIN_COLORED_RATIO = 0.5;

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

const coloredTextRatio = (element) => {
  const totalText = normalizeText(element.textContent ?? "");
  if (!totalText) return 0;

  const styled = [...element.querySelectorAll("[style]")];
  const candidates = CITED_COLOR_RE.test(element.getAttribute("style") ?? "")
    ? [element, ...styled]
    : styled;
  const coloredNodes = candidates.filter((node) => CITED_COLOR_RE.test(node.getAttribute("style") ?? ""));

  // Keep only the outermost colored nodes so nested matches aren't double-counted.
  const outermost = coloredNodes.filter(
    (node, _index, all) => !all.some((other) => other !== node && other.contains(node))
  );

  const coloredLength = outermost.reduce(
    (sum, node) => sum + normalizeText(node.textContent ?? "").length,
    0
  );

  return coloredLength / totalText.length;
};

const isCitedParagraph = (element) =>
  ["P", "DIV"].includes(element.tagName) && coloredTextRatio(element) >= MIN_COLORED_RATIO;

/**
 * Wraps runs of paragraphs whose text is predominantly colored #0070C0 — Word's
 * marker for text pasted in from an external document — in a <div class="citedText">,
 * so the color can be applied once via CSS instead of on every paragraph/span.
 * A run can be as short as a single paragraph; blank or empty bookmark elements
 * between qualifying paragraphs don't break the run, but don't end one either.
 */
export const convertCitedText = (document) => {
  const container = document.querySelector("body > div") ?? document.body;
  const children = [...container.children];

  let wrapped = 0;
  let index = 0;

  while (index < children.length) {
    if (!isCitedParagraph(children[index])) { index++; continue; }

    const run = [children[index]];
    let next = index + 1;

    while (next < children.length) {
      const candidate = children[next];
      if (isCitedParagraph(candidate) || isBlankElement(candidate) || isIgnorableElement(candidate)) {
        run.push(candidate);
        next++;
        continue;
      }
      break;
    }

    while (run.length > 1 && !isCitedParagraph(run[run.length - 1])) {
      run.pop();
      next--;
    }

    const block = document.createElement("div");
    block.className = "citedText";
    run[0].before(block);
    for (const element of run) block.appendChild(element);
    wrapped++;

    index = next;
  }

  return {
    message: `Wrapped ${ wrapped } cited text block${ wrapped === 1 ? "" : "s" } in .citedText.`,
    wrapped,
  };
};
