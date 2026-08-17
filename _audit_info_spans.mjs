import { JSDOM } from "jsdom";
import fs from "node:fs";

const dir = "clean/baseline";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".htm"));

let total = 0;
const bad = [];

for (const f of files) {
  const html = fs.readFileSync(`${ dir }/${ f }`, "utf8");
  const dom = new JSDOM(html, { includeNodeLocations: true });
  const spans = dom.window.document.querySelectorAll("span.info");
  for (const s of spans) {
    total++;
    const text = (s.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text.startsWith("SACC proposal")) {
      const loc = dom.nodeLocation(s);

      // Classify by what immediately precedes this span.
      let prevKind = "none";
      let prevInfo = "";
      let node = s.previousSibling;
      // Walk up if this span is the first child of an <i> (nested-italic case).
      let container = s;
      if (s.parentElement?.tagName === "I" && s.parentElement.previousSibling === null) {
        container = s.parentElement;
      }
      node = container.previousSibling;
      if (node) {
        if (node.nodeType === 3) {
          // text node
          const t = (node.textContent ?? "").trim();
          if (t === "") {
            const prev2 = node.previousSibling;
            prevKind = prev2 ? `text(empty)-then-${ prev2.nodeType === 1 ? prev2.tagName : "text" }` : "text(empty)-start";
            prevInfo = prev2 && prev2.nodeType === 1 ? (prev2.className || "") : "";
          } else {
            prevKind = "bare-text";
            prevInfo = t.slice(-40);
          }
        } else if (node.nodeType === 1) {
          prevKind = node.tagName + (node.className ? `.${ node.className }` : "");
          prevInfo = (node.textContent ?? "").trim().slice(-40);
        }
      }

      bad.push({ file: f, line: loc?.startLine ?? -1, text, prevKind, prevInfo });
    }
  }
}

console.log(`Total span.info: ${ total }`);
console.log(`Not starting with "SACC proposal": ${ bad.length }`);
fs.writeFileSync(
  "C:/Users/markm/AppData/Local/Temp/claude/c--Users-markm-OneDrive-SACC-clean/42a9fdc2-6a58-4b6a-89aa-943b8f430cd5/scratchpad/info_span_audit.json",
  JSON.stringify(bad, null, 2),
  "utf8"
);
