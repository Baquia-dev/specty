// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  firedRemindersBlocks,
  type MemoryEntry,
  memoryCommitSubject,
  memoryListCard,
  memoryRefusalCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "reminder",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const SALUDO = "20261103-saludo";

const refusal = (value: Parameters<typeof memoryRefusalCard>[0], ctx: CardContext) =>
  renderText(memoryRefusalCard(value, ctx), ctx.lang);

describe("reminders that wait for a change in the cards", () => {
  it("AC1: the list shows the change a reminder waits for", () => {
    const waiting = entry("P5", { onClose: SALUDO });
    expect(renderText(memoryListCard([waiting], { all: false }, ES), "es")).toContain(
      `P5 · recordatorio · al cerrar ${SALUDO} · Texto de P5 — claude-code, 2026-11-01`,
    );
    expect(renderText(memoryListCard([waiting], { all: false }, EN), "en")).toContain(
      `P5 · reminder · when ${SALUDO} closes · Texto de P5 — claude-code, 2026-11-01`,
    );
  });

  it("AC2: the reminders fired by an archived change get their own section", () => {
    const fired = [entry("P5", { text: "Publicar la versión.\nCon las notas." }), entry("P7")];
    expect(firedRemindersBlocks(fired, ES)).toEqual([
      {
        title: "RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO",
        lines: [
          "P5 · Publicar la versión.",
          "P7 · Texto de P7",
          "Desde ahora salen en cada sesión hasta que se marquen hechos con `specty memory done <id>`.",
        ],
      },
    ]);
    expect(firedRemindersBlocks(fired, EN)).toEqual([
      {
        title: "REMINDERS THAT WAITED FOR THIS CHANGE",
        lines: [
          "P5 · Publicar la versión.",
          "P7 · Texto de P7",
          "From now on they show in every session until marked done with `specty memory done <id>`.",
        ],
      },
    ]);
    expect(firedRemindersBlocks([], ES)).toEqual([]);
  });

  it("AC2: firing a reminder has its own commit subject", () => {
    expect(memoryCommitSubject("fire", "P5", "es")).toBe("memoria: P5 disparada");
    expect(memoryCommitSubject("fire", "P5", "en")).toBe("memory: P5 fired");
  });

  it("AC3: memory add explains --on-close on another kind, with another trigger or without an open change", () => {
    const kind = refusal({ reason: "on-close-not-reminder", kind: "pending" }, ES);
    expect(kind).toContain(
      "Solo un recordatorio espera al cierre de un cambio, y esta entrada sería un pendiente.",
    );
    expect(kind).toContain("SIGUIENTE: añade `--kind reminder` o quita `--on-close`.");
    expect(refusal({ reason: "on-close-not-reminder", kind: "lesson" }, EN)).toContain(
      "Only a reminder waits for a change to close, and this entry would be a lesson.",
    );
    expect(refusal({ reason: "two-triggers", flags: ["--due", "--on-close"] }, ES)).toContain(
      "Un recordatorio lleva un solo disparador: `--due` o `--on-close`, no los dos.",
    );
    expect(refusal({ reason: "two-triggers", flags: ["--path", "--on-close"] }, EN)).toContain(
      "A reminder carries a single trigger: `--path` or `--on-close`, not both.",
    );
    const closed = refusal({ reason: "not-open-change", id: SALUDO }, ES);
    expect(closed).toContain(
      `«${SALUDO}» no es un cambio abierto, y un recordatorio solo espera al cierre de uno abierto.`,
    );
    expect(closed).toContain(
      'SIGUIENTE: `specty status` lista los cambios abiertos; vuelve a ejecutar `specty memory add "<texto>" --kind reminder --on-close <id>` con uno de ellos.',
    );
    expect(refusal({ reason: "not-open-change", id: SALUDO }, EN)).toContain(
      `«${SALUDO}» is not an open change, and a reminder only waits for an open one to close.`,
    );
  });
});
