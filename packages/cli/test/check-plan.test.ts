// SPDX-License-Identifier: Apache-2.0
import { rm } from "node:fs/promises";
import { join } from "node:path";
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

const ENGLISH = CONFIG().replace("language: es", "language: en");

/** SPEC with T1 as a fix. */
const FIX_SPEC = SPEC.replace("  - ac: AC1\n- [ ] T2", "  - ac: AC1\n  - type: fix\n- [ ] T2");

/** SPEC allowing `zod` and anything of `@angular`. */
const DEPENDENCIES_SPEC = SPEC.replace(
  "kind: standard\n",
  'kind: standard\nallowedDependencies: [zod, "@angular/*"]\n',
);

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * A repository with `files` on main, on the branch of the change of `spec` (SPEC's by default),
 * approved, with T1 active.
 */
async function approvedChange(
  options: { config?: string; spec?: string; files?: Readonly<Record<string, string>> } = {},
): Promise<string> {
  const root = await tempRepo({
    ...APP,
    ...options.files,
    ".specty/config.yaml": `${options.config ?? CONFIG()}${CHECKS}`,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: options.spec ?? SPEC });
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

const PLAN_CHECKS = ["spec-approved", "scope", "fix-tests", "tests-removed", "dependencies"];

/** The plan checks of a `--json` run, by id. */
async function planChecks(root: string, ...args: string[]): Promise<Record<string, CheckJson>> {
  const run = await cli(root, ["--json", "check", ...args]);
  const checks: CheckJson[] = JSON.parse(run.out).checks;
  return Object.fromEntries(
    checks.filter((check) => PLAN_CHECKS.includes(check.id)).map((check) => [check.id, check]),
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
    const root = await approvedChange({ config: ENGLISH });
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
    expect((await planChecks(root, "--spec"))["spec-approved"]?.status).toBe("passed");
    await writeFiles(root, { "lib/other.ts": "1\n" });
    expect((await cli(root, ["check", "--spec"])).out).toContain(
      "  lib/other.ts outside the scope of the spec",
    );
  });

  it("fails on a fix with none of its tests in the diff, but not --staged once it is done", async () => {
    const root = await approvedChange({ spec: FIX_SPEC });
    await writeFiles(root, { "src/app.ts": "export const greet = () => 'Hola';\n" });
    const active = await cli(root, ["check", "--spec"]);
    expect(active.code).toBe(1);
    expect(active.out).toContain(
      "FALLA fix-tests\n  T1 es un fix y el diff no trae ningún test suyo",
    );
    expect((await cli(root, ["task", "done", "T1", "--summary", "Saludo"])).code).toBe(0);
    expect((await planChecks(root, "--spec"))["fix-tests"]?.status).toBe("failed");
    expect((await planChecks(root, "--staged", "--spec"))["fix-tests"]?.status).toBe("passed");
    await writeFiles(root, { "src/app.test.ts": "it('greets', () => {});\n" });
    expect((await planChecks(root, "--spec"))["fix-tests"]?.status).toBe("passed");
  });

  it("warns, without failing, when the diff deletes a test or leaves one with fewer cases", async () => {
    const cases = (count: number) =>
      Array.from({ length: count }, (_, index) => `it('case ${index}', () => {});\n`).join("");
    const root = await approvedChange({
      files: {
        "src/app.test.ts": cases(3),
        "src/one.test.ts": cases(2),
        "src/old.test.ts": cases(1),
      },
    });
    await writeFiles(root, { "src/app.test.ts": cases(1), "src/one.test.ts": cases(1) });
    await rm(join(root, "src/old.test.ts"));
    const run = await cli(root, ["check", "--spec"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      [
        "AVISO tests-removed",
        "  src/app.test.ts 2 casos menos (de 3 a 1)",
        "  src/old.test.ts test borrado",
        "  src/one.test.ts 1 caso menos (de 2 a 1)",
      ].join("\n"),
    );
    await writeFiles(root, { ".specty/config.yaml": `${ENGLISH}${CHECKS}` });
    const english = await cli(root, ["check", "--spec"]);
    expect(english.out).toContain("  src/app.test.ts 2 fewer cases (from 3 to 1)");
    expect(english.out).toContain("  src/old.test.ts test deleted");
    expect(english.out).toContain("  src/one.test.ts 1 fewer case (from 2 to 1)");
  });

  it("fails on each dependency a manifest gains that the spec does not allow", async () => {
    const root = await approvedChange({
      spec: DEPENDENCIES_SPEC,
      files: {
        "package.json": json({ name: "app", dependencies: { react: "18" } }),
        "app/pubspec.yaml": "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n",
      },
    });
    await writeFiles(root, {
      "package.json": json({
        name: "app",
        dependencies: { react: "19", zod: "4", lodash: "4", "@angular/core": "22" },
      }),
      "app/pubspec.yaml": [
        "name: app",
        "dependencies:",
        "  flutter:",
        "    sdk: flutter",
        "  http: ^1.2.0",
        "dev_dependencies:",
        "  flutter_test:",
        "    sdk: flutter",
        "",
      ].join("\n"),
    });
    const run = await cli(root, ["check", "--spec"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      [
        "FALLA dependencies",
        "  app/pubspec.yaml:5 dependencia nueva sin permiso en la spec: http",
        "  package.json:6 dependencia nueva sin permiso en la spec: lodash",
      ].join("\n"),
    );
    await writeFiles(root, { ".specty/config.yaml": `${ENGLISH}${CHECKS}` });
    expect((await cli(root, ["check", "--spec"])).out).toContain(
      "  package.json:6 new dependency not allowed by the spec: lodash",
    );
  });

  it("tells the agent drafting a spec to name the dependencies it will add", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await cli(root, ["new", "Saludo personalizado"]);
    expect((await cli(root, ["next"])).out).toContain(
      "Si el cambio añade dependencias a un manifiesto, nómbralas en `allowedDependencies` del frontmatter",
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
