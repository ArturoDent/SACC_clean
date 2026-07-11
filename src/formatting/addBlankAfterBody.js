// @ts-check
// Ensures exactly one blank line after <body>
export function ensureBlankLineAfterBody(document) {
  const Node = document.defaultView.Node;   // <-- FIX

  const body = document.body;
  if (!body) return;

  const first = body.firstChild;
  const desired = "\n\n";

  if (first && first.nodeType === Node.TEXT_NODE) {
    first.nodeValue = desired + first.nodeValue.replace(/^\s+/, "");
  } else {
    body.insertBefore(document.createTextNode(desired), first);
  }
}



export function enforceBlankLineAfterBodyString(html) {
  return html.replace(/(<body[^>]*>)[\s\r\n]*/i, "$1\n\n");
}