// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

async function implementing(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG(),
  });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  return root;
}

describe("specty wait", () => {
  it("AC1: returns immediately with next card when not waiting for human", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": CONFIG(),
    });
    const result = await cli(root, ["wait"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("No hay un cambio activo");
  });

  it("AC2, AC3: waits while waiting for human and unblocks when human approves", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": CONFIG(),
    });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);

    const waiting = cli(root, ["wait", "--interval", "100", "--timeout", "5"]);
    await new Promise((r) => setTimeout(r, 200));

    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });

    const finished = await waiting;
    expect(finished.code).toBe(0);
    expect(finished.out).toContain("TAREA T1");
  });

  it("AC2: stays waiting while there are multiple pending confirmations and unblocks only when all are resolved", async () => {
    const root = await implementing();
    await cli(root, ["scope", "add", "src/extra1.ts", "--reason", "motivo 1"]);
    await cli(root, ["scope", "add", "src/extra2.ts", "--reason", "motivo 2"]);

    const waiting = cli(root, ["wait", "--interval", "100", "--timeout", "5"]);
    await new Promise((r) => setTimeout(r, 200));

    // Resolve only the first one
    await cli(root, ["approve", "--scope", "S1"], { terminal: person() });
    await new Promise((r) => setTimeout(r, 200));

    // Waiting should still be running
    const race = await Promise.race([
      waiting.then(() => "finished"),
      new Promise((r) => setTimeout(() => r("waiting"), 100)),
    ]);
    expect(race).toBe("waiting");

    // Resolve the second one
    await cli(root, ["approve", "--scope", "S2"], { terminal: person() });

    const finished = await waiting;
    expect(finished.code).toBe(0);
    expect(finished.out).toContain("TAREA T1");
  });

  it("AC4: times out when person takes no action within timeout", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": CONFIG(),
    });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);

    const result = await cli(root, ["wait", "--interval", "50", "--timeout", "1"]);
    expect(result.out).toContain("Tiempo de espera agotado");
  });
});
