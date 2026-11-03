// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { fullVerificationWaitNote } from "../../src";

const HOLDER = {
  command: "pnpm check",
  pid: 4242,
  at: "2026-11-03T14:05:12.000Z",
  folder: "/repo/.worktrees/20261103-x",
};

describe("the note of a full verification that waits for its turn", () => {
  it("AC1: says what runs, where and since when, and that it waits", () => {
    expect(fullVerificationWaitNote(HOLDER, "es")).toBe(
      "specty: otra sesión está haciendo una verificación completa (`pnpm check` en /repo/.worktrees/20261103-x, desde las 14:05 UTC); espero a que termine para no correr dos a la vez…",
    );
    expect(fullVerificationWaitNote(HOLDER, "en")).toBe(
      "specty: another session is running a full verification (`pnpm check` in /repo/.worktrees/20261103-x, since 14:05 UTC); waiting for it to end so that two do not run at once…",
    );
  });
});
