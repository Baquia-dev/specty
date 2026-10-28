// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import type { AuditRecord } from "./progress";
import { testsOf } from "./tests";

const SENT_AT = "2026-10-28T10:00:00.000Z";

function state(overrides: Partial<ChangeState> = {}): ChangeState {
  return {
    schema: 1,
    id: "20261028-justificantes",
    kind: "standard",
    phase: "testing",
    revision: 1,
    items: {},
    tasks: {},
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
    ...overrides,
  };
}

const proposed = (ts: string, data: AuditRecord["data"]): AuditRecord => ({
  ts,
  actor: "agent",
  event: "tests.proposed",
  data,
});

describe("testsOf", () => {
  it("AC2: gives the new tests of the last sending and the commands that fail, with their exit", () => {
    const audit = [
      proposed("2026-10-27T09:00:00.000Z", { count: 1, files: ["test/old.test.ts"], red: [] }),
      proposed(SENT_AT, {
        count: 2,
        files: ["test/justificante.test.ts", "test/aviso.test.ts"],
        red: [
          { cmd: "pnpm test", exit: 1 },
          { cmd: "pnpm e2e", exit: null },
        ],
      }),
    ];
    expect(testsOf(state({ testsSubmittedAt: SENT_AT }), audit)).toEqual({
      submittedAt: SENT_AT,
      files: ["test/justificante.test.ts", "test/aviso.test.ts"],
      red: [
        { cmd: "pnpm test", exit: 1 },
        { cmd: "pnpm e2e", exit: null },
      ],
    });
  });

  it("AC2: while the agent writes them, nothing is sent, even with a sending of an earlier cycle", () => {
    const audit = [proposed(SENT_AT, { count: 1, files: ["test/old.test.ts"], red: [] })];
    expect(testsOf(state(), audit)).toEqual({ files: [], red: [] });
  });

  it("is only there in testing", () => {
    expect(testsOf(state({ phase: "implementing" }), [])).toBeUndefined();
  });

  it("reads the audit with care: what is not a path or a command is left out", () => {
    const audit = [
      proposed(SENT_AT, {
        files: ["test/a.test.ts", 3, ""],
        red: [{ cmd: "pnpm test", exit: 2 }, { cmd: 4 }, "pnpm lint", { cmd: "pnpm x" }],
      }),
    ];
    expect(testsOf(state({ testsSubmittedAt: SENT_AT }), audit)).toEqual({
      submittedAt: SENT_AT,
      files: ["test/a.test.ts"],
      red: [
        { cmd: "pnpm test", exit: 2 },
        { cmd: "pnpm x", exit: null },
      ],
    });
  });
});
