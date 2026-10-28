// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  headerOf,
  renderText,
  retroIntoApprovedCard,
  retroIntoRefusalCard,
  retroIntoRequestedCard,
  retroIntoStaleCard,
  retroIntoStaleReason,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const ID = "20261020-saludo";
const HEADER = headerOf(ID, "implementing");
const REQUEST = { id: "S2", task: "T1", paths: ["lib/a.ts", "lib/b.ts"] };

describe("AC1: the request `retro --into` creates", () => {
  it("lists the staged files and asks the person to approve it, then to commit again", () => {
    const card = retroIntoRequestedCard(HEADER, "S2", REQUEST.paths, ES);
    expect(card.status).toBe("ok");
    expect(renderText(card, "es")).toBe(
      [
        `SPECTY · ${ID} · implementing`,
        "SOLICITUD S2 (documenta lo preparado):",
        "  lib/a.ts",
        "  lib/b.ts",
        "SIGUIENTE: pide al usuario que apruebe la solicitud con `specty approve --scope S2` y que después repita `git commit`.",
      ].join("\n"),
    );
  });

  it("in delegated mode, lets the agent approve it and asks the person to commit again", () => {
    const card = retroIntoRequestedCard(HEADER, "S2", REQUEST.paths, { ...EN, delegated: true });
    expect(card.next).toBe(
      "delegated mode: approve the request yourself with `specty approve --scope S2`, then ask the user to run `git commit` again.",
    );
    expect(card.blocks[0]?.title).toBe("REQUEST S2 (documents the staged changes)");
  });
});

describe("AC2: an approved `retro --into` request", () => {
  it("says the staged changes are documented and asks the person to commit again", () => {
    const card = retroIntoApprovedCard(HEADER, REQUEST, ID, false, ES);
    expect(renderText(card, "es")).toBe(
      [
        `SPECTY · ${ID} · implementing`,
        "S2 aprobada: lib/a.ts, lib/b.ts entra en el alcance de T1.",
        `Lo preparado queda documentado en ${ID} y preparado junto a tu commit.`,
        "SIGUIENTE: vuelve a ejecutar `git commit`.",
      ].join("\n"),
    );
  });

  it("approved by the agent, asks it to have the person commit and go on", () => {
    const card = retroIntoApprovedCard(HEADER, REQUEST, ID, true, { ...EN, delegated: true });
    expect(card.next).toBe(
      "ask the user to run `git commit` again, and continue with `specty next`.",
    );
    expect(card.blocks[0]?.lines).toContain(
      `The staged changes are documented in ${ID} and staged with the commit.`,
    );
  });
});

describe("AC3: a request whose staged changes changed", () => {
  it("is rejected by Specty, with the reason the audit keeps", () => {
    expect(retroIntoStaleReason("es")).toBe("Lo preparado cambió desde la solicitud.");
    expect(retroIntoStaleReason("en")).toBe("The staged changes changed since the request.");
  });

  it("asks the agent to request it again", () => {
    const card = retroIntoStaleCard(HEADER, "S2", ID, true, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        `SPECTY · ${ID} · implementing`,
        "Lo preparado cambió desde que se pidió S2: Specty rechazó la solicitud.",
        `SIGUIENTE: vuelve a ejecutar \`specty retro --into ${ID} --reason "<motivo>"\`.`,
      ].join("\n"),
    );
  });

  it("sends the person to their agent", () => {
    expect(retroIntoStaleCard(HEADER, "S2", ID, false, EN).next).toBe(
      `ask your agent: "Document the staged changes with specty retro --into ${ID}".`,
    );
  });
});

describe("AC4: a refused `retro --into`", () => {
  it("asks for the reason, or for it from the user", () => {
    const card = retroIntoRefusalCard({ reason: "no-reason", id: ID }, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY",
        "Falta el motivo de los cambios preparados.",
        `SIGUIENTE: vuelve a ejecutar \`specty retro --into ${ID} --reason "<motivo>"\`; si no lo sabes, pregúntaselo al usuario.`,
      ].join("\n"),
    );
  });

  it("names the folder's active change when the id is another one", () => {
    const other = retroIntoRefusalCard(
      { reason: "not-active", id: "20261019-otro", active: ID },
      ES,
    );
    expect(other.blocks[0]?.lines).toEqual([
      "20261019-otro no es el cambio activo de esta carpeta.",
    ]);
    expect(other.next).toBe(
      `ejecuta \`specty retro --into ${ID} --reason "<motivo>"\`, o \`specty retro\` para documentarlo aparte.`,
    );
    expect(retroIntoRefusalCard({ reason: "not-active", id: ID }, EN).next).toBe(
      "document it separately with `specty retro`.",
    );
  });

  it("needs an active task in implementing", () => {
    const card = retroIntoRefusalCard({ reason: "no-task", id: ID, phase: "acceptance" }, EN);
    expect(renderText(card, "en")).toBe(
      [
        `SPECTY · ${ID} · acceptance`,
        `\`--into\` needs an active task in implementing; ${ID} is in acceptance.`,
        "NEXT: document it separately with `specty retro`.",
      ].join("\n"),
    );
  });

  it("does not go with `--minimal`", () => {
    const card = retroIntoRefusalCard({ reason: "with-minimal" }, ES);
    expect(card.blocks[0]?.lines).toEqual(["`--into` y `--minimal` no van juntos."]);
    expect(card.next).toBe(
      'usa `specty retro --into <id> --reason "<motivo>"` para ampliar el cambio activo, o `specty retro --minimal` para documentarlo aparte.',
    );
  });

  it("finds nothing staged outside the scope", () => {
    const card = retroIntoRefusalCard(
      { reason: "nothing-outside", id: ID, phase: "implementing" },
      ES,
    );
    expect(renderText(card, "es")).toBe(
      [
        `SPECTY · ${ID} · implementing`,
        `No hay código gobernado preparado fuera del alcance de ${ID}.`,
        "SIGUIENTE: prepara los cambios con `git add`; lo que está dentro del alcance pasa con `git commit` como cambio manual.",
      ].join("\n"),
    );
  });
});
