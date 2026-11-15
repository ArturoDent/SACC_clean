// @ts-check
import fs from "fs/promises";
import path from "path";
import { formatHtmlString } from "../formatting/vscodeHtmlFormatter.js";
import { collapseInlineParagraphs } from "../formatting/inlineParagraphs.js";
import { normalizeSpanNestingOrder } from "../cleanup/inlineTagCleanup.js";

import {
  ensureBlankLineAfterBody,
  enforceBlankLineAfterBodyString
} from "../formatting/addBlankAfterBody.js";

export async function serializeAndWriteClean(dom, outputPath) {
  const document = dom.window.document;

  // 1. DOM-level normalization BEFORE serialization
  ensureBlankLineAfterBody(document);
  collapseInlineParagraphs(document);

  // 1.5. collapseInlineParagraphs merges adjacent inline runs (e.g. several
  //      <i> fragments split by a Word artifact), which can both introduce
  //      new span/i/b/u/a nesting-order violations and re-wrap previously
  //      correct ones inside a merged wrapper - re-run the normalizer now
  //      that the paragraph structure is final.
  const nestingResult = normalizeSpanNestingOrder(document);

  // 2. Serialize
  let html = dom.serialize();

  // 3. Collapse excessive blank lines BEFORE formatting
  html = collapseBlankLinesInHtml(html);

  // 4. Format using VS Code HTML language service
  html = formatHtmlString(html, `file://${ outputPath }`, {
    tabSize: 2,
    insertSpaces: true,
    wrapLineLength: 120
  });

  // 4.5. Remove whitespace the formatter injects around inline elements
  //      that lands adjacent to punctuation. In HTML rendering, any
  //      whitespace (including formatter-added newlines) between adjacent
  //      inline elements collapses to a single space, so "( <a…" → "( link".
  html = stripFormatterSpaces(html);

  // 5. Post-format enforcement (ONLY this)
  html = enforceBlankLineAfterBodyString(html);

  // 6. Write to disk
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, "utf8");

  return { nestingResult };
}


/**
 * Remove whitespace that the VS Code HTML formatter injects around inline
 * elements when it wraps long lines.  Those newlines/spaces sit between
 * inline content and render as a visible space in browsers / innerText.
 *
 * Patterns handled (all observed in actual formatter output):
 *
 *  1a. "( <a"         – opening-punct directly before whitespace + inline tag
 *  1b. "(</span>\n<span>" – opening-punct + closing tags + whitespace + inline tag
 *  2.  "</i> ]"        – closing inline tag + whitespace + closing-punct char
 *  3.  "</a> <u><span>]</span></u>" – closing tag + whitespace + punct-only <u>
 *  4.  "species <span>*</span>" – word char + whitespace + single-punct span
 *  5.  'criterion: "</span>\n Species' – span ending with open-quote + whitespace + text
 */
export function stripFormatterSpaces(html) {
  // 1a: Opening-punct directly before whitespace + inline opening tag
  //     "( <a href", "[ <i>", '" <span' → "(<a", "[<i>", '"<span'
  html = html.replace(
    /([(\[“])\s+(<(?:a|i|u|em|strong|span)\b)/g,
    "$1$2"
  );

  // 1b: Opening-punct + one or more closing tags + whitespace + inline opening tag
  //     The punct is the last char inside the closing span/a/etc.
  //     "(</span>\n  <span>" → "(</span><span>"
  html = html.replace(
    /([(\["]((?:<\/[^>]+>)+))\s+(<(?:a|i|u|em|strong|span)\b)/g,
    "$1$3"
  );

  // 2: Closing inline tag + whitespace + closing-punct char
  //    "</i> ]" → "</i>]",  "</a> )" → "</a>)"
  html = html.replace(
    /(<\/(?:a|i|u|em|strong|span)>)\s+([)\].,;:*])/g,
    "$1$2"
  );

  // 3: Closing inline tag + whitespace + punct-only <u> (with optional inner span)
  //    "</a> <u><span class="info">]</span></u>" → "</a>]"
  html = html.replace(
    /(<\/(?:a|i|u|span)>)\s+<u>(?:<span[^>]*>)?([)\].,;:*])(?:<\/span>)?<\/u>/g,
    "$1$2"
  );

  // 4: Word character + whitespace + span containing ONLY a single close-punct char
  //    "species <span class=\"info\">*</span>" → "species<span…>*</span>"
  html = html.replace(
    /([a-zA-Z])\s+(<span\b[^>]*>[)\].,;:*]<\/span>)/g,
    "$1$2"
  );

  // 4b: Closing inline tag + whitespace + single-punct span
  html = html.replace(
    /(<\/(?:a|i|u|span)>)\s+(<span\b[^>]*>[)\].,;:*]<\/span>)/g,
    `$1$2`
  );

  // 5a: Span ending with ( or [ + whitespace + text
  //     e.g. ‘Juan Ignacio Areta (</span> Associate’
  html = html.replace(
    /(<span\b[^>]*>[^<]*[(\[])<\/span>\s+([A-Za-z])/g,
    `$1</span>$2`
  );

  // 5b: Span ending with an OPENING quote (straight ", left curly double \u201c,
  //     left curly single \u2018) + whitespace + text, e.g. 'criterion: "</span> Species'.
  //     Only opening quotes qualify: after a closing quote the space is real.
  html = html.replace(
    /(<span\b[^>]*>[^<]*["\u201c\u2018])<\/span>\s+([A-Za-z])/g,
    `$1</span>$2`
  );

  // 6: Closing inline tag + line-wrapped whitespace + <sup> (footnote superscript numbers)
  //    “Classification</u>\n  <sup>1</sup>:” -> “Classification</u><sup>1</sup>:”
  //    Only fires when the gap includes a newline (i.e. the formatter actually
  //    wrapped the line here) - a same-line single space is legitimate content
  //    (e.g. a span/b edge-whitespace relocation), not formatter noise.
  html = html.replace(
    /(<\/(?:a|i|u|em|strong|span)>)[ \t]*\n[ \t]*(<sup>)/g,
    `$1$2`
  );

  // 7: Closing inline tag + whitespace + punct-only <i> element
  //    “<i>Pterocnemia</i></span> <i>.</i>” -> “<i>Pterocnemia</i></span>.”
  //    Unwraps the <i> since it contains only punctuation.
  html = html.replace(
    /(<\/(?:a|i|u|span)>)\s+<i>([)\].,;:*])<\/i>/g,
    `$1$2`
  );

  return html;
}

/**
 * Collapse all excessive blank lines in HTML.
 * - Keeps exactly one blank line after <body>.
 * - Keeps exactly one blank line between ANY two block-level elements.
 * - Collapses ANY run of 2+ blank lines anywhere else.
 */
// A whitespace run containing at least one newline. Written with disjoint
// pieces instead of `\s*\n+\s*`, whose three overlapping classes made the engine
// retry every split of a long run (about 370ms on the largest part).
const NEWLINE_RUN = String.raw`[ \t]*\n(?:[ \t]*\n)*[ \t]*`;
const BLOCK_TAGS = "div|p|section|article|header|footer|table|thead|tbody|tfoot|tr|ul|ol|li|blockquote|pre";

const BLOCK_GAP_RE = new RegExp(String.raw`(<\/(?:${ BLOCK_TAGS })[^>]*>)${ NEWLINE_RUN }(<(?:${ BLOCK_TAGS })[^>]*>)`, "gi");
const BEFORE_HR_RE = new RegExp(String.raw`(<\/[^>]+>)${ NEWLINE_RUN }(<hr\b[^>]*>)`, "gi");
const AFTER_HR_RE = new RegExp(String.raw`(<hr\b[^>]*>)${ NEWLINE_RUN }(<[^/])`, "gi");
const BEFORE_BR_RE = new RegExp(String.raw`(<\/[^>]+>)${ NEWLINE_RUN }(<br\b[^>]*>)`, "gi");
const AFTER_BR_RE = new RegExp(String.raw`(<br\b[^>]*>)${ NEWLINE_RUN }(<[^/])`, "gi");
const LI_GAP_RE = new RegExp(String.raw`<\/li>${ NEWLINE_RUN }<li`, "gi");

export function collapseBlankLinesInHtml(html) {
  // Normalize CRLF → LF
  html = html.replace(/\r\n/g, "\n");

  // Preserve exactly one blank line after <body>
  html = html.replace(/(<body[^>]*>)\s*\n+/i, "$1\n\n");

  // Preserve exactly one blank line between ANY two block-level tags
  // Example: </div>\n\n\n<div> → </div>\n\n<div>
  html = html.replace(BLOCK_GAP_RE, "$1\n\n$2");

  // Preserve exactly one blank line before <hr> or after <hr>
  html = html.replace(BEFORE_HR_RE, "$1\n\n$2");
  html = html.replace(AFTER_HR_RE, "$1\n\n$2");

  // Preserve exactly one blank line before <br> or after <br> (proposals gap-marker)
  html = html.replace(BEFORE_BR_RE, "$1\n\n$2");
  html = html.replace(AFTER_BR_RE, "$1\n\n$2");

  // Special case: collapse blank lines between <li> siblings
  html = html.replace(LI_GAP_RE, "</li>\n<li");

  // Global fallback: collapse ANY 3+ blank lines to exactly one
  html = html.replace(/\n{3,}/g, "\n\n");

  return html;
}


