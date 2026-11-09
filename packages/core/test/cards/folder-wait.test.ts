// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { verifyFolderWaitNote } from "../../src";

const FULL = {
  command: "pnpm check",
  pid: 4321,
  at: "2026-11-09T04:38:48.160Z",
  folder: "/repo/.worktrees/20261109-saludo",
};

describe("a verification that waits for its folder", () => {
  it("AC1: says which command runs in the folder and since when, in Spanish and in English", () => {
    expect(verifyFolderWaitNote([FULL], "es")).toBe(
      "specty: en esta carpeta ya corre otro comando de verificación de Specty (`pnpm check`, desde las 04:38 UTC); espero a que termine para que no se pisen, por ejemplo en la carpeta de la cobertura…",
    );
    expect(verifyFolderWaitNote([FULL], "en")).toBe(
      "specty: another Specty verification command is already running in this folder (`pnpm check`, since 04:38 UTC); waiting for it to end so that the two do not clash, over the coverage folder for one…",
    );
  });

  it("AC1: names every command that runs in the folder", () => {
    const check = { ...FULL, command: "pnpm test", at: "2026-11-09T05:01:00.000Z" };
    expect(verifyFolderWaitNote([FULL, check], "es")).toContain(
      "(`pnpm check`, desde las 04:38 UTC; `pnpm test`, desde las 05:01 UTC)",
    );
  });
});
