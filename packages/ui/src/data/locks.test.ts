// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import { lockedOf, unlocksOf } from "./locks";
import type { AuditRecord } from "./progress";

const HASH = `sha256:${"b".repeat(64)}`;
const LOGIN = "test/login_test.dart";
const SESSION = "test/sesion_test.dart";

function state(overrides: Partial<ChangeState> = {}): ChangeState {
  return {
    schema: 1,
    id: "20261028-justificantes",
    kind: "standard",
    phase: "implementing",
    revision: 1,
    items: {},
    tasks: {
      T1: { status: "done", attempts: 1, scopeExtra: [LOGIN] },
      T2: { status: "active", attempts: 1, scopeExtra: [SESSION] },
    },
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
    lockedTests: { [SESSION]: HASH, [LOGIN]: HASH },
    ...overrides,
  };
}

const decided = (id: string, task: string, unlock: unknown): AuditRecord => ({
  ts: "2026-10-28T10:00:00.000Z",
  actor: "human",
  event: "scope.decided",
  data: { id, decision: "approved", unlock, task },
});

describe("lockedOf", () => {
  it("AC1: gives each locked test by its path, unlocked for the task in progress, with its unlocks", () => {
    const audit = [
      decided("S1", "T1", [LOGIN]),
      decided("S2", "T2", [SESSION, "test/otro_test.dart"]),
      decided("S3", "T2", "no es una lista"),
    ];
    expect(lockedOf(state(), audit)).toEqual([
      { path: LOGIN, unlocks: [{ request: "S1", task: "T1" }] },
      { path: SESSION, unlockedFor: "T2", unlocks: [{ request: "S2", task: "T2" }] },
    ]);
  });

  it("is nothing without locked tests", () => {
    const { lockedTests: _locked, ...none } = state();
    expect(lockedOf(none, [])).toEqual([]);
    expect(lockedOf(state({ lockedTests: {} }), [])).toEqual([]);
  });
});

describe("unlocksOf", () => {
  it("AC2: names the locked tests a request asks for, unless its task already has them", () => {
    const request = (task: string, paths: readonly string[]) => ({
      id: "S4",
      task,
      paths,
      reason: "El test esperaba otro mensaje",
    });
    expect(unlocksOf(state(), request("T2", [LOGIN, "lib/app.dart"]))).toEqual([LOGIN]);
    expect(unlocksOf(state(), request("T2", [SESSION]))).toEqual([]);
    expect(unlocksOf(state({ lockedTests: {} }), request("T2", [LOGIN]))).toEqual([]);
  });
});
