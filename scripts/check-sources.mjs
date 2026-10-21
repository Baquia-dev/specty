// SPDX-License-Identifier: Apache-2.0
// Checks every source and test file: SPDX header (ADR 0008) and at most 300 lines (AGENTS.md).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HEADER = "// SPDX-License-Identifier: Apache-2.0";
const MAX_LINES = 300;
const ROOTS = ["packages", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const SKIPPED = ["node_modules", "dist", "coverage", "fixtures"];

const files = ROOTS.flatMap((root) =>
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => EXTENSIONS.some((extension) => path.endsWith(extension)))
    .filter((path) => !path.split(/[\\/]/).some((segment) => SKIPPED.includes(segment)))
    .map((path) => join(root, path)),
);

const problems = files.flatMap((file) => {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  return [
    ...(text.startsWith(HEADER) ? [] : [`${file}: missing "${HEADER}"`]),
    ...(lines > MAX_LINES
      ? [`${file}: ${lines} lines (max ${MAX_LINES}); split it by responsibility`]
      : []),
  ];
});

if (problems.length > 0) {
  console.error(problems.map((problem) => `  ${problem}`).join("\n"));
  process.exit(1);
}
console.log(`Sources OK (${files.length} files: SPDX header, ≤ ${MAX_LINES} lines).`);
