// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, cli, inWorktree, NOW, person } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** The messages waiting for the session of change `id`, in the order they came. */
async function waiting(root: string, id: string): Promise<Record<string, unknown>[]> {
  const folder = join(root, ".git/common/specty/messages", id);
  const names = (await readdir(folder).catch(() => [])).filter((name) => name.endsWith(".json"));
  const texts = await Promise.all(names.sort().map((name) => readFile(join(folder, name), "utf8")));
  return texts.map((text) => JSON.parse(text));
}

describe("specty message", () => {
  it("AC1: leaves the message for the session of an open change, with who left it and when", async () => {
    const { root } = await inWorktree();
    const left = await cli(root, ["message", CHANGE, "Ya cambié la API de lock.ts."], CLAUDE);
    expect(left.code).toBe(0);
    expect(left.out).toContain(
      `Mensaje dejado para la sesión de ${CHANGE}: le llegará tras su siguiente comando en la carpeta del cambio.`,
    );
    expect(left.out).toContain("«Ya cambié la API de lock.ts.»");
    const fromPerson = await cli(root, ["message", CHANGE, "Para cuando acabes."], {
      terminal: person(),
    });
    expect(fromPerson.code).toBe(0);
    const [agent, human] = await waiting(root, CHANGE);
    expect(agent).toMatchObject({
      text: "Ya cambié la API de lock.ts.",
      at: NOW.toISOString(),
      from: { actor: "agent", tool: "claude-code" },
    });
    expect(agent).toMatchObject({ from: { folder: expect.stringContaining(basename(root)) } });
    expect(human).toMatchObject({ text: "Para cuando acabes.", from: { actor: "human" } });
    expect(human?.from).not.toHaveProperty("tool");
  });

  it("AC3: leaves nothing with an empty text or for a change that is not open", async () => {
    const { root } = await inWorktree();
    const empty = await cli(root, ["message", CHANGE, "   "], CLAUDE);
    expect(empty.code).not.toBe(0);
    expect(empty.out).toContain("El mensaje está vacío.");
    const none = await cli(root, ["message", "20261103-nada", "Hola."], CLAUDE);
    expect(none.code).not.toBe(0);
    expect(none.out).toContain(
      "No hay ningún cambio abierto 20261103-nada: un mensaje es para la sesión de un cambio abierto.",
    );
    expect(await waiting(root, CHANGE)).toEqual([]);
    expect(await waiting(root, "20261103-nada")).toEqual([]);
  });
});
