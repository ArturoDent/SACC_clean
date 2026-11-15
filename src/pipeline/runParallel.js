// @ts-check
import { spawn } from "node:child_process";
import os from "node:os";

// Cleaning is CPU-bound and every file is independent, so a batch run spawns
// one child process per file (the same CLI script, given a single stem) with
// as many running at once as there are cores. Each child's stdout is buffered
// and printed in one piece when it finishes, so step logs do not interleave.
// Returns the number of children that exited non-zero.
//
// Set SACC_SERIAL=1 to keep everything in this process (handy for profiling).
export const runStemsInParallel = async (scriptPath, stems, { concurrency = os.availableParallelism() } = {}) => {
  const queue = [...stems];
  let failures = 0;

  const worker = async () => {
    while (queue.length) {
      const stem = queue.shift();
      const { code, stdout, stderr } = await runChild(scriptPath, stem);
      process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (code !== 0) failures++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, stems.length) }, worker));
  return failures;
};

const runChild = (scriptPath, stem) => new Promise((resolve) => {
  const child = spawn(process.execPath, [scriptPath, stem], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (err) => resolve({ code: 1, stdout, stderr: `${ stderr }${ err.message }\n` }));
  child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
});
