// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, git, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

/** A repository on the branch of SPEC's change, approved, with `checks` as given. */
async function approved(checks: string, config = CONFIG()): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${config}${checks}` });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  expect((await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) })).code).toBe(
    0,
  );
  return root;
}

const ON = "checks:\n  preCommit: true\n  levels: { secrets: off }\n";

describe("specty check in the pre-commit hook", () => {
  it("blocks a manual change that does not pass specty check --staged", async () => {
    const root = await approved(ON);
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    git(root, "add", "src/app.ts");
    const run = await cli(root, ["hook", "pre-commit"]);
    expect(run.code).toBe(1);
    expect(run.err).toContain("specty: el commit no pasa `specty check --staged`:");
    expect(run.err).toContain(`FALLA todo\n  src/app.ts:2 ${TODO} sin referencia a un issue`);
  });

  it("lets through a manual change that passes, and runs nothing when it is off", async () => {
    const root = await approved(ON);
    await writeFiles(root, { "src/app.ts": "export const greet = () => 'buenas';\n" });
    git(root, "add", "src/app.ts");
    expect(await cli(root, ["hook", "pre-commit"])).toMatchObject({ code: 0, err: "" });
    const off = await approved("checks:\n  levels: { secrets: off }\n");
    await writeFiles(off, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    git(off, "add", "src/app.ts");
    expect((await cli(off, ["hook", "pre-commit"])).code).toBe(0);
  });

  it("runs nothing for what is outside the governed paths", async () => {
    const root = await tempRepo({ "README.md": "x\n", ".specty/config.yaml": `${CONFIG()}${ON}` });
    await writeFiles(root, { "README.md": `// ${TODO}: y\n` });
    git(root, "add", "README.md");
    expect((await cli(root, ["hook", "pre-commit"])).code).toBe(0);
  });

  it("says it in English", async () => {
    const root = await approved(ON, CONFIG().replace("language: es", "language: en"));
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    git(root, "add", "src/app.ts");
    const run = await cli(root, ["hook", "pre-commit"]);
    expect(run.err).toContain("specty: the commit does not pass `specty check --staged`:");
    expect(run.err).toContain(`FAIL todo\n  src/app.ts:2 ${TODO} without an issue reference`);
  });
});
