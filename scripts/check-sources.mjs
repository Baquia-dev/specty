// SPDX-License-Identifier: Apache-2.0
// Checks every source and test file: the SPDX header (ADR 0008) and its size (AGENTS.md). The
// size counts lines of code only, without blank lines or comments. Past the warning line it asks
// for a look, not a split; past the error line it fails. What is generated or is data is not sized.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HEADER = "// SPDX-License-Identifier: Apache-2.0";
/** Lines of code: a warning past `warn`, an error past `fail`. Tests are long by nature. */
const LIMITS = { source: { warn: 300, fail: 500 }, test: { warn: 400, fail: 600 } };
const ROOTS = ["packages", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const SKIPPED = ["node_modules", "dist", "coverage", "fixtures"];
/** Not written by hand, or data rather than logic: generated code, migrations, texts, samples. */
const UNSIZED = [
  /\.(?:g|freezed|generated)\.[^/]+$/,
  /(?:^|\/)(?:migrations|i18n|locales|mocks|__mocks__|__fixtures__)\//,
  /(?:^|\/)messages\.[a-z]{2}\.[^/]+$/,
  /(?:^|\/)sample-[^/]+$/,
];
const TEST = /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[^/]+$/;

const files = ROOTS.flatMap((root) =>
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => EXTENSIONS.some((extension) => path.endsWith(extension)))
    .filter((path) => !path.split(/[\\/]/).some((segment) => SKIPPED.includes(segment)))
    .map((path) => join(root, path).replaceAll("\\", "/")),
);

/** Lines with code: blank lines, `//` lines and `/* … *\/` blocks that start a line do not count. */
function codeLines(text) {
  let inComment = false;
  let count = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (inComment) {
      inComment = !line.includes("*/");
    } else if (line.startsWith("/*")) {
      inComment = !line.includes("*/");
    } else if (line !== "" && !line.startsWith("//")) {
      count += 1;
    }
  }
  return count;
}

const errors = [];
const warnings = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!text.startsWith(HEADER)) errors.push(`${file}: missing "${HEADER}"`);
  if (UNSIZED.some((pattern) => pattern.test(file))) continue;
  const { warn, fail } = TEST.test(file) ? LIMITS.test : LIMITS.source;
  const lines = codeLines(text);
  if (lines > fail) {
    errors.push(`${file}: ${lines} lines of code (max ${fail}); split it by responsibility.`);
  } else if (lines > warn) {
    warnings.push(
      `${file}: ${lines} lines of code (warning past ${warn}, error past ${fail}). If it mixes responsibilities, propose how to split it; never split it just to meet the number.`,
    );
  }
}

if (warnings.length > 0) console.warn(warnings.map((warning) => `  ${warning}`).join("\n"));
if (errors.length > 0) {
  console.error(errors.map((error) => `  ${error}`).join("\n"));
  process.exit(1);
}
console.log(
  `Sources OK (${files.length} files: SPDX header, ≤ ${LIMITS.source.fail} lines of code, ${warnings.length} warnings).`,
);
