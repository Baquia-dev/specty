// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** The shell command that runs `script` with Node, quoted for YAML. */
const node = (script: string) => JSON.stringify(`node -e "${script}"`);

/** A command that takes far longer than the second the verification gets here. */
const SLOW = node("console.log('empieza');setTimeout(() => {}, 30000)");

/** A command that fails on its own, at once. */
const FAILS = node("console.log('mal');process.exit(3)");

/** The configuration with a limit of one second and these `verify` lines after `default`. */
const config = (lines: string) => `${CONFIG()}  timeoutSec: 1\n${lines}`;

/** The line that says the time limit cut the full verification. */
const CUT =
  "Se agotó el tiempo: la verificación se cortó a los 1 s (`verify.timeoutSec`), antes de terminar. Si la máquina estaba cargada, por ejemplo con otras verificaciones a la vez, reintentar con menos carga puede bastar; si no, la persona puede subir `verify.timeoutSec`.";

/** SPEC's change in its repository's own folder, with these `verify` lines, ready to accept. */
async function inAcceptance(verify: string): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config(verify) });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": "1\n" });
  await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(root, { "src/app.ts": "2\n" });
  await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
  return root;
}

/** The person runs `accept`: yes to the verification, no to accepting it anyway after a failure. */
async function accept(root: string) {
  const terminal = person({ confirm: [true, false] });
  const run = await cli(root, ["accept"], { terminal });
  return { ...run, notes: terminal.notes.join("\n") };
}

describe("a full verification that its time limit cuts", () => {
  it("AC1: ends the note of `accept` with the line that says the time ran out", async () => {
    const root = await inAcceptance(`  full: ${SLOW}\n`);
    const accepted = await accept(root);
    expect(accepted.notes).toContain("Verificación fallida");
    expect(accepted.notes).toContain(`empieza\n${CUT}`);
  });

  it("AC2: with units, ends the output of the unit it cut with that line, and that unit failed", async () => {
    const units = `  units:\n    - name: lenta\n      command: ${SLOW}\n      paths: ["src/**"]\n`;
    const root = await inAcceptance(units);
    const accepted = await accept(root);
    expect(accepted.notes).toContain(`empieza\n${CUT}`);
    expect(accepted.notes).toMatch(/Falló: lenta \(\d+ s\)\./);
  });

  it("AC3: a verification that fails on its own shows its output as before, without that line", async () => {
    const root = await inAcceptance(`  full: ${FAILS}\n`);
    const accepted = await accept(root);
    expect(accepted.notes).toContain("Verificación fallida");
    expect(accepted.notes).toContain("mal");
    expect(accepted.notes).not.toContain("Se agotó el tiempo");
  });
});
