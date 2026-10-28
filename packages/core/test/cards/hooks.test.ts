// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { blockedCommitMessage } from "../../src";

const VIEW = { paths: ["lib/x.ts"], minimalAllowed: false, command: "specty" };

describe("the message of a blocked commit", () => {
  it("AC5: offers `retro --into` for a change that can take it", () => {
    const message = blockedCommitMessage({ ...VIEW, change: "20261020-saludo", into: true }, "es");
    expect(message).toContain(
      "specty: este commit incluye código fuera del alcance de 20261020-saludo:",
    );
    expect(message).toContain(
      "  • Pídele a tu agente: «Documenta los cambios preparados con specty retro --into 20261020-saludo».",
    );
    expect(
      blockedCommitMessage({ ...VIEW, change: "20261020-saludo", into: true }, "en"),
    ).toContain(
      '  • Ask your agent: "Document the staged changes with specty retro --into 20261020-saludo".',
    );
  });

  it("AC5: offers a separate retro otherwise", () => {
    const message = blockedCommitMessage({ ...VIEW, change: "20261020-saludo" }, "es");
    expect(message).toContain("«Documenta los cambios preparados con specty retro».");
    expect(message).not.toContain("--into");
    expect(blockedCommitMessage(VIEW, "en")).toContain(
      '"Document the staged changes with specty retro".',
    );
  });
});
