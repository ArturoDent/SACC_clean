// @ts-check
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadLocalHtml(page, filePath) {
  await page.goto("file://" + path.resolve(filePath));
  await page.waitForLoadState("domcontentloaded");
}

// Part 1 is "SACCBaseline.htm" (no number); parts 2-11 are "SACCBaselineNN.htm"
// (zero-padded) — matching the live site's own naming, same as src/index.js.
/** @param {number} n */
const baselineFileName = (n) => n === 1 ? "SACCBaseline.htm" : `SACCBaseline${ String(n).padStart(2, "0") }.htm`;

const testFiles = (process.env.TEST_FILE ?? "SACC4").split(",");

for (const stem of testFiles) {
  const match = stem.match(/(\d+)$/);
  if (!match) continue;

  const partNum = parseInt(match[1], 10);
  const nextPartNum = partNum + 1;
  const cleanPath = path.join(__dirname, `../clean/baseline/${ baselineFileName(partNum) }`);

  test.describe(stem, () => {
    test("has thisPart starting with correct Part number", async ({ page }) => {
      await loadLocalHtml(page, cleanPath);
      const el = page.locator("#thisPart");
      await expect(el).toBeAttached();
      const text = (await el.textContent() ?? "").trim();
      expect(text).toMatch(new RegExp(`^Part\\s+${ partNum }\\.`));
    });

    test("has nextPart starting with incremented Part number", async ({ page }) => {
      await loadLocalHtml(page, cleanPath);
      const el = page.locator("#nextPart");
      await expect(el).toBeAttached();
      const text = (await el.textContent() ?? "").trim();
      expect(text).toMatch(new RegExp(`^Part\\s+${ nextPartNum }\\.`));
    });
  });
}
