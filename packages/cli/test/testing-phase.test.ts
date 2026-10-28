// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  inWorktree,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** A verification that fails and names the test, as a runner does while the code is missing. */
const RED = `node -e "console.log('FAIL src/app.test.ts'); process.exit(1)"`;
/** The tests of a feature are written and approved before its code (ADR 0014). */
const contract = (verify = RED) => `${CONFIG(verify)}policy:\n  tests: contract\n`;
const CONTRACT = contract();

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

const TEST = "it('AC1: saluda a Ana', () => {});\n";
const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));
const auditOf = async (root: string): Promise<{ readonly event: string }[]> =>
  (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
const lastAudit = async (root: string) => (await auditOf(root)).at(-1);

/** FEATURE's change in testing, with the test of AC1 written as the agent leaves it. */
async function withTests(config = CONTRACT) {
  const { root } = await approved(config);
  await writeFiles(root, { "src/app.test.ts": TEST });
  return root;
}

describe("sending the tests", () => {
  it("AC1: commits only the tests, records it and waits for the person", async () => {
    const root = await withTests();
    await writeFiles(root, { "README.md": "notas\n" });
    const sent = await cli(root, ["propose"]);
    expect(sent.code, sent.out).toBe(0);
    expect(sent.out).toContain(`SPECTY · ${CHANGE} · testing`);
    expect(sent.out).toMatch(/TESTS ENVIADOS \(commit [0-9a-f]{7}\):\n {2}src\/app\.test\.ts/);
    expect(sent.out).toContain("los apruebe con `specty approve`");
    const [subject, ...files] = git(root, "show", "--name-only", "--format=%s", "HEAD")
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
    expect(subject).toMatch(/^test(\(.+\))?: Saludo personalizado$/);
    expect(files).toContain("src/app.test.ts");
    expect(files).not.toContain("README.md");
    expect(files.every((path) => path === "src/app.test.ts" || path.startsWith(".specty/"))).toBe(
      true,
    );
    const state = await stateOf(root);
    expect(state.phase).toBe("testing");
    expect(state.testsSubmittedAt).toBeDefined();
    expect(await lastAudit(root)).toMatchObject({
      actor: "agent",
      event: "tests.proposed",
      data: { count: 1, files: ["src/app.test.ts"] },
    });
  });

  it("AC2: sends nothing without new tests, or with code changed beside them", async () => {
    const { root } = await approved(CONTRACT);
    const none = await cli(root, ["propose"]);
    expect(none.code).not.toBe(0);
    expect(none.out).toContain("No hay tests nuevos de los archivos del cambio que enviar.");
    await writeFiles(root, { "src/app.test.ts": TEST, "src/app.ts": "export const greet = 1;\n" });
    const code = await cli(root, ["propose"]);
    expect(code.code).not.toBe(0);
    expect(code.out).toContain("cambió este código:\n  src/app.ts");
    expect((await stateOf(root)).testsSubmittedAt).toBeUndefined();
  });
});

describe("the red the tests are sent with", () => {
  const refused = async (config: string, test = TEST) => {
    const root = await withTests(config);
    await writeFiles(root, { "src/app.test.ts": test });
    const sent = await cli(root, ["propose"]);
    expect(sent.code).not.toBe(0);
    expect((await stateOf(root)).testsSubmittedAt).toBeUndefined();
    return sent.out;
  };

  it("AC1: sends nothing while the verification of the tasks passes", async () => {
    expect(await refused(contract("true"))).toContain(
      "Los tests nuevos no fallan: pasó su verificación:\n  true",
    );
  });

  it("AC2: sends nothing when the failing verification does not name a new test", async () => {
    const silent = contract(`node -e "process.exit(1)"`);
    expect(await refused(silent)).toContain(
      "La verificación falla, pero su salida no nombra estos tests nuevos:\n  src/app.test.ts",
    );
  });

  it("AC3: sends nothing while a criterion has no new test with its id", async () => {
    const out = await refused(CONTRACT, "it('saluda a Ana', () => {});\n");
    expect(out).toContain("Estos criterios no tienen un test nuevo con su id:\n  AC1");
  });

  it("AC4: sends the tests once they are red, and records each red command", async () => {
    const root = await withTests();
    const sent = await cli(root, ["propose"]);
    expect(sent.code, sent.out).toBe(0);
    expect(await lastAudit(root)).toMatchObject({
      event: "tests.proposed",
      data: { count: 1, files: ["src/app.test.ts"], red: [{ cmd: RED, exit: 1 }] },
    });
  });
});

describe("approving the tests", () => {
  it("AC3: the person's approval starts the implementation and records who and how", async () => {
    const root = await withTests();
    expect((await cli(root, ["propose"])).code).toBe(0);
    const approval = await cli(root, ["approve"], { terminal: person() });
    expect(approval.code, approval.out).toBe(0);
    expect(approval.out).toMatch(/Tests aprobados \(commit [0-9a-f]{7}\)\./);
    const state = await stateOf(root);
    expect(state.phase).toBe("implementing");
    expect(state.testsSubmittedAt).toBeUndefined();
    expect(await lastAudit(root)).toMatchObject({
      actor: "human",
      event: "tests.approved",
      data: { channel: "tty" },
    });
    expect(git(root, "log", "-1", "--format=%s").trim()).toBe("test(spec): Saludo personalizado");
    expect((await cli(root, ["next"])).out).toContain("TAREA T1");
  });

  it("AC4: approves nothing before the tests are sent, and lets the delegated agent approve them", async () => {
    const root = await withTests();
    const early = await cli(root, ["approve"], { terminal: person() });
    expect(early.out).toContain("No hay nada pendiente de `approve` en la fase testing.");
    expect((await stateOf(root)).phase).toBe("testing");
    expect(
      (await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) })).code,
    ).toBe(0);
    expect((await cli(root, ["propose"])).out).toContain("modo delegado: aprueba tú los tests");
    const approval = await cli(root, ["approve"]);
    expect(approval.code, approval.out).toBe(0);
    expect((await stateOf(root)).phase).toBe("implementing");
    // The agent goes on with `next`, which starts the first task after the approval.
    expect((await auditOf(root)).find((entry) => entry.event === "tests.approved")).toMatchObject({
      actor: "agent",
      data: { channel: "delegated", delegated: true },
    });
  });

  it("AC5: shows the person's decision in status, and approve finds it from the main folder", async () => {
    const { root, folder } = await inWorktree({ ...APP, ".specty/config.yaml": CONTRACT });
    await writeFiles(folder, { [SPEC_PATH]: FEATURE });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await writeFiles(folder, { "src/app.test.ts": TEST });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    const status = await cli(root, ["status"]);
    expect(status.out).toContain(`te toca decidir en ${CHANGE}: \`specty approve\`.`);
    const approval = await cli(root, ["approve"], { terminal: person() });
    expect(approval.code, approval.out).toBe(0);
    expect((await stateOf(folder)).phase).toBe("implementing");
  });
});
