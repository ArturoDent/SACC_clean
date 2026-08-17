// @ts-check
const inlineCleanupTags = ["i", "u"];

const isElementNode = (node, Node) => node?.nodeType === Node.ELEMENT_NODE;
const isTextNode = (node, Node) => node?.nodeType === Node.TEXT_NODE;

const appendSpace = (document, node) => {
  const Node = document.defaultView.Node;

  if (isTextNode(node, Node)) {
    node.nodeValue = (node.nodeValue ?? "").replace(/\s*$/, " ");
    return;
  }

  node.after(document.createTextNode(" "));
};

const prependSpace = (document, node) => {
  const Node = document.defaultView.Node;

  if (isTextNode(node, Node)) {
    node.nodeValue = (node.nodeValue ?? "").replace(/^\s*/, " ");
    return;
  }

  node.before(document.createTextNode(" "));
};

const getTextNodes = (document, element) => {
  const walker = document.createTreeWalker(element, document.defaultView.NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) textNodes.push(walker.currentNode);

  return textNodes;
};

// Opening chars after which a space should NOT be pushed (e.g. `(`, `[`, `"`)
const OPEN_PUNCT_RE = /[\(\["]$/;
// Closing chars before which a space should NOT be pushed (e.g. `)`, `]`, `"`, `,`, `.`, etc.)
const CLOSE_PUNCT_RE = /^[\)\]".,;:*\/]/;

const getNodeText = (node, Node) =>
  node.nodeType === Node.TEXT_NODE ? (node.nodeValue ?? "") : (node.textContent ?? "");

const trimElementEdgeWhitespace = (document, element) => {
  const Node = document.defaultView.Node;
  const hadLeadingWhitespace = /^\s/.test(element.textContent ?? "");
  const hadTrailingWhitespace = /\s$/.test(element.textContent ?? "");
  const textNodes = getTextNodes(document, element);

  textNodes[0].nodeValue = (textNodes[0].nodeValue ?? "").replace(/^\s+/, "");
  textNodes[textNodes.length - 1].nodeValue = (textNodes[textNodes.length - 1].nodeValue ?? "").replace(/\s+$/, "");

  if (hadLeadingWhitespace) {
    const prev = element.previousSibling ?? element.parentNode?.previousSibling;
    if (prev && !OPEN_PUNCT_RE.test(getNodeText(prev, Node))) {
      appendSpace(document, prev);
    }
  }

  if (hadTrailingWhitespace) {
    const next = element.nextSibling ?? element.parentNode?.nextSibling;
    if (next && !CLOSE_PUNCT_RE.test(getNodeText(next, Node))) {
      prependSpace(document, next);
    }
  }
};

export const unwrapWhitespaceOnlyFormattingTags = (document) => {
  let replacements = 0;

  for (const selector of inlineCleanupTags) {
    for (const element of [...document.querySelectorAll(selector)]) {
      if (/^\s*$/.test(element.textContent ?? "")) {
        element.replaceWith(document.createTextNode(" "));
        replacements++;
      }
    }
  }

  return {
    message: `Replaced ${ replacements } whitespace-only formatting tag${ replacements === 1 ? "" : "s" } with text.`,
    replacements,
  };
};

export const unwrapPunctuationOnlyFormattingTags = (document) => {
  let replacements = 0;

  for (const selector of inlineCleanupTags) {
    for (const element of [...document.querySelectorAll(selector)]) {
      if (/^[.,;]$/.test(element.textContent ?? "")) {
        element.replaceWith(document.createTextNode(element.textContent ?? ""));
        replacements++;
      }
    }
  }

  return {
    message: `Replaced ${ replacements } punctuation-only formatting tag${ replacements === 1 ? "" : "s" } with text.`,
    replacements,
  };
};

export const trimFormattingTagWhitespace = (document) => {
  let trims = 0;

  for (const selector of inlineCleanupTags) {
    for (const element of [...document.querySelectorAll(selector)]) {
      const text = element.textContent ?? "";
      if (!text.trim() || text === text.trim()) continue;

      trimElementEdgeWhitespace(document, element);
      trims++;
    }
  }

  document.normalize();

  return {
    message: `Trimmed edge whitespace from ${ trims } formatting tag${ trims === 1 ? "" : "s" }.`,
    trims,
  };
};

// Is every non-whitespace text node inside `element` covered by some <i> ancestor
// within `element` itself (not reaching outside it)?
const isSubtreeFullyItalic = (document, element, Node) => {
  const textNodes = getTextNodes(document, element).filter((t) => (t.nodeValue ?? "").trim());
  if (!textNodes.length) return false;

  return textNodes.every((t) => {
    let n = t.parentNode;
    while (n && n !== element.parentNode) {
      if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "I") return true;
      n = n.parentNode;
    }
    return false;
  });
};

// Is this direct child of <p> "italic-covered": whitespace-only text, an <i> itself,
// or a non-italic wrapper (<a>, <span>, ...) whose entire text sits inside a nested <i>?
const isNodeItalicCovered = (document, node, Node) => {
  if (node.nodeType === Node.TEXT_NODE) return !(node.nodeValue ?? "").trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return true;
  if (node.tagName === "I") return true;
  return isSubtreeFullyItalic(document, node, Node);
};

const countItalics = (node, Node) => {
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  return node.tagName === "I" ? 1 : node.querySelectorAll("i").length;
};

// A paragraph (or a run within one) can end up with its italic text split across
// several <i> elements separated only by whitespace or non-italic wrappers (an <a>,
// a colored <span>) — e.g. Word re-applying italics around a hyperlink, an inserted
// proposal date, or a spell-check span. Wherever a maximal run of a paragraph's
// direct children is entirely italic-covered and spans 2+ <i> elements, collapse it
// down to one <i> wrapping that run instead of several fragments.
export const mergeFragmentedItalicParagraphs = (document) => {
  const Node = document.defaultView.Node;
  let merges = 0;

  for (const p of [...document.querySelectorAll("p")]) {
    const children = [...p.childNodes];
    let i = 0;

    while (i < children.length) {
      if (!isNodeItalicCovered(document, children[i], Node)) { i++; continue; }

      const runStart = i;
      let italics = 0;
      while (i < children.length && isNodeItalicCovered(document, children[i], Node)) {
        italics += countItalics(children[i], Node);
        i++;
      }
      const runNodes = children.slice(runStart, i);
      const hasText = runNodes.some((n) => (n.textContent ?? "").trim());

      if (italics < 2 || !hasText) continue;

      const wrapper = document.createElement("i");
      runNodes[0].parentNode?.insertBefore(wrapper, runNodes[0]);
      for (const node of runNodes) wrapper.appendChild(node);

      for (const nested of [...wrapper.querySelectorAll("i")]) {
        while (nested.firstChild) nested.parentNode?.insertBefore(nested.firstChild, nested);
        nested.remove();
      }

      merges++;
    }
  }

  return {
    message: `Merged ${ merges } fragmented-italic run${ merges === 1 ? "" : "s" } into a single <i>.`,
    merges,
  };
};

export const combineAbbreviatedItalicNames = (document) => {
  const Node = document.defaultView.Node;
  let merges = 0;

  for (const italic of [...document.querySelectorAll("i")]) {
    const separator = italic.nextSibling;
    const nextItalic = separator?.nextSibling;

    if (!isTextNode(separator, Node) || !/^\.\s*$/.test(separator.nodeValue ?? "")) continue;
    if (!isElementNode(nextItalic, Node) || nextItalic.tagName !== "I") continue;

    italic.textContent = `${ (italic.textContent ?? "").trim() }. ${ (nextItalic.textContent ?? "").trim() }`;
    separator.remove();
    nextItalic.remove();
    merges++;
  }

  return {
    message: `Combined ${ merges } abbreviated italic name${ merges === 1 ? "" : "s" } separated by a period.`,
    merges,
  };
};
