// @ts-check
import fs from "node:fs/promises";
import { formatHtmlString } from "../../../src/formatting/vscodeHtmlFormatter.js";

export const RESULT_DIR = "experiments/rosterMissingLinks/result";

/**
 * @param {import("jsdom").JSDOM} dom
 * @param {string} outputFile
 */
export async function writeResult(dom, outputFile) {
  await fs.mkdir(RESULT_DIR, { recursive: true });
  const outputPath = `${ RESULT_DIR }/${ outputFile }`;
  const html = formatHtmlString(dom.serialize(), `file://${ outputPath }`, {
    tabSize: 2,
    insertSpaces: true,
    wrapLineLength: 120,
  });
  await fs.writeFile(outputPath, html, "utf8");
}
