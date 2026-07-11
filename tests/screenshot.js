// One-off helper to screenshot a local HTML file for visual inspection.
// Usage: node tests/screenshot.js <path-to-html> [output.png]
import { chromium } from "@playwright/test";
import path from "path";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath) {
  console.error("Usage: node tests/screenshot.js <path-to-html> [output.png]");
  process.exit(1);
}

const out = outputPath ?? "tests/screenshot.png";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + path.resolve(inputPath));
await page.waitForLoadState("domcontentloaded");
await page.setViewportSize({ width: 1280, height: 2000 });
await page.screenshot({ path: out });
await browser.close();

console.log(`Wrote ${ out }`);
