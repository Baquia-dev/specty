// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, folderOf, tempRepo } from "./support";

/** Vitest and Biome at the root, neither excluding what Specty writes. */
const TOOLS = {
  "vitest.config.ts": 'export default { test: { include: ["src/**/*.test.ts"] } };\n',
  "biome.json": '{ "files": { "includes": ["**"] } }\n',
};

/** The same tools, excluding it. */
const EXCLUDED = {
  "vitest.config.ts":
    'export default { test: { exclude: ["**/node_modules/**", "**/.worktrees/**"] } };\n',
  "biome.json": '{ "files": { "includes": ["**", "!.specty", "!.claude", "!.worktrees"] } }\n',
};

const TITLE = "HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY:";
const FIX = 'new "Las herramientas no ven lo que escribe Specty"';
const seen = (name: string, path: string, add: string, file: string) =>
  `${name} también revisa ${path}, que escribe Specty: añade ${add} en ${file}.`;
const VITEST = seen(
  "Vitest",
  ".worktrees/",
  '"**/.worktrees/**"',
  "vitest.config.ts (test.exclude)",
);

/** A project with `files` where `new` already made a change in `.worktrees/`. */
async function withChange(files: Readonly<Record<string, string>>) {
  const root = await tempRepo({ ...APP, ...files });
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  return root;
}

const lastLine = (out: string) => out.trimEnd().split("\n").at(-1);

describe("next and init name the tools that see what Specty writes", () => {
  it("AC1: next with no active change lists each tool, what to add and how to fix it, keeping its SIGUIENTE", async () => {
    const root = await withChange(TOOLS);
    const next = await cli(root, ["next"]);
    expect(next.code).toBe(0);
    expect(next.out).toContain(TITLE);
    expect(next.out).toContain(VITEST);
    expect(next.out).toContain(
      seen("Biome", ".specty/", '"!.specty"', "biome.json (files.includes)"),
    );
    expect(next.out).toContain(
      seen("Biome", ".worktrees/", '"!.worktrees"', "biome.json (files.includes)"),
    );
    expect(next.out).toContain(FIX);
    const clean = await withChange(EXCLUDED);
    expect(lastLine(next.out)).toBe(lastLine((await cli(clean, ["next"])).out));
  });

  it("AC2: next adds no block when every tool excludes it, nor in the folder of an active change", async () => {
    const clean = await withChange(EXCLUDED);
    const next = await cli(clean, ["next"]);
    expect(next.code).toBe(0);
    expect(next.out).not.toContain(TITLE);

    const root = await withChange(TOOLS);
    const inChange = await cli(folderOf(root), ["next"]);
    expect(inChange.code).toBe(0);
    expect(inChange.out).not.toContain(TITLE);
  });

  it("AC3: init names the tools that will see .worktrees/ before any change, unless changes do not go there", async () => {
    const INIT = ["init", "--language", "es", "--tools", "claude-code"];
    const root = await tempRepo({ "src/app.ts": "x\n", ...TOOLS });
    const init = await cli(root, INIT);
    expect(init.code).toBe(0);
    expect(init.out).toContain(TITLE);
    expect(init.out).toContain(VITEST);
    expect(init.out).toContain(
      seen("Biome", ".worktrees/", '"!.worktrees"', "biome.json (files.includes)"),
    );
    expect(init.out).toContain("Se corrige en un cambio, como cualquier otro");

    const without = await tempRepo({
      "src/app.ts": "x\n",
      ".specty/config.yaml": CONFIG(),
      ...TOOLS,
    });
    const plain = await cli(without, INIT);
    expect(plain.code).toBe(0);
    expect(plain.out).not.toContain("también revisa .worktrees/");
  });
});
