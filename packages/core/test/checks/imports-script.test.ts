// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type ScriptProject, scriptImports } from "../../src";

const PROJECT: ScriptProject = {
  files: new Set([
    "src/a.ts",
    "src/b.tsx",
    "src/lib/index.ts",
    "src/util.js",
    "packages/core/src/index.ts",
    "packages/core/src/light.ts",
    "packages/ui/src/main.ts",
  ]),
  packages: [
    {
      name: "@demo/core",
      entries: { ".": "packages/core/src/index.ts", "./light": "packages/core/src/light.ts" },
    },
    { name: "demo-ui", entries: { ".": "packages/ui/src/main.ts" } },
  ],
};

describe("the imports of TypeScript and JavaScript", () => {
  it("AC2: reads every form of import and resolves each to its file, in order", () => {
    const text = [
      'import { a } from "./a";',
      'import type { B } from "./b.js";',
      'import "./lib";',
      'export * from "./util.js";',
      'export { x } from "@demo/core";',
      "const light = await import('@demo/core/light');",
      'const ui = require("demo-ui");',
      'import zod from "zod";',
      'import { gone } from "./missing";',
    ].join("\n");
    const from = "src/main.ts";
    expect(scriptImports(from, text, PROJECT)).toEqual([
      { from, specifier: "./a", line: 1, target: "src/a.ts" },
      { from, specifier: "./b.js", line: 2, target: "src/b.tsx" },
      { from, specifier: "./lib", line: 3, target: "src/lib/index.ts" },
      { from, specifier: "./util.js", line: 4, target: "src/util.js" },
      { from, specifier: "@demo/core", line: 5, target: "packages/core/src/index.ts" },
      { from, specifier: "@demo/core/light", line: 6, target: "packages/core/src/light.ts" },
      { from, specifier: "demo-ui", line: 7, target: "packages/ui/src/main.ts" },
      { from, specifier: "zod", line: 8, package: "zod" },
    ]);
  });

  it("AC2: resolves a path that goes up, and an import over several lines from its first", () => {
    const text = 'const x = 1;\nimport {\n  a,\n  b,\n} from "../a";\n';
    expect(scriptImports("src/deep/x.ts", text, PROJECT)).toEqual([
      { from: "src/deep/x.ts", specifier: "../a", line: 2, target: "src/a.ts" },
    ]);
  });
});
