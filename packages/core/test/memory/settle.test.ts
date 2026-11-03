// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  type MemoryEntry,
  memoryCommitSubject,
  nextCard,
  parseEntry,
  renderText,
  serializeEntry,
  settledEntry,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const CHANGE = "20261103-saludo";
const AT = "2026-11-03T12:00:00.000Z";

/** A pending item `change` took. */
const taken = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "taken",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  taken: { change: CHANGE, at: "2026-11-02T10:00:00.000Z" },
  text: `Texto de ${id}`,
  ...extra,
});

/** The card of `next` for a change in `phase`, as the agent reads it. */
const card = (change: Partial<ChangeView>, ctx: CardContext = ES): string =>
  renderText(
    nextCard(
      {
        change: {
          id: CHANGE,
          kind: "standard",
          phase: "draft",
          title: "Saludo",
          specPath: `.specty/changes/${CHANGE}/spec.md`,
          revision: 0,
          tasks: [],
          conventions: [],
          pendingScope: [],
          rejected: [],
          closingSubmitted: false,
          specChanged: false,
          ...change,
        },
        dirty: [],
      },
      ctx,
    ),
    ctx.lang,
  );

describe("the entries of a change that is archived", () => {
  it("AC1: are done, with who closed the change and when, and keep the change that took them", () => {
    const done = settledEntry(taken("P1"), { at: AT, by: "person" });
    expect(done).toEqual({ ...taken("P1"), status: "done", closed: { at: AT, by: "person" } });
    expect(parseEntry(serializeEntry(done))).toEqual(done);
  });

  it("AC2: are free again, without the change that took them", () => {
    const free = settledEntry(taken("P1"));
    expect(free.status).toBe("open");
    expect(free).not.toHaveProperty("taken");
    expect(free).not.toHaveProperty("closed");
    expect(parseEntry(serializeEntry(free))).toEqual(free);
  });

  it("AC2: commit freeing an entry with a subject of its own", () => {
    expect(memoryCommitSubject("free", "P4", "es")).toBe("memoria: P4 libre de nuevo");
    expect(memoryCommitSubject("free", "P4", "en")).toBe("memory: P4 free again");
  });
});

describe("the entries a change resolves, in its draft", () => {
  it("AC3: show after the user's request, with how they get done", () => {
    const resolves = [
      taken("P1", { text: "Uno\ncon más texto" }),
      taken("P3", { kind: "improvement" }),
    ];
    const text = card({ request: "haz P1 y P3", resolves });
    expect(text).toContain(
      "PETICIÓN DEL USUARIO:\n  haz P1 y P3\nRESUELVE:\n  P1 · pendiente · Uno\n  P3 · mejora · Texto de P3\n  Quedan hechas al cerrarse este cambio, y libres si se cancela.\n",
    );
    expect(card({ resolves }, EN)).toContain(
      "RESOLVES:\n  P1 · pending · Uno\n  P3 · improvement · Texto de P3\n  They get done when this change closes, and free again if it is cancelled.\n",
    );
  });

  it("AC3: leave the draft as it was without entries", () => {
    expect(card({ resolves: [] })).toBe(card({}));
    expect(card({})).not.toContain("RESUELVE");
  });
});
