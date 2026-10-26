// SPDX-License-Identifier: Apache-2.0
// Checks that every source and test file starts with the SPDX header (ADR 0008), and that the CLI
// asks core for the texts the agent and the person see instead of writing its own (ARCHITECTURE
// §6). The size of the files is Specty's to watch, in `task done`, for any language (ARCHITECTURE §7).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HEADER = "// SPDX-License-Identifier: Apache-2.0";
const ROOTS = ["packages", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const SKIPPED = ["node_modules", "dist", "coverage", "fixtures"];
/** The CLI's code, which gets every text from core (`packages/core/src/cards`). */
const CLI = "packages/cli/src/";
/** What still writes its own texts, until they move to core: `specty check`'s. */
const TEXTS_PENDING = ["packages/cli/src/check/", "packages/cli/src/commands/check.ts"];
const TRANSLATOR = /\btranslator\b/;

const files = ROOTS.flatMap((root) =>
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => EXTENSIONS.some((extension) => path.endsWith(extension)))
    .filter((path) => !path.split(/[\\/]/).some((segment) => SKIPPED.includes(segment)))
    .map((path) => join(root, path).replaceAll("\\", "/")),
);

const missing = files
  .filter((file) => !readFileSync(file, "utf8").startsWith(HEADER))
  .map((file) => `  ${file}: missing "${HEADER}"`);
const translated = files
  .filter((file) => file.startsWith(CLI))
  .filter((file) => !TEXTS_PENDING.some((pending) => file.startsWith(pending)))
  .filter((file) => TRANSLATOR.test(readFileSync(file, "utf8")))
  .map(
    (file) =>
      `  ${file}: its texts belong in packages/core/src/cards; ask core for them instead of using the translator`,
  );
const problems = [...missing, ...translated];
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Sources OK (${files.length} files: SPDX header).`);
