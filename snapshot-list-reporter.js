import fs from "fs";
import path from "path";

export default class SnapshotListReporter {
  async onEnd(result) {

    const suffix = process.env.TEST_FILE ?? "clean1";
    const reportDir = path.join(process.cwd(), "playwright-report", suffix);
    const indexPath = path.join(reportDir, "index.html");

    // Wait until index.html exists AND stops changing
    let lastSize = -1;
    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(indexPath)) {
        const size = fs.statSync(indexPath).size;
        if (size === lastSize) break; // stable
        lastSize = size;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Find newest test-results folder
    const testResultsRoot = path.join(process.cwd(), "test-results");


    console.log("Checking test-results:", testResultsRoot, fs.existsSync(testResultsRoot));

    if (!fs.existsSync(testResultsRoot)) {
      console.log("EXIT: test-results folder does not exist");
      return;
    }

    console.log("Found test-results folder:", fs.readdirSync(testResultsRoot));


    // if (!fs.existsSync(testResultsRoot)) return;

    const dirs = fs.readdirSync(testResultsRoot)
      .map(name => ({
        name,
        time: fs.statSync(path.join(testResultsRoot, name)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);



    // if (dirs.length === 0) return;
    if (dirs.length === 0) {
      console.log("EXIT: No test result subfolders found");
      return;
    }


    const runDirName = dirs[0].name;
    console.log("Using run folder:", runDirName);
    const runDir = path.join(testResultsRoot, runDirName);

    // Collect actual + diff PNGs from this run
    const runPngs = fs.readdirSync(runDir).filter(f => f.endsWith(".png"));

    // Baseline directory
    const baselineDir = path.join(
      process.cwd(),
      "tests",
      "visual-compare.spec.js-snapshots"
    );

    // Baselines used in this run
    const baselinePngs = fs.existsSync(baselineDir)
      ? fs.readdirSync(baselineDir).filter(b =>
        runPngs.some(r => r.startsWith(b.replace(".png", "")))
      )
      : [];

    // Group by prefix
    const groups = {};

    function add(prefix, file, type) {
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push({ file, type });
    }

    for (const file of baselinePngs) {
      const prefix = file.split("-chromium")[0];
      add(prefix, file, "baseline");
    }

    for (const file of runPngs) {
      const prefix = file.split("-chromium")[0];
      if (file.includes("-actual")) add(prefix, file, "actual");
      if (file.includes("-diff")) add(prefix, file, "diff");
    }

    // Build snapshots.html
    let html = `
      <html>
      <head>
        <title>Snapshot Images</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          h2 { margin-top: 40px; }
          img { max-width: 400px; border: 1px solid #ccc; margin: 10px; }
          .row { display: flex; gap: 20px; flex-wrap: wrap; }
          .item { margin-bottom: 20px; }
          .type { font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <h1>Snapshot Images (Baseline / Actual / Diff)</h1>
    `;

    for (const prefix of Object.keys(groups).sort()) {
      html += `<h2>${ prefix }</h2><div class="row">`;

      for (const entry of groups[prefix]) {
        const { file, type } = entry;

        const src =
          type === "baseline"
            ? `../tests/visual-compare.spec.ts-snapshots/${ file }`
            : `../test-results/${ runDirName }/${ file }`;

        html += `
          <div class="item">
            <a href="${ src }">
              <img src="${ src }" />
            </a>
            <div>${ file }</div>
            <div class="type">${ type }</div>
          </div>
        `;
      }

      html += `</div>`;
    }

    html += `</body></html>`;

    fs.writeFileSync(path.join(reportDir, "snapshots.html"), html);

    // Inject link and Test-Steps collapse script into index.html
    if (fs.existsSync(indexPath)) {
      let indexHtml = fs.readFileSync(indexPath, "utf8");

      if (!indexHtml.includes("snapshots.html")) {
        indexHtml = indexHtml.replace(
          "<body>",
          `<body><div style="padding:10px;"><a href="snapshots.html" style="font-size:18px;">View Snapshot Gallery</a></div>`
        );
      }

      if (!indexHtml.includes("chip-header-collapse")) {
        // Hide the Test Steps chip-body using CSS — safer than JS clicks which
        // interfere with React's event system. The title attribute is stable across
        // Playwright versions; chip-body is the direct sibling of chip-header.
        const collapseStyle = `
<style id="chip-header-collapse">
  .chip-header[title="Test Steps"] + .chip-body { display: none !important; }
</style>`;
        indexHtml = indexHtml.replace("</head>", collapseStyle + "\n</head>");
      }

      fs.writeFileSync(indexPath, indexHtml);
    }
  }
}
