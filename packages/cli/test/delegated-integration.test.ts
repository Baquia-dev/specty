// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CHANGE, cli, git, inWorktree, person, toClosing, writeFiles } from "./support";

/** A change ready to close in its worktree, with delegated mode on and main conflicting. */
async function delegatedConflict() {
  const { root, folder } = await inWorktree();
  const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  expect(on.code).toBe(0);
  await toClosing(folder);
  await writeFiles(root, { "src/app.ts": "main\n" });
  git(root, "commit", "-q", "-am", "main cambia el saludo");
  return { root, folder };
}

const RESOLVE =
  "SIGUIENTE: modo delegado: resuélvela tú (`specty next` te dice qué falta), termínala con `specty integrate` y vuelve a ejecutar `specty close`.";

describe("the incorporation in delegated mode", () => {
  it("asks the agent itself to resolve it and close again (AC1, AC2)", async () => {
    const { folder } = await delegatedConflict();
    // The agent closes for the person: no terminal, delegated mode.
    const closed = await cli(folder, ["close"]);
    expect(closed.code).toBe(2);
    expect(closed.out).toContain("el merge queda en esta carpeta para que lo resuelva el agente");
    expect(closed.out).toContain(RESOLVE);
    expect(closed.out).not.toContain("dile a tu agente");
    const waiting = await cli(folder, ["close"]);
    expect(waiting.out).toContain("El agente aún resuelve la incorporación de main");
    expect(waiting.out).toContain(RESOLVE);
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const integrated = await cli(folder, ["integrate"]);
    expect(integrated.code).toBe(0);
    expect(integrated.out).toContain(
      "SIGUIENTE: modo delegado: vuelve a ejecutar tú `specty close` y sigue su salida.",
    );
    expect(integrated.out).not.toContain("pide al usuario");
  });

  it("removes the folder an agent closes from inside once merged, and tells it to leave", async () => {
    const { root, folder } = await inWorktree();
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    await toClosing(folder);
    const closed = await cli(folder, ["close"]);
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).toContain(
      `La carpeta ${folder} se eliminó y la rama specty/${CHANGE} queda; sigue en ${root}.`,
    );
    expect(closed.out).toContain(
      `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y sigue en ${root}; para otro cambio, \`specty new "<título>"\`.`,
    );
    expect(await exists(folder)).toBe(false);
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", `specty/${CHANGE}`));
  });

  it("keeps a folder it cannot remove, and still tells the agent to leave it", async () => {
    const { root, folder } = await inWorktree();
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    await toClosing(folder);
    git(root, "worktree", "lock", folder);
    const closed = await cli(folder, ["close"]);
    expect(closed.out).toContain(`La carpeta ${folder} queda: `);
    expect(closed.out).toContain(`SIGUIENTE: sal de ${folder} (en Claude Code, \`ExitWorktree\`)`);
    expect(await exists(folder)).toBe(true);
  });
});
