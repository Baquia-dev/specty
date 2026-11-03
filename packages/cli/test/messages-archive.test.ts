// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, person, tempRepo, toClosing } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** Where the messages for SPEC's change wait. */
const WAITING = `.git/common/specty/messages/${CHANGE}`;

/** A repository with SPEC's change open in it and a message for it that nobody took. */
async function withMessage(): Promise<string> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["message", CHANGE, "Mira lock.ts."], CLAUDE)).code).toBe(0);
  expect(existsSync(join(root, WAITING))).toBe(true);
  return root;
}

describe("the messages of a change that is archived", () => {
  it("AC3: go when the change is cancelled", async () => {
    const root = await withMessage();
    const cancelled = await cli(root, ["cancel"], {
      terminal: person({ ask: ["Ya no hace falta"] }),
    });
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    expect(existsSync(join(root, WAITING))).toBe(false);
  });

  it("AC3: go when the change is closed", async () => {
    const root = await withMessage();
    await toClosing(root);
    expect(existsSync(join(root, WAITING))).toBe(true);
    const closed = await cli(root, ["close"], { terminal: person() });
    expect(closed.out).toContain("Cambio cerrado y archivado");
    expect(existsSync(join(root, WAITING))).toBe(false);
  });
});
