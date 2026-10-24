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

async function implementing(config = CONFIG(), spec = SPEC): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: spec });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person() });
  await cli(root, ["next"]);
  return root;
}

describe("human decisions", () => {
  it("rejects a scope request with a reason the agent can read", async () => {
    const root = await implementing();
    await cli(root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
    expect((await cli(root, ["reject", "--scope", "S1"])).code).toBe(2);
    const rejected = await cli(root, ["reject", "--scope", "S1"], {
      terminal: person({ ask: ["Usa src/app.ts"] }),
    });
    expect(rejected.out).toContain("S1 rechazada.");
    expect(await read(root, `.specty/changes/${CHANGE}/audit.jsonl`)).toContain(
      '"reason":"Usa src/app.ts"',
    );
    expect((await cli(root, ["reject", "--scope", "S9"], { terminal: person() })).out).toContain(
      "No existe la solicitud S9",
    );
  });

  it("approves test files automatically and reports paths already in scope", async () => {
    const root = await implementing();
    expect(
      (await cli(root, ["scope", "add", "other/helper.test.ts", "--reason", "Prueba"])).out,
    ).toContain("Ampliación aprobada por la política");
    expect((await cli(root, ["scope", "add", "src/app.ts", "--reason", "x"])).out).toContain(
      "ya están dentro del alcance",
    );
    expect((await cli(root, ["scope", "add", "../fuera.ts", "--reason", "x"])).code).toBe(1);
    expect((await cli(root, ["scope", "add", "src/b.ts"])).code).toBe(1);
  });

  /** SPEC with two more files in Files, both planned for T2: one plain, one sensitive. */
  const PLANNED = SPEC.replace(
    "- crear src/app.test.ts — prueba",
    "- crear src/app.test.ts — prueba\n- crear src/greeting.ts — texto\n- crear src/auth/name.ts — nombre",
  ).replace(
    "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
    "  - files: src/app.ts, src/greeting.ts, src/auth/name.ts\n  - ac: AC1\n  - type: refactor",
  );

  it("approves files the spec already plans, never sensitive ones (AC1, AC2, AC3, AC4)", async () => {
    const root = await implementing(CONFIG(), PLANNED);
    const added = await cli(root, [
      "scope",
      "add",
      "src/greeting.ts",
      "--reason",
      "Lo necesito ya",
    ]);
    expect(added.out).toContain(
      "Ampliación aprobada por la política: src/greeting.ts (ya en Archivos, prevista para T2).",
    );
    expect(await read(root, `.specty/changes/${CHANGE}/audit.jsonl`)).toContain(
      '"basis":{"src/greeting.ts":"planned"},"plannedFor":{"src/greeting.ts":["T2"]}',
    );
    const sensitive = await cli(root, ["scope", "add", "src/auth/name.ts", "--reason", "x"]);
    expect(sensitive.out).toContain("approve --scope S1");
    const unplanned = await cli(root, ["scope", "add", "src/other.ts", "--reason", "x"]);
    expect(unplanned.out).toContain("approve --scope S2");
  });

  it("asks a person for planned files when the policy is none (AC2)", async () => {
    const root = await implementing(`${CONFIG()}scope:\n  autoApprove: none\n`, PLANNED);
    const added = await cli(root, ["scope", "add", "src/greeting.ts", "--reason", "x"]);
    expect(added.out).toContain("approve --scope S1");
  });

  it("cancels a change and archives it", async () => {
    const root = await implementing();
    expect((await cli(root, ["cancel"])).code).toBe(2);
    const cancelled = await cli(root, ["cancel"], {
      terminal: person({ ask: ["Ya no hace falta"] }),
    });
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    expect(cancelled.out).toContain(
      `La rama specty/${CHANGE} guarda la spec y su registro; no se incorpora.`,
    );
    expect(cancelled.out).toContain('SIGUIENTE: para otro cambio, `specty new "<título>"`.');
    expect(cancelled.out).not.toContain("fusiona");
    expect(await exists(`${root}/${ARCHIVE}/${CHANGE}/state.json`)).toBe(true);
    expect((await cli(root, ["cancel"], { terminal: person() })).out).toContain(
      "No hay nada pendiente",
    );
  });

  it("warns that the branch of a cancelled change keeps the code of its done tasks", async () => {
    const root = await implementing();
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    const cancelled = await cli(root, ["cancel", "--reason", "Otro enfoque"], {
      terminal: person(),
    });
    expect(cancelled.out).toContain(
      `La rama specty/${CHANGE} guarda la spec, su registro y el código de las tareas hechas; no se incorpora, porque llevaría ese código a medias.`,
    );
    expect(cancelled.out).not.toContain("fusiona");
  });

  it("runs the full verification before accepting, and can be declined", async () => {
    const root = await implementing(`${CONFIG()}  full: "echo completo && false"\n`);
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    await writeFiles(root, { "src/app.ts": "2\n" });
    await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    const declined = await cli(root, ["accept"], { terminal: person({ confirm: [true, false] }) });
    expect(declined.out).toContain("Nada cambió.");
    const audit = (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`)).trim().split("\n");
    expect(JSON.parse(audit.at(-1) ?? "{}")).toMatchObject({
      actor: "specty",
      event: "change.verified",
      data: {
        cmd: "echo completo && false",
        exit: 1,
        ms: expect.any(Number),
        outputTail: ["completo"],
      },
    });
    expect((await cli(root, ["close"], { terminal: person() })).out).toContain(
      "No hay nada pendiente",
    );
    const accepted = await cli(root, ["accept"], { terminal: person({ confirm: [false, true] }) });
    expect(accepted.out).toContain("Resultado aceptado");
  });

  it("only accepts, closes or approves what is waiting", async () => {
    const root = await tempRepo({ ".specty/config.yaml": CONFIG() });
    expect((await cli(root, ["accept"], { terminal: person() })).out).toContain(
      "Ningún cambio espera `accept`.",
    );
    await cli(root, ["new", "Algo"]);
    expect((await cli(root, ["approve"], { terminal: person() })).out).toContain(
      "No hay nada pendiente de `approve`",
    );
    expect((await cli(root, ["approve", "--scope", "S1"], { terminal: person() })).out).toContain(
      "No hay nada pendiente",
    );
  });
});

describe("agent commands outside their phase", () => {
  it("explain what to do instead", async () => {
    const root = await tempRepo({ ".specty/config.yaml": CONFIG() });
    expect((await cli(root, ["propose"])).code).toBe(2);
    expect((await cli(root, ["task", "done", "T1", "--summary", "x"])).code).toBe(2);
    expect((await cli(root, ["adjust", "Algo"])).code).toBe(2);
    expect((await cli(root, ["new", "x", "--kind", "enorme"])).code).toBe(1);
    expect((await cli(root, ["new", " "])).code).toBe(1);
    const root2 = await implementing();
    expect((await cli(root2, ["adjust", "Algo"])).out).toContain(
      "Los ajustes se piden cuando el resultado está en aceptación",
    );
    expect((await cli(root2, ["adjust", " "])).code).toBe(1);
    expect((await cli(root2, ["task", "done", "T2", "--summary", "x"])).out).toContain(
      "T2 no es la tarea activa",
    );
    expect((await cli(root2, ["task", "done", "T1"])).code).toBe(1);
    expect((await cli(root2, ["propose"])).out).toContain(
      "En la fase implementing la spec no se propone",
    );
  });

  it("show open changes and who they wait for", async () => {
    const root = await implementing();
    await cli(root, ["scope", "add", "lib/x.ts", "--reason", "x"]);
    const status = await cli(root, ["status"]);
    expect(status.out).toContain(
      `▸ ${CHANGE} · standard · implementing · espera a ti · alcance: S1`,
    );
    expect(status.out).toContain("`specty approve --scope <S>`");
  });

  it("report an invalid configuration", async () => {
    const root = await tempRepo({ ".specty/config.yaml": "version: 1\ncolor: azul\n" });
    const result = await cli(root, ["next"]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("corrige .specty/config.yaml");
  });
});

describe("retro", () => {
  it("needs staged code and only one retro at a time", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    expect((await cli(root, ["retro"])).out).toContain("No hay código gobernado preparado");
    await writeFiles(root, { "src/app.ts": "y\n" });
    git(root, "add", "src/app.ts");
    expect((await cli(root, ["retro"])).code).toBe(0);
    expect((await cli(root, ["retro"])).out).toContain("Ya hay una retro en curso");
  });

  it("lets a person document a change in one line when minimal mode is on", async () => {
    const config = `${CONFIG()}retro:\n  mode: minimal\n`;
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": config });
    await writeFiles(root, { "src/app.ts": "y\n" });
    git(root, "add", "src/app.ts");
    expect((await cli(root, ["retro", "--minimal"])).code).toBe(2);
    const done = await cli(root, ["retro", "--minimal"], {
      terminal: person({ ask: ["Ajuste pedido en la demo"] }),
    });
    expect(done.out).toContain("vuelve a ejecutar `git commit`");
    expect(git(root, "diff", "--cached", "--name-only")).toContain("spec.md");
  });
});
