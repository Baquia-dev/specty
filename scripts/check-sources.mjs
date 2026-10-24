// SPDX-License-Identifier: Apache-2.0
// Checks that every source and test file starts with the SPDX header (ADR 0008). The size of the
// files is Specty's to watch, in `task done`, for any language (ARCHITECTURE §7).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HEADER = "// SPDX-License-Identifier: Apache-2.0";
const ROOTS = ["packages", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const SKIPPED = ["node_modules", "dist", "coverage", "fixtures"];

const files = ROOTS.flatMap((root) =>
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => EXTENSIONS.some((extension) => path.endsWith(extension)))
    .filter((path) => !path.split(/[\\/]/).some((segment) => SKIPPED.includes(segment)))
    .map((path) => join(root, path).replaceAll("\\", "/")),
);

const missing = files.filter((file) => !readFileSync(file, "utf8").startsWith(HEADER));
if (missing.length > 0) {
  console.error(missing.map((file) => `  ${file}: missing "${HEADER}"`).join("\n"));
  process.exit(1);
}
console.log(`Sources OK (${files.length} files: SPDX header).`);
