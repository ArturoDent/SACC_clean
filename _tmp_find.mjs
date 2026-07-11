import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import path from "node:path";

const dirs = ["clean/proposals", "clean/baseline"];
for (const dir of dirs) {
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".htm")) continue;
    const html = await fs.readFile(path.join(dir, f), "utf8");
    const dom = new JSDOM(html);
    const { document } = dom.window;
    for (const el of [...document.querySelectorAll(".red")]) {
      const t = (el.textContent ?? "").trim();
      if (/proposal|needed/i.test(t) && t.length < 60) {
        console.log(path.join(dir, f), "::", el.outerHTML, "|| parent:", el.parentElement.outerHTML.slice(0, 400));
      }
    }
  }
}
