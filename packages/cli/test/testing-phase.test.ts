// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** The tests of a feature are written and approved before its code (ADR 0014). */
const CONTRACT = `${CONFIG()}policy:\n  tests: contract\n`;

/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);

/** FEATURE's change, proposed and approved by the person, under `config`. */
async function approved(config: string) {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: FEATURE });
  const proposed = await cli(root, ["propose"]);
  expect(proposed.code, proposed.out).toBe(0);
  const approval = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approval.code).toBe(0);
  return { root, approval };
}

const phaseOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`)).phase;

describe("entering the testing phase", () => {
  it("AC2: with contract, approving a feature's spec starts the testing phase", async () => {
    const { root, approval } = await approved(CONTRACT);
    expect(await phaseOf(root)).toBe("testing");
    expect(approval.out).toContain(`SPECTY · ${CHANGE} · testing`);
    // The agent continues with `next`, which gives it the card of the testing phase.
    const next = await cli(root, ["next"]);
    expect(next.out).toContain(`SPECTY · ${CHANGE} · testing`);
    expect(next.out).toContain("FASE DE TESTS");
    expect(next.out).toContain("AC1: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana».");
    expect(next.out).toContain("src/app.test.ts");
  });

  it("AC3: without contract, approving goes on to the implementation as before", async () => {
    const { root, approval } = await approved(CONFIG());
    expect(await phaseOf(root)).toBe("implementing");
    expect(approval.out).toContain(`SPECTY · ${CHANGE} · implementing`);
  });
});

/** What the guard answers Claude Code when it is about to write `path`. */
const writing = (root: string, path: string) =>
  cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd: root, tool_name: "Write", tool_input: { file_path: path } }),
  });

describe("the guard in the testing phase", () => {
  it("AC4: lets the agent write the change's tests and nothing else of the code", async () => {
    const { root } = await approved(CONTRACT);
    expect((await writing(root, `${root}/src/app.test.ts`)).code).toBe(0);
    expect((await writing(root, `${root}/src/__tests__/greet.ts`)).code).toBe(0);
    for (const path of ["src/app.ts", "lib/other.test.ts"]) {
      const denied = await writing(root, `${root}/${path}`);
      expect(denied.code, path).toBe(2);
      expect(denied.err).toContain("fase de tests");
      expect(denied.err).toContain("SIGUIENTE:");
      expect(denied.err).toContain("`specty propose`");
    }
  });
});

describe("the end of the agent's turn in the testing phase", () => {
  it("AC5: checks the diff against the approved plan, as while implementing", async () => {
    const { root } = await approved(`${CONTRACT}checks:\n  levels: { secrets: off }\n`);
    // Written past the guard, as a shell command could.
    await writeFiles(root, { "lib/other.ts": "export const other = 1;\n" });
    const run = await cli(root, ["hook", "agent-stop", "claude-code"], {
      stdin: JSON.stringify({ stop_hook_active: false }),
    });
    const reply = JSON.parse(run.out);
    expect(reply.decision).toBe("block");
    expect(reply.reason).toContain("FALLA scope\n  lib/other.ts fuera del alcance de la spec");
  });
});
