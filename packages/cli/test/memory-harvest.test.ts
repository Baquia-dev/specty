// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  person,
  read,
  SPEC_PATH,
  tempRepo,
  toAcceptance,
  writeFiles,
} from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** SPEC's change, in its own folder, closed with `followUps` under «### Pendientes». */
async function closedWith(root: string, followUps: readonly string[]): Promise<void> {
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  const folder = folderOf(root);
  await toAcceptance(folder);
  await cli(folder, ["accept"], { terminal: person() });
  const pending = followUps.map((item) => `- ${item}\n`).join("");
  const closing = `\n## Cierre\n\n### Resumen\n\nSaludo listo.\n\n### Pendientes\n\n${pending}`;
  await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
  expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
  expect((await cli(folder, ["close"], { terminal: person() })).code).toBe(0);
}

describe("the follow-ups of a closing", () => {
  it("AC1: become open pending items of the memory, with the change as their origin", async () => {
    const root = await tempRepo(APP);
    await closedWith(root, ["Ordenar por fecha.", "Exportar a CSV."]);
    const listed = (await cli(root, ["memory"])).out;
    expect(listed).toContain(`P1 · pendiente · Ordenar por fecha. — ${CHANGE}, la persona, `);
    expect(listed).toContain(`P2 · pendiente · Exportar a CSV. — ${CHANGE}, la persona, `);
    // AC1: the card with no active change does not list them.
    expect((await cli(root, ["next"])).out).not.toContain("Ordenar por fecha.");
  });

  it("AC2: are not added again when they cite an entry, say there are none or repeat an open one", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["memory", "add", "Uno"], CLAUDE)).code).toBe(0);
    await closedWith(root, ["P1: sigue abierto.", "Uno", "Ninguno.", "Nuevo."]);
    const listed = (await cli(root, ["memory"])).out;
    expect(listed).toContain("P1 · pendiente · Uno");
    expect(listed).toContain(`P2 · pendiente · Nuevo. — ${CHANGE}`);
    expect(listed).not.toContain("P3 ·");
  });

  it("AC3: are not added when they say there are none, also with more after it", async () => {
    const root = await tempRepo(APP);
    await closedWith(root, [
      "Ninguno nuevo. C6 hará que el servidor dé solo los abiertos.",
      "No hay.",
      "None.",
      "Nuevo.",
    ]);
    const listed = (await cli(root, ["memory"])).out;
    expect(listed).toContain(`P1 · pendiente · Nuevo. — ${CHANGE}`);
    expect(listed).not.toContain("P2 ·");
  });
});
