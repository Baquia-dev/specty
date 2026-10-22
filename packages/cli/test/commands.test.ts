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

async function implementing(config = CONFIG()): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
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

  it("cancels a change and archives it", async () => {
    const root = await implementing();
    expect((await cli(root, ["cancel"])).code).toBe(2);
    const cancelled = await cli(root, ["cancel"], {
      terminal: person({ ask: ["Ya no hace falta"] }),
    });
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    expect(await exists(`${root}/${ARCHIVE}/${CHANGE}/state.json`)).toBe(true);
    expect((await cli(root, ["cancel"], { terminal: person() })).out).toContain(
      "No hay nada pendiente",
    );
  });

  it("runs the full verification before accepting, and can be declined", async () => {
    const root = await implementing(`${CONFIG()}  full: "echo completo && false"\n`);
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    await writeFiles(root, { "src/app.ts": "2\n" });
    await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    const declined = await cli(root, ["accept"], { terminal: person({ confirm: [true, false] }) });
    expect(declined.out).toContain("Nada cambió.");
    expect((await cli(root, ["close"], { terminal: person() })).out).toContain(
      "No hay nada pendiente",
    );
    const accepted = await cli(root, ["accept"], { terminal: person({ confirm: [false, true] }) });
    expect(accepted.out).toContain("Resultado aceptado");
  });

  it("only accepts, closes or approves what is waiting", async () => {
    const root = await tempRepo({ ".specty/config.yaml": CONFIG() });
    expect((await cli(root, ["accept"], { terminal: person() })).out).toContain(
      "No hay un cambio activo.",
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
