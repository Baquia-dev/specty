// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, person, withRepo } from "./setup";

describe("specty wait", () => {
  it("AC1: returns immediately with next card when not waiting for human", async () => {
    const root = await withRepo();
    const result = await cli(root, ["wait"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("No hay un cambio activo");
  });

  it("AC2, AC3: waits while waiting for human and unblocks when human approves", async () => {
    const root = await withRepo();
    await cli(root, ["new", "Saludo personalizado"]);
    await cli(root, ["propose"]);

    const waiting = cli(root, ["wait", "--interval", "100", "--timeout", "5"]);
    await new Promise((r) => setTimeout(r, 200));

    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });

    const finished = await waiting;
    expect(finished.code).toBe(0);
    expect(finished.out).toContain("TAREA T1");
  });

  it("AC4: times out when person takes no action within timeout", async () => {
    const root = await withRepo();
    await cli(root, ["new", "Saludo personalizado"]);
    await cli(root, ["propose"]);

    const result = await cli(root, ["wait", "--interval", "50", "--timeout", "1"]);
    expect(result.out).toContain("Tiempo de espera agotado");
  });
});
