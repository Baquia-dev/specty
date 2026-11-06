// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cli,
  inWorktree,
  person,
  read,
  SPEC_PATH,
  stateIn,
  toAcceptance,
  writeFiles,
} from "./support";

const CLOSING = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
const WRITE_FIRST = "SIGUIENTE: modo delegado: escribe tú el cierre antes de aceptar";
const SENT =
  "SIGUIENTE: modo delegado: acepta tú el resultado con `specty accept`: con el cierre ya enviado";

/** SPEC's change in acceptance, in its own folder, with delegated mode on or off. */
async function inAcceptance(delegated: boolean) {
  const { root, folder } = await inWorktree();
  await toAcceptance(folder);
  if (delegated) {
    const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(on.code).toBe(0);
  }
  return { root, folder };
}

/** The guard's answer to the agent writing the change's spec: 0 lets it through, 2 blocks it. */
async function writeSpec(folder: string): Promise<number> {
  const event = {
    cwd: folder,
    tool_name: "Write",
    tool_input: { file_path: join(folder, SPEC_PATH) },
  };
  return (await cli(folder, ["guard", "--tool", "claude-code"], { stdin: JSON.stringify(event) }))
    .code;
}

/** Adds `closing` to the change's spec and runs `propose`. */
async function sendClosing(folder: string, closing = CLOSING) {
  await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
  return cli(folder, ["propose"]);
}

describe("the closing sent in acceptance, in delegated mode", () => {
  it("AC1: the card asks for it first, the guard lets the agent write it and propose sends it in acceptance", async () => {
    const { folder } = await inAcceptance(true);
    const next = await cli(folder, ["next"]);
    expect(next.out).toContain("CÓMO CERRAR:");
    expect(next.out).toContain(WRITE_FIRST);
    expect(await writeSpec(folder)).toBe(0);
    // A change outside the Closing is refused, and nothing is sent.
    const approved = await read(folder, SPEC_PATH);
    await writeFiles(folder, {
      [SPEC_PATH]: `${approved.replace("La app saluda por nombre.", "La app saluda.")}${CLOSING}`,
    });
    const outside = await cli(folder, ["propose"]);
    expect(outside.out).toContain("ERRORES:");
    expect(await stateIn(folder)).not.toHaveProperty("closingSubmittedAt");
    // Only the closing: sent, and the change stays in acceptance.
    await writeFiles(folder, { [SPEC_PATH]: approved });
    const sent = await sendClosing(folder);
    expect(sent.code).toBe(0);
    expect(sent.out).toContain("Cierre válido.");
    expect(sent.out).toContain(SENT);
    expect(await stateIn(folder)).toMatchObject({
      phase: "acceptance",
      closingSubmittedAt: expect.any(String),
    });
    expect((await cli(folder, ["next"])).out).toContain(SENT);
  });

  it("AC5: without delegated mode, the spec stays locked and propose sends nothing", async () => {
    const { folder } = await inAcceptance(false);
    expect(await writeSpec(folder)).toBe(2);
    const sent = await sendClosing(folder);
    expect(sent.out).not.toContain("Cierre válido.");
    const state = await stateIn(folder);
    expect(state.phase).toBe("acceptance");
    expect(state).not.toHaveProperty("closingSubmittedAt");
  });

  it("AC5: with the closing sent and delegated mode off, the person accepts into closing and closes it", async () => {
    const { root, folder } = await inAcceptance(true);
    expect((await sendClosing(folder)).out).toContain("Cierre válido.");
    expect((await cli(root, ["delegate", "off"], { terminal: person() })).code).toBe(0);
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("Resultado aceptado");
    expect(await stateIn(folder)).toMatchObject({
      phase: "closing",
      closingSubmittedAt: expect.any(String),
    });
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Cambio cerrado y archivado");
  });

  it("AC7: an adjustment drops the closing sent, and back in acceptance the card asks for it again", async () => {
    const { folder } = await inAcceptance(true);
    expect((await sendClosing(folder)).out).toContain("Cierre válido.");
    expect((await cli(folder, ["adjust", "Saluda también en inglés"])).code).toBe(0);
    // In adjusting the spec takes no Closing: the agent takes it out and adds the new task.
    const spec = await read(folder, SPEC_PATH);
    const task = "- [ ] T3: Saludo en inglés\n  - files: src/app.ts\n  - ac: AC1\n";
    await writeFiles(folder, {
      [SPEC_PATH]: `${spec.slice(0, spec.indexOf("\n## Cierre"))}${task}`,
    });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    expect(await stateIn(folder)).not.toHaveProperty("closingSubmittedAt");
    const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    await cli(folder, ["next"]);
    await writeFiles(folder, { "src/app.ts": "3\n" });
    expect((await cli(folder, ["task", "done", "T3", "--summary", "Tres"])).code).toBe(0);
    const next = await cli(folder, ["next"]);
    expect(next.out).toContain("CÓMO CERRAR:");
    expect(next.out).toContain(WRITE_FIRST);
  });
});
