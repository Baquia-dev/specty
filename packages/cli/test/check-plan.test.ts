// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** `secrets` stays off, whatever scanners the machine has. */
const CHECKS = "checks:\n  levels: { secrets: off }\n";

/** A repository on the branch of SPEC's change, approved, with T1 active. */
async function approvedChange(config = CONFIG()): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${config}${CHECKS}` });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(root, ["next"]);
  return root;
}

interface CheckJson {
  readonly id: string;
  readonly status: string;
  readonly findings: readonly { readonly path?: string; readonly message: string }[];
}

/** The plan checks of a `--json` run, by id. */
async function planChecks(root: string, ...args: string[]): Promise<Record<string, CheckJson>> {
  const run = await cli(root, ["--json", "check", ...args]);
  const checks: CheckJson[] = JSON.parse(run.out).checks;
  return Object.fromEntries(
    checks
      .filter((check) => ["spec-approved", "scope"].includes(check.id))
      .map((check) => [check.id, check]),
  );
}

describe("specty check --spec", () => {
  it("passes on the approved spec of the active change and a diff within its scope", async () => {
    const root = await approvedChange();
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      "src/app.test.ts": "it('greets', () => {});\n",
      // Not in Files: a test of src/app.ts enters the scope by itself.
      "src/__tests__/greet.test.ts": "it('greets', () => {});\n",
    });
    const checks = await planChecks(root, "--spec");
    expect(checks["spec-approved"]?.status).toBe("passed");
    expect(checks.scope?.status).toBe("passed");
    expect(Object.keys(await planChecks(root))).toEqual([]);
  });

  it("lists every file outside the scope, but not an approved extension", async () => {
    const root = await approvedChange();
    await writeFiles(root, { "src/extra.ts": "export const x = 1;\n", "lib/other.ts": "1\n" });
    const requested = await cli(root, [
      "scope",
      "add",
      "src/extra.ts",
      "--task",
      "T1",
      "--reason",
      "helper",
    ]);
    expect(requested.code).toBe(0);
    expect((await cli(root, ["approve", "--scope", "S1"], { terminal: person() })).code).toBe(0);
    const run = await cli(root, ["check", "--spec", CHANGE]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      ["FALLA scope", "  lib/other.ts fuera del alcance de la spec"].join("\n"),
    );
    expect(run.out).not.toContain("src/extra.ts");
  });

  it("fails when the spec changed since its approval, is not approved or does not exist", async () => {
    const root = await approvedChange();
    await writeFiles(root, {
      [SPEC_PATH]: (await read(root, SPEC_PATH)).replace(
        "La app saluda por nombre.",
        "La app saluda por nombre y apellido.",
      ),
    });
    const changed = await planChecks(root, "--spec");
    expect(changed["spec-approved"]).toMatchObject({
      status: "failed",
      findings: [{ message: `La spec de ${CHANGE} cambió desde su aprobación (revisión 1)` }],
    });
    const draft = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await cli(draft, ["new", "Saludo personalizado"]);
    expect((await planChecks(draft, "--spec"))["spec-approved"]?.findings).toEqual([
      { message: `La spec de ${CHANGE} no está aprobada` },
    ]);
    expect((await planChecks(draft, "--spec", "20200101-nada"))["spec-approved"]?.findings).toEqual(
      [{ message: "No hay un cambio 20200101-nada" }],
    );
  });

  it("keeps the approval through the closing, and speaks English", async () => {
    const root = await approvedChange(CONFIG().replace("language: es", "language: en"));
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
    expect((await planChecks(root, "--spec"))["spec-approved"]?.status).toBe("passed");
    await writeFiles(root, { "lib/other.ts": "1\n" });
    expect((await cli(root, ["check", "--spec"])).out).toContain(
      "  lib/other.ts outside the scope of the spec",
    );
  });

  it("refuses --spec with --all, which has no diff of the change", async () => {
    const root = await approvedChange();
    const run = await cli(root, ["check", "--all", "--spec"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      "--spec mira el diff del cambio: úsalo con --changed (por defecto) o con --staged, no con --all.",
    );
  });
});
