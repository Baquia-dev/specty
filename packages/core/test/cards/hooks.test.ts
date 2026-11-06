// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { blockedCommitMessage, type CardContext, noWaitLine } from "../../src";

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

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the end-of-turn line when nobody waits for the person's decision", () => {
  it("AC5: says that no `specty wait` waits, in Spanish and in English", () => {
    expect(noWaitLine("20261106-saludo", ES)).toBe(
      "20261106-saludo espera la decisión de la persona y ningún `specty wait` la espera: no termines el turno sin esperarla, como dice la tarjeta. Si ya lo lanzaste en segundo plano y sigue en marcha, termina el turno.",
    );
    expect(noWaitLine("20261106-saludo", EN)).toBe(
      "20261106-saludo waits for the person's decision and no `specty wait` is waiting for it: do not end the turn without waiting, as the card says. If you already started it in the background and it is still running, end the turn.",
    );
  });

  it("AC4, AC5: in delegated mode, asks to take the delegated decision and not to wait", () => {
    const es = noWaitLine("20261106-saludo", { ...ES, delegated: true });
    expect(es).toBe(
      "20261106-saludo espera una decisión que la persona te delegó: tómala antes de terminar el turno, como dice la tarjeta.",
    );
    expect(es).not.toContain("wait");
    const en = noWaitLine("20261106-saludo", { ...EN, delegated: true });
    expect(en).toBe(
      "20261106-saludo waits for a decision the person delegated to you: take it before ending the turn, as the card says.",
    );
    expect(en).not.toContain("`specty wait`");
  });
});
