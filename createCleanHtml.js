import { addTaxonomyLevels } from "./src/helpers/levelClasses.js";

import { readFile, writeFile } from "node:fs/promises";
import * as jsdom from "jsdom";
import prettier from "prettier";

const { JSDOM } = jsdom;

// TODO: make this its own module
const ensureStylesheet = (document) => {
  if (document.querySelector('link[rel="stylesheet"][href="../css/styles.css"]')) return;

  const stylesheet = document.createElement("link");
  stylesheet.setAttribute("rel", "stylesheet");
  stylesheet.setAttribute("href", "../css/styles.css");
  document.head.appendChild(stylesheet);
};

const createDom = (html) => {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    // if (error.type !== "css-parsing") console.warn(error.message);
    if (error.cause !== "css-parsing") console.warn(error.message);  // TODO: check this
  });

  return new JSDOM(html, { virtualConsole });
};

export const createCleanHtml = async ({ sourceFile, outputFile, cleanupSteps }) => {

  const html = await readFile(sourceFile, "utf8");
  const dom = createDom(html);
  const { document } = dom.window;

  const results = [];

  // ensureStylesheet(document);

  for (const cleanupStep of cleanupSteps) {
    try {
      const value = await cleanupStep(document);
      results.push({
        name: cleanupStep.name || "anonymous",
        status: "fulfilled",
        value,
        message: `Step ${ cleanupStep.name || "anonymous" } succeeded: ${ value.message }`
      });
    }
    catch (err) {
      const reason =
        err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      results.push({
        name: cleanupStep.name || "anonymous",
        status: "rejected",
        reason,
        error: err,
        message: `Step ${ cleanupStep.name || "anonymous" } failed: ${ reason }`
      });
      // optionally: throw err to abort
    }
  }

  await addTaxonomyLevels(dom.window.document);

  await serializeAndWriteClean(dom, outputFile);

  return {
    outputFile,
    results,
  };
};


/**
 * Serialize a JSDOM instance and write cleaned HTML to disk.
 * @param {import("jsdom").JSDOM} dom
 * @param {string} outputPath
 */
export async function serializeAndWriteClean(dom, outputPath) {
  try {
    // 1) serialize once
    let html = dom.serialize();

    // 2) optional: collapse excessive blank lines BEFORE formatting
    // (or after formatting if you prefer to remove blank lines introduced by formatter)
    if (typeof collapseBlankLinesInHtml === "function") {
      html = collapseBlankLinesInHtml(html);
    }

    // 3) format in-memory with js-beautify
    // @ts-ignore
    // const formatted = beautify.html(html, {
    //   indent_size: 2,
    //   wrap_line_length: 120,
    //   preserve_newlines: true,
    //   max_preserve_newlines: 2,
    //   end_with_newline: true
    // });

    // const config = await prettier.resolveConfig(filePath);
    // const formatted = await prettier.format(html, {
    //   parser: "html", // or "babel-ts" / "typescript" depending on file
    //   filepath: outputPath
    // });

    const formatted = await prettier.format(html, {
      parser: "html",
      printWidth: 120,            // default 80 → increase to avoid wrapping
      singleAttributePerLine: false,
      htmlWhitespaceSensitivity: "ignore", // or "ignore" if you want even looser handling
      filepath: outputPath
    });


    // 4) write formatted HTML to disk (single write)
    await writeFile(outputPath, formatted, "utf8");
    console.log("Wrote formatted HTML to", outputPath);

  } catch (err) {
    console.error("serializeAndWriteClean failed:", err);
    throw err;
  }
}


/**
 * Collapse multiple blank lines between paragraphs in an HTML string.
 * Keeps exactly one empty line between </p> and <p>.
 * Also collapses any 3+ blank lines anywhere to two newlines as a conservative fallback.
 *
 * @param {string} html
 * @returns {string}
 */
function collapseBlankLinesInHtml(html) {
  // collapse whitespace/newlines/tabs between </p> and <p> to exactly one blank line
  html = html.replace(/<\/p>\s*(?:\r?\n[ \t]*)+<p>/g, "</p>\n\n<p>");
  // global conservative fallback: collapse 3+ blank lines anywhere to two newlines
  // html = html.replace(/(\r?\n\s*){3,}/g, "\n\n");
  return html;
}
