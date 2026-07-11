// @ts-check
import { mergeFragmentedItalicParagraphs } from "../cleanup/inlineTagCleanup.js";

const unwrapWhitespaceOnlySpans = (document, root) => {
  for (const span of [...root.querySelectorAll("span")]) {
    if (span.attributes.length === 0 && /^\s*$/.test(span.textContent ?? "")) {
      span.replaceWith(document.createTextNode(span.textContent ?? ""));
    }
  }
};

const escapeHtmlText = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const unwrapUnclassedSpans = (root) => {
  for (const span of [...root.querySelectorAll("span")]) {
    if (span.attributes.length === 0) {
      span.replaceWith(...span.childNodes);
    }
  }
};

const isInfoNode = (node, Node, className = "info") => {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.tagName === "SPAN" && node.classList.contains(className)) return true;

  return node.tagName === "A"
    && [...node.childNodes].some((child) => child.textContent?.trim())
    && [...node.childNodes].every((child) =>
      (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim())
      || (child.nodeType === Node.ELEMENT_NODE
        && child.tagName === "SPAN"
        && child.classList.contains(className))
    );
};

const unwrapInfoSpans = (root, className = "info") => {
  for (const span of [...root.querySelectorAll(`span.${className}`)]) {
    span.replaceWith(...span.childNodes);
  }
};

const consolidateInfoRuns = (document, root, className = "info") => {
  const Node = document.defaultView.Node;
  const nodes = [...root.childNodes];

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!isInfoNode(node, Node, className) || !node.parentNode) continue;

    const run = [node];
    let cursor = node.nextSibling;

    while (cursor) {
      // Whitespace-only text node: extend through it
      if (cursor.nodeType === Node.TEXT_NODE && !cursor.textContent?.trim()) {
        run.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      // Info node (span.className, or <a> whose children are ALL info spans): extend
      if (isInfoNode(cursor, Node, className)) {
        run.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      // Bare <a> bridge — link text not wrapped in an info span (common for .info class).
      // Extend speculatively; the trim step below drops it if no info node follows.
      if (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === "A") {
        run.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      break;
    }

    // Drop trailing whitespace/bridge nodes so the run ends on an info node.
    // Those nodes stay in the DOM unchanged — we just won't move them.
    while (run.length > 1 && !isInfoNode(run[run.length - 1], Node, className)) {
      run.pop();
    }

    if (run.filter((runNode) => isInfoNode(runNode, Node, className)).length < 2) continue;

    const infoSpan = document.createElement("span");
    infoSpan.className = className;
    node.before(infoSpan);

    for (const runNode of run) {
      if (runNode.nodeType === Node.TEXT_NODE) {
        infoSpan.appendChild(document.createTextNode(" "));
        runNode.remove();
        continue;
      }

      if (runNode.tagName === "SPAN") {
        while (runNode.firstChild) {
          infoSpan.appendChild(runNode.firstChild);
        }
        runNode.remove();
        continue;
      }

      unwrapInfoSpans(runNode, className);
      infoSpan.appendChild(runNode);
    }

    collapseTextNodeWhitespace(document, infoSpan);
  }
};

const mergeAdjacentItalicElements = (document, root) => {
  const trimLeadingText = (element) => {
    const walker = document.createTreeWalker(element, document.defaultView.NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode() ? walker.currentNode : null;

    if (!textNode) return false;

    const hadLeadingWhitespace = /^\s/.test(textNode.nodeValue ?? "");
    textNode.nodeValue = (textNode.nodeValue ?? "").replace(/^\s+/, "");

    return hadLeadingWhitespace;
  };

  for (const italic of [...root.querySelectorAll("i")]) {
    while (true) {
      let separator = italic.nextSibling;
      let nextItalic = separator;

      if (separator?.nodeType === document.defaultView.Node.TEXT_NODE && /^\s*$/.test(separator.nodeValue ?? "")) {
        nextItalic = separator.nextSibling;
      } else {
        separator = null;
      }

      if (nextItalic?.nodeType !== document.defaultView.Node.ELEMENT_NODE || nextItalic.tagName !== "I") break;

      const nextItalicHadLeadingWhitespace = trimLeadingText(nextItalic);
      italic.appendChild(document.createTextNode(separator || nextItalicHadLeadingWhitespace ? " " : ""));

      while (nextItalic.firstChild) {
        italic.appendChild(nextItalic.firstChild);
      }

      separator?.remove();
      nextItalic.remove();
    }
  }
};

const collapseTextNodeWhitespace = (document, root) => {
  root.normalize();

  const walker = document.createTreeWalker(root, document.defaultView.NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const textNode of textNodes) {
    textNode.nodeValue = (textNode.nodeValue ?? "").replace(/\s+/g, " ");
  }

  root.normalize();
};

const normalizePunctuationSpacing = (document, root) => {
  const walker = document.createTreeWalker(root, document.defaultView.NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const textNode of textNodes) {
    textNode.nodeValue = (textNode.nodeValue ?? "")
      .replace(/\s{2,}([.,;:!?)])/g, "$1");
  }
};

const trimParagraphEdgeWhitespace = (root) => {
  root.normalize();

  if (root.firstChild?.nodeType === root.ownerDocument.defaultView.Node.TEXT_NODE) {
    root.firstChild.nodeValue = (root.firstChild.nodeValue ?? "").replace(/^\s+/, "");
  }

  if (root.lastChild?.nodeType === root.ownerDocument.defaultView.Node.TEXT_NODE) {
    root.lastChild.nodeValue = (root.lastChild.nodeValue ?? "").replace(/\s+$/, "");
  }
};

// Collapse inline <p> content into a single line
export function collapseInlineParagraphs(document) {
  const Node = document.defaultView.Node;

  const paragraphs = [...document.querySelectorAll("p")];

  for (const p of paragraphs) {
    // Skip paragraphs that contain block elements
    if ([...p.children].some(el =>
      ["DIV", "P", "UL", "OL", "TABLE", "SECTION", "ARTICLE"].includes(el.tagName)
    )) continue;

    // Unwrap attribute-less spans before building parts so adjacent spans that
    // share a word (Word split-formatting artifact like <span>cons</span><span>pecific</span>)
    // are merged into a single text node by normalize() rather than getting a
    // space injected between them by the reduce() below.
    unwrapUnclassedSpans(p);
    p.normalize();

    const parts = [];
    let prevHadTrailSpace = false;

    for (const node of [...p.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) {
        const raw = node.nodeValue ?? "";
        const t = raw.replace(/\s+/g, " ").trim();
        if (t) {
          parts.push({
            content: escapeHtmlText(t),
            needsLeadSpace: prevHadTrailSpace || /^\s/.test(raw)
          });
          prevHadTrailSpace = /\s$/.test(raw);
        } else {
          prevHadTrailSpace = true;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Inline elements: <i>, <a>, <span>, <b>, etc.
        const html = node.outerHTML.replace(/\s+/g, " ").trim();
        parts.push({ content: html, needsLeadSpace: prevHadTrailSpace });
        prevHadTrailSpace = false;
      }
    }

    // A paragraph that had content but collapses to no parts was a deliberate
    // blank line (e.g. a non-breaking-space placeholder) — keep it visible
    // rather than emptying it out, which would zero its rendered height.
    if (!parts.length && p.childNodes.length) {
      p.innerHTML = "&nbsp;";
      continue;
    }

    p.innerHTML = parts.reduce((html, part) => {
      if (!html) return part.content;
      if (/^[.,;:!?)]/.test(part.content)) return html + part.content;
      if (part.needsLeadSpace) return `${ html } ${ part.content }`;
      return html + part.content;
    }, "");

    unwrapWhitespaceOnlySpans(document, p);
    collapseTextNodeWhitespace(document, p);
    consolidateInfoRuns(document, p);
    consolidateInfoRuns(document, p, "pendingProposal");
    unwrapUnclassedSpans(p);
    collapseTextNodeWhitespace(document, p);
    mergeAdjacentItalicElements(document, p);
    collapseTextNodeWhitespace(document, p);
    consolidateInfoRuns(document, p);
    consolidateInfoRuns(document, p, "pendingProposal");
    normalizePunctuationSpacing(document, p);
    trimParagraphEdgeWhitespace(p);

    // Remove truly empty classified spans (e.g. <span class="proposalNeeded"></span> left after
    // stripping <o:p>). Whitespace-only spans are unwrapped to preserve their space content —
    // they often act as the sole separator between adjacent inline elements.
    for (const span of [...p.querySelectorAll("span")]) {
      if (span.childElementCount === 0) {
        const text = span.textContent ?? "";
        if (!text) span.remove();
        else if (!text.trim()) span.replaceWith(document.createTextNode(text));
      }
    }
  }

  // consolidateInfoRuns above can merge separately-italicized runs into new
  // arrangements that are themselves fragmented (e.g. leaving a lone <i>.</i>
  // directly beside a still-classed span containing its own <i>) — sweep once
  // more now that the paragraph has taken its final shape.
  mergeFragmentedItalicParagraphs(document);
}
