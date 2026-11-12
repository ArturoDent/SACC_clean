// @ts-check
import { serializeAndWriteClean } from "./writeClean.js";


import { readFile, writeFile } from "node:fs/promises";
import * as jsdom from "jsdom";

const { JSDOM } = jsdom;

// TODO: make this its own module
const ensureStylesheet = (document) => {
  if (document.querySelector('link[rel="stylesheet"][href="../css/styles.css"]')) return;

  const stylesheet = document.createElement("link");
  stylesheet.setAttribute("rel", "stylesheet");
  stylesheet.setAttribute("href", "../css/styles.css");
  document.head.appendChild(stylesheet);
};

// const createDom = (html) => {
//   const virtualConsole = new jsdom.VirtualConsole();
//   virtualConsole.on("jsdomError", (error) => {
//     // if (error.type !== "css-parsing") console.warn(error.message);
//     if (error.cause !== "css-parsing") console.warn(error.message);  // TODO: check this
//   });

//   return new JSDOM(html, { virtualConsole });
// };

const createDom = (html) => {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on("jsdomError", (/** @type {any} */ error) => {
    if (error.type !== "css-parsing") console.warn(error.message);
  });

  return new JSDOM(html, {
    virtualConsole,
    contentType: "text/html"
  });
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

  const { nestingResult } = await serializeAndWriteClean(dom, outputFile);
  results.push({
    name: "normalizeSpanNestingOrder",
    status: "fulfilled",
    value: nestingResult,
    message: `Step normalizeSpanNestingOrder (post-merge) succeeded: ${ nestingResult.message }`
  });

  return {
    outputFile,
    results,
  };
};