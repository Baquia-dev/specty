// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { cli, folderOf, person, read, tempRepo, writeFiles } from "./support";

/** A manifest the detection reads: a test command, and lint and typecheck for the full one. */
const MANIFEST = JSON.stringify({
  name: "app",
  scripts: { test: "vitest run", lint: "biome check .", typecheck: "tsc" },
});

const NO_TESTS = "No se detectó un comando de tests";

/** A repository that started empty: `init` found nothing to verify with. */
async function started(): Promise<string> {
  const root = await tempRepo({ "README.md": "# App\n" });
  const first = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
  expect(first.out).toContain(NO_TESTS);
  expect(parse(await read(root, ".specty/config.yaml")).verify).toEqual({ timeoutSec: 600 });
  return root;
}

describe("init on an existing configuration", () => {
  it("adds the verification the detection now finds, and keeps the rest (AC1)", async () => {
    const root = await started();
    const before = await read(root, ".specty/config.yaml");
    await writeFiles(root, { "package.json": MANIFEST });
    const planned = await cli(root, ["init", "--dry-run"]);
    expect(planned.out).toContain("cambiar .specty/config.yaml");
    const again = await cli(root, ["init"]);
    expect(again.out).toContain(
      ".specty/config.yaml: añadido verify.default (`npm test`) y verify.full (`npm run lint && npm run typecheck && npm test`); lo demás no se tocó.",
    );
    expect(again.out).not.toContain(NO_TESTS);
    const after = await read(root, ".specty/config.yaml");
    // Every line that was there stays, comments included; only the new keys are added.
    for (const line of before.split("\n")) expect(after).toContain(line);
    expect(parse(after).verify).toEqual({
      timeoutSec: 600,
      default: "npm test",
      full: "npm run lint && npm run typecheck && npm test",
    });
  });

  it("never changes a value that is there, and warns only without any test command (AC2, AC3)", async () => {
    const root = await started();
    const own = `${await read(root, ".specty/config.yaml")}`.replace(
      "verify:\n",
      'verify:\n  default: "make test"\n',
    );
    await writeFiles(root, { ".specty/config.yaml": own });
    const quiet = await cli(root, ["init"]);
    expect(quiet.out).toContain(".specty/config.yaml ya existía; no se tocó.");
    expect(quiet.out).not.toContain(NO_TESTS);
    await writeFiles(root, { "package.json": MANIFEST });
    const added = await cli(root, ["init"]);
    expect(added.out).toContain(".specty/config.yaml: añadido verify.full (");
    expect(parse(await read(root, ".specty/config.yaml")).verify.default).toBe("make test");
  });

  it("is what closing proposes once the change created the project (AC4)", async () => {
    const root = await started();
    // In a project that started empty, the first change is its skeleton: a standard one.
    const created = await cli(root, ["new", "Esqueleto"]);
    const id = /SPECTY · (\S+) · draft/.exec(created.out)?.[1] ?? "";
    const folder = folderOf(root, id);
    const path = `.specty/changes/${id}/spec.md`;
    const spec = [
      "---\nkind: standard\n---\n\n# Esqueleto\n\n## Objetivo\n\nEl manifiesto del proyecto.\n",
      "## Fuera de alcance\n\n- Ninguno\n",
      "## Supuestos\n\n- A1: El proyecto usa npm.\n",
      "## Criterios de aceptación\n\n- AC1: CUANDO se instala ENTONCES hay scripts.\n",
      "## Archivos\n\n- crear package.json — scripts del proyecto\n",
      // A manifest is a build task: under init's contract it has no testing phase.
      '## Tareas\n\n- [ ] T1: Manifiesto\n  - files: package.json\n  - ac: AC1\n  - verify: "true"\n  - type: build\n',
    ].join("\n");
    await writeFiles(folder, { [path]: spec });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await cli(folder, ["next"]);
    await writeFiles(folder, { "package.json": MANIFEST });
    expect((await cli(folder, ["task", "done", "T1", "--summary", "Manifiesto"])).code).toBe(0);
    await cli(folder, ["accept"], { terminal: person() });
    const closing = "\n## Cierre\n\n### Resumen\n\nEl manifiesto.\n";
    await writeFiles(folder, { [path]: `${await read(folder, path)}${closing}` });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.out).toContain(
      `Specty detecta ahora verify.default (\`npm test\`) y verify.full (\`npm run lint && npm run typecheck && npm test\`), que .specty/config.yaml no tiene: \`specty init\` en ${root} lo añade.`,
    );
    expect((await cli(root, ["init"])).out).toContain(
      ".specty/config.yaml: añadido verify.default",
    );
    // With the verification in place, there is nothing left to add.
    expect((await cli(root, ["init"])).out).toContain(
      ".specty/config.yaml ya existía; no se tocó.",
    );
  });

  it("adds a verify block at the end when the file has none (AC1)", async () => {
    const root = await started();
    const own = '# Mi configuración\nversion: 1\nlanguage: es\ngoverned: ["src/**"]\n';
    await writeFiles(root, { ".specty/config.yaml": own, "package.json": MANIFEST });
    await cli(root, ["init"]);
    expect(await read(root, ".specty/config.yaml")).toBe(
      `${own}verify:\n  default: "npm test"\n  full: "npm run lint && npm run typecheck && npm test"\n`,
    );
  });
});
