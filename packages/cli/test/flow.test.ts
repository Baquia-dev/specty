// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

async function approvedRepo(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG(),
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  return root;
}

describe("a standard change from request to closing", () => {
  it("drafts, validates and waits for a person's approval", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    expect((await cli(root, ["next"])).out).toContain("No hay un cambio activo.");
    const created = await cli(root, ["new", "Saludo personalizado"]);
    expect(created.out).toContain(`Cambio creado: ${CHANGE} (rama specty/${CHANGE}).`);
    expect(git(root, "branch", "--show-current")).toBe(`specty/${CHANGE}`);
    const empty = await cli(root, ["propose"]);
    expect(empty.code).toBe(1);
    expect(empty.out).toContain("ERRORES:");
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.code).toBe(0);
    expect(proposed.out).toContain("SPEC VÁLIDA · tamaño S");
    expect(proposed.out).toContain(`SPECTY · ${CHANGE} · review · revisión 1`);
    const byAgent = await cli(root, ["approve"]);
    expect(byAgent.code).toBe(2);
    expect(byAgent.out).toContain("lo ejecuta una persona en su terminal");
  });

  it("asks the person about high-impact assumptions before approving", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    const rejected = await cli(root, ["approve"], {
      terminal: person({ choose: ["reject"], ask: ["El nombre viene de la config"] }),
    });
    expect(rejected.out).toContain("Rechazaste A1");
    const next = await cli(root, ["next"]);
    expect(next.out).toContain(
      "A1 «El nombre llega como argumento.» — El nombre viene de la config",
    );
    await writeFiles(root, {
      [SPEC_PATH]: SPEC.replace("llega como argumento", "viene de la configuración"),
    });
    await cli(root, ["propose"]);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.out).toContain("Revisión 2 aprobada (commit");
    expect(git(root, "log", "-1", "--format=%s")).toBe("docs(spec): Saludo personalizado");
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Change,valueonly)")).toBe(CHANGE);
  });

  it("implements task by task, inside the scope, with one commit per task", async () => {
    const root = await approvedRepo();
    expect((await cli(root, ["next"])).out).toContain("TAREA T1: Saludar por nombre");
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      "src/other.ts": "x\n",
    });
    const outside = await cli(root, ["task", "done", "T1", "--summary", "Saludo"]);
    expect(outside.code).toBe(2);
    expect(outside.out).toContain("FUERA DEL ALCANCE DE T1:\n  src/other.ts");
    const requested = await cli(root, ["scope", "add", "src/other.ts", "--reason", "Ayudante"]);
    expect(requested.out).toContain("SOLICITUD S1:\n  src/other.ts");
    expect((await cli(root, ["task", "done", "T1", "--summary", "Saludo"])).out).toContain(
      "espera la decisión sobre S1",
    );
    expect((await cli(root, ["approve", "--scope", "S1"], { terminal: person() })).out).toContain(
      "S1 aprobada",
    );
    await writeFiles(root, { "src/app.test.ts": "test\n" });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Saludo por nombre"]);
    expect(done.code).toBe(0);
    expect(done.out).toContain("T1 completada: commit");
    expect(done.out).toContain("TAREA T2: Mensaje por defecto");
    expect(git(root, "log", "-1", "--format=%s")).toBe("feat(src): Saludar por nombre");
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Task,valueonly)")).toBe("T1");
    // Only T2's start is pending: it travels with T2's commit.
    expect(git(root, "diff", "--name-only", "HEAD").split("\n")).toEqual([
      `.specty/changes/${CHANGE}/audit.jsonl`,
      `.specty/changes/${CHANGE}/state.json`,
    ]);
    expect(await read(root, SPEC_PATH)).toContain("- [x] T1: Saludar por nombre");
  });

  it("refuses to complete a task whose verification fails", async () => {
    const root = await approvedRepo();
    await cli(root, ["next"]);
    await writeFiles(root, {
      ".specty/config.yaml": CONFIG("echo roto && false"),
      "src/app.ts": "y\n",
    });
    const failed = await cli(root, ["task", "done", "T1", "--summary", "x"]);
    expect(failed.code).toBe(2);
    expect(failed.out).toContain("VERIFICACIÓN FALLIDA: echo roto && false (código 1)");
    expect(failed.out).toContain("roto");
  });

  it("accepts, adjusts, closes and archives", async () => {
    const root = await approvedRepo();
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    await writeFiles(root, { "src/app.ts": "2\n" });
    const last = await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    expect(last.out).toContain(`SPECTY · ${CHANGE} · acceptance`);
    const adjusted = await cli(root, ["adjust", "Que el saludo use mayúsculas"]);
    expect(adjusted.out).toContain("PETICIÓN:\n  Que el saludo use mayúsculas");
    const extra = "- [ ] T3: Mayúsculas\n  - files: src/app.ts\n  - ac: AC1\n  - type: fix\n";
    await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${extra}` });
    const reproposed = await cli(root, ["propose"]);
    expect(reproposed.out).toContain("CAMBIOS RESPECTO A LO APROBADO:\n  T3: añadido");
    await cli(root, ["approve"], { terminal: person() });
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "3\n" });
    expect((await cli(root, ["task", "done", "T3", "--summary", "Tres"])).out).toContain(
      "acceptance",
    );
    expect((await cli(root, ["accept"], { terminal: person() })).out).toContain(
      "el agente redactará el cierre",
    );
    expect((await cli(root, ["next"])).out).toContain("CÓMO CERRAR:");
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
    expect((await cli(root, ["propose"])).out).toContain("Cierre válido.");
    const closed = await cli(root, ["close"], { terminal: person() });
    expect(closed.out).toContain("Cambio cerrado y archivado");
    expect(await exists(`${root}/${ARCHIVE}/${CHANGE}/state.json`)).toBe(true);
    expect(await exists(`${root}/.specty/changes/${CHANGE}`)).toBe(false);
    expect(git(root, "status", "--porcelain")).toBe("");
    // Incorporated into main, where this folder went back: there is no change here any more.
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect((await cli(root, ["next"])).out).toContain("No hay un cambio activo.");
    git(root, "switch", "-q", `specty/${CHANGE}`);
    expect((await cli(root, ["next"])).out).toContain("El cambio está cerrado.");
  });

  it("goes back to acceptance when an adjustment is withdrawn (AC1)", async () => {
    const root = await approvedRepo();
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    await writeFiles(root, { "src/app.ts": "2\n" });
    await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    await cli(root, ["adjust", "Algo que al final no se hará"]);
    // Nothing added to the spec: proposed as it was and approved again, with every task done.
    expect((await cli(root, ["propose"])).code).toBe(0);
    const approved = await cli(root, ["approve"], { terminal: person() });
    expect(approved.out).toContain(`SPECTY · ${CHANGE} · acceptance`);
    expect((await cli(root, ["accept"], { terminal: person() })).out).toContain(
      "el agente redactará el cierre",
    );
  });
});

describe("the quick lane", () => {
  it("goes from a one-task spec to an archived change", async () => {
    const root = await tempRepo({ "src/button.ts": "Sing in\n", ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "Corregir botón", "--kind", "quick"]);
    // Ids start with the date of the commands' clock, like CHANGE.
    const id = `${CHANGE.slice(0, 8)}-corregir-boton`;
    await writeFiles(root, {
      [`.specty/changes/${id}/spec.md`]:
        "---\nkind: quick\n---\n\n# Corregir botón\n\n## Objetivo\n\nDice «Sing in».\n\n## Archivos\n\n- modificar src/button.ts — texto\n\n## Tareas\n\n- [ ] T1: Corregir texto\n  - files: src/button.ts\n  - type: fix\n",
    });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await cli(root, ["approve"], { terminal: person() });
    await cli(root, ["next"]);
    await writeFiles(root, { "src/button.ts": "Sign in\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Texto corregido"]);
    const accepted = await cli(root, ["accept"], { terminal: person() });
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(await read(root, `${ARCHIVE}/${id}/spec.md`)).toContain("Texto corregido");
  });
});

describe("guard rails", () => {
  it("will not start a second change or ignore uncommitted code", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    await writeFiles(root, { "src/app.ts": "changed\n" });
    const dirty = await cli(root, ["new", "Otra cosa"]);
    expect(dirty.code).toBe(2);
    expect(dirty.out).toContain("CAMBIOS SIN SPEC:\n  src/app.ts");
    git(root, "checkout", "--", "src/app.ts");
    await cli(root, ["new", "Primero"]);
    expect((await cli(root, ["new", "Segundo"])).out).toContain("Ya hay un cambio en curso");
  });

  it("explains how to start when Specty is not set up", async () => {
    const root = await tempRepo({ "a.txt": "x\n" });
    const result = await cli(root, ["next"]);
    expect(result.code).toBe(2);
    expect(result.out).toContain("specty init");
  });

  it("speaks JSON when asked", async () => {
    const root = await tempRepo({ ".specty/config.yaml": CONFIG() });
    const result = await cli(root, ["--json", "status"]);
    expect(JSON.parse(result.out)).toMatchObject({ status: "ok", exitCode: 0 });
  });
});
