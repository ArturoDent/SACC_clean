// @ts-check
import { getLanguageService } from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

export function applyTextEdits(text, doc, edits) {
  const editsWithOffsets = edits.map((e) => ({
    start: doc.offsetAt(e.range.start),
    end: doc.offsetAt(e.range.end),
    newText: e.newText
  }));

  editsWithOffsets.sort((a, b) => b.start - a.start);

  let result = text;
  for (const e of editsWithOffsets) {
    result = result.slice(0, e.start) + e.newText + result.slice(e.end);
  }
  return result;
}

export function formatHtmlString(html, fileUri = "file:///untitled.html", options = {}) {
  const ls = getLanguageService();
  const doc = TextDocument.create(fileUri, "html", 0, html);

  const fullRange = {
    start: { line: 0, character: 0 },
    end: doc.positionAt(html.length)
  };

  const formatOptions = {
    tabSize: options.tabSize ?? 2,
    insertSpaces: options.insertSpaces ?? true,
    wrapLineLength: options.wrapLineLength ?? 120
  };

  const edits = ls.format(doc, fullRange, formatOptions);
  if (!edits || edits.length === 0) return html;

  return applyTextEdits(html, doc, edits);
}
