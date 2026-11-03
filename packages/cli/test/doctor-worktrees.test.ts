// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo, writeFiles } from "./support";

/** A project with each JavaScript tool configured at its root, none excluding `.worktrees/`. */
const TOOLS = {
  "vitest.config.ts": 'export default { test: { include: ["src/**/*.test.ts"] } };\n',
  "eslint.config.mjs": 'export default [{ files: ["**/*.js"] }];\n',
  "biome.json": '{ "files": { "includes": ["**", "!.specty"] } }\n',
  "package.json": '{ "name": "x", "jest": { "testEnvironment": "node" } }\n',
};

const seen = (name: string, add: string, file: string) =>
  `${name} también revisa .worktrees/, que escribe Specty: añade ${add} en ${file}.`;

/** The doctor of a project where `new` already made a change in `.worktrees/`. */
async function doctorWith(files: Readonly<Record<string, string>>) {
  const root = await tempRepo({ ...APP, ...files });
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  return { root, doctor: await cli(root, ["doctor"]) };
}

describe("doctor and the JavaScript tools that would see the changes' worktrees", () => {
  it("AC1: names each tool at the root that does not exclude .worktrees/, with what to add", async () => {
    const { doctor } = await doctorWith(TOOLS);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      seen("Vitest", '"**/.worktrees/**"', "vitest.config.ts (test.exclude)"),
    );
    expect(doctor.out).toContain(
      seen(
        "Jest",
        '"<rootDir>/.worktrees/"',
        "package.json (jest.testPathIgnorePatterns, jest.modulePathIgnorePatterns)",
      ),
    );
    expect(doctor.out).toContain(seen("ESLint", '".worktrees/"', "eslint.config.mjs (ignores)"));
    expect(doctor.out).toContain(seen("Biome", '"!.worktrees"', "biome.json (files.includes)"));
  });

  it("AC2: says each excludes it once it does, or reads .gitignore", async () => {
    const { root } = await doctorWith(TOOLS);
    await writeFiles(root, {
      "vitest.config.ts":
        'export default { test: { exclude: ["**/node_modules/**", "**/.worktrees/**"] } };\n',
      "eslint.config.mjs": 'export default [{ ignores: [".worktrees/"] }];\n',
      "biome.json": '{ "files": { "includes": ["**", "!.specty", "!.worktrees"] } }\n',
      "package.json":
        '{ "name": "x", "jest": { "testPathIgnorePatterns": ["<rootDir>/.worktrees/"], "modulePathIgnorePatterns": ["<rootDir>/.worktrees/"] } }\n',
    });
    const doctor = await cli(root, ["doctor"]);
    for (const name of ["Vitest", "Jest", "ESLint", "Biome"]) {
      expect(doctor.out).toContain(`${name} excluye .worktrees/.`);
    }
    expect(doctor.out).not.toContain("también revisa .worktrees/");

    // Biome with git's ignore file, and Prettier, read .gitignore.
    const { root: other } = await doctorWith({
      "biome.json":
        '{ "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }, "files": { "includes": ["**", "!.specty"] } }\n',
      ".prettierrc": "{}\n",
      ".prettierignore": ".specty/\n",
      ".gitignore": "/.worktrees/\n",
    });
    const read = await cli(other, ["doctor"]);
    expect(read.out).toContain("Biome excluye .worktrees/.");
    expect(read.out).toContain("Prettier excluye .worktrees/.");
  });

  it("AC3: says nothing of .worktrees/ before any change lives there", async () => {
    const root = await tempRepo({ ...APP, ...TOOLS });
    const doctor = await cli(root, ["doctor"]);
    // The path of the `specty` it runs may hold `.worktrees/`: only its own lines count.
    expect(doctor.out).not.toContain("también revisa .worktrees/");
    expect(doctor.out).not.toContain("excluye .worktrees/");
  });
});
