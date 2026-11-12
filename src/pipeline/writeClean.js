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
 * Collapse multiple blank lines between paragraphs in an HTML string.
 * Keeps exactly one empty line between </p> and <p>.
 * Also collapses any 3+ blank lines anywhere to two newlines as a conservative fallback.
 *
 * @param {string} html
 * @returns {string}
 */
// function collapseBlankLinesInHtml(html) {
//   // collapse whitespace/newlines/tabs between </p> and <p> to exactly one blank line
//   html = html.replace(/<\/p>\s*(?:\r?\n[ \t]*)+<p>/g, "</p>\n\n<p>");
//   // global conservative fallback: collapse 3+ blank lines anywhere to two newlines
//   // html = html.replace(/(\r?\n\s*){3,}/g, "\n\n");
//   return html;
// }

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

  // 5b: Span ending with any straight or curly double/single quote + whitespace + text
  //     e.g. ‘criterion: “</span> Species’  (“ = left curly quote)
  html = html.replace(
    /(<span\b[^>]*>[^<]*["$1$2"”’])<\/span>\s+([A-Za-z])/g,
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
export function collapseBlankLinesInHtml(html) {
  // Normalize CRLF → LF
  html = html.replace(/\r\n/g, "\n");

  // Preserve exactly one blank line after <body>
  html = html.replace(/(<body[^>]*>)\s*\n+/i, "$1\n\n");

  // Preserve exactly one blank line between ANY two block-level tags
  // Example: </div>\n\n\n<div> → </div>\n\n<div>
  html = html.replace(
    /(<\/(?:div|p|section|article|header|footer|table|thead|tbody|tfoot|tr|ul|ol|li|blockquote|pre)[^>]*>)\s*\n+\s*(<(?:div|p|section|article|header|footer|table|thead|tbody|tfoot|tr|ul|ol|li|blockquote|pre)[^>]*>)/gi,
    "$1\n\n$2"
  );

  // Preserve exactly one blank line before <hr> or after <hr>
  html = html.replace(/(<\/[^>]+>)\s*\n+\s*(<hr\b[^>]*>)/gi, "$1\n\n$2");
  html = html.replace(/(<hr\b[^>]*>)\s*\n+\s*(<[^/])/gi, "$1\n\n$2");

  // Preserve exactly one blank line before <br> or after <br> (proposals gap-marker)
  html = html.replace(/(<\/[^>]+>)\s*\n+\s*(<br\b[^>]*>)/gi, "$1\n\n$2");
  html = html.replace(/(<br\b[^>]*>)\s*\n+\s*(<[^/])/gi, "$1\n\n$2");

  // Special case: collapse blank lines between <li> siblings
  html = html.replace(/<\/li>\s*\n+\s*<li/gi, "</li>\n<li");

  // Global fallback: collapse ANY 3+ blank lines to exactly one
  html = html.replace(/\n{3,}/g, "\n\n");

  return html;
}


