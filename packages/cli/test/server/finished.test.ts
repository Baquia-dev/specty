// SPDX-License-Identifier: Apache-2.0
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer, type UiServer } from "../../src/server/http";
import { AGENT, APP, ARCHIVE, CHANGE, CONFIG, cli, tempRepo, writeFiles } from "../support";
import { call, sessionAt, state } from "./support";

/** A finished change as the tests write it into the archive. */
interface Finished {
  readonly id: string;
  readonly title: string;
  readonly phase: "done" | "cancelled";
  /** When it finished: its phase begins there. */
  readonly at: string;
  readonly kind?: "standard" | "epic";
  readonly epic?: string;
  readonly slice?: string;
  readonly size?: "S" | "M" | "L" | "XL";
  /** The lines of its spec after its title. */
  readonly body?: readonly string[];
  /** The tasks it did, as its state says them. */
  readonly done?: readonly string[];
  /** When it was created: its audit begins with that `change.created`. */
  readonly created?: string;
}

const EPIC = "20261001-panel-academico";
const LOST_EPIC = "20260901-perdida";

/**
 * The oldest first: an epic whose Cortes name C1, its slice with one of its two tasks done, a
 * slice whose epic is gone and a cancelled change.
 */
const SPECIAL: readonly Finished[] = [
  {
    id: EPIC,
    title: "Panel académico",
    phase: "done",
    at: "2026-10-01T08:00:00.000Z",
    kind: "epic",
    body: ["## Cortes", "", "- C1: Notas por curso", "  - ac: AC1"],
  },
  {
    id: "20261002-notas-del-corte",
    title: "Notas del corte",
    phase: "done",
    at: "2026-10-01T09:00:00.000Z",
    epic: EPIC,
    slice: "C1",
    size: "L",
    body: [
      "## Tareas",
      "",
      "- [x] T1: Las notas de un curso",
      "  - ac: AC1",
      "- [ ] T2: El corte las muestra",
      "  - ac: AC1",
    ],
    done: ["T1"],
    created: "2026-09-30T08:00:00.000Z",
  },
  {
    id: "20261003-huerfano",
    title: "Corte sin su épica",
    phase: "done",
    at: "2026-10-01T10:00:00.000Z",
    epic: LOST_EPIC,
    slice: "C3",
  },
  {
    id: "20261004-chat-docentes",
    title: "Chat de docentes",
    phase: "cancelled",
    at: "2026-10-01T11:00:00.000Z",
    size: "M",
  },
];

/** 31 more, a minute apart, and the two newest, whose titles sort apart in Spanish and English. */
const BATCH: readonly Finished[] = Array.from({ length: 31 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return {
    id: `20261010-lote-${n}`,
    title: `Lote ${n}`,
    phase: "done",
    at: `2026-10-02T10:${n}:00.000Z`,
  };
});
const NEWEST: readonly Finished[] = [
  {
    id: "20261005-nube",
    title: "Nube de etiquetas",
    phase: "done",
    at: "2026-10-03T10:00:00.000Z",
  },
  { id: "20261006-nandu", title: "Ñandú", phase: "done", at: "2026-10-03T11:00:00.000Z" },
];
const ALL = [...SPECIAL, ...BATCH, ...NEWEST];

/** What `/api/changes/finished` answers, with the fields the tests read of each summary. */
interface Page {
  readonly changes: readonly {
    readonly id: string;
    readonly title: string;
    readonly epic?: Readonly<Record<string, string>>;
  }[];
  readonly total: number;
  readonly counts: { readonly done: number; readonly cancelled: number };
  readonly finished: number;
}

const short = (id: string) => id.slice(9);
const idsOf = (page: Page) => page.changes.map((change) => short(change.id));
const lote = (from: number, to: number) =>
  Array.from(
    { length: to - from + 1 },
    (_, index) => `lote-${String(from + index).padStart(2, "0")}`,
  );

/** The files of `change` in the archive: its spec, its state and the audit entry that finished it. */
function archived(
  base: Readonly<Record<string, unknown>>,
  change: Finished,
): Record<string, string> {
  const dir = `${ARCHIVE}/${change.id}`;
  const kind = change.kind ?? "standard";
  const front = [
    `kind: ${kind}`,
    ...(change.epic === undefined ? [] : [`epic: ${change.epic}`]),
    ...(change.slice === undefined ? [] : [`slice: ${change.slice}`]),
  ];
  const size =
    change.size === undefined
      ? {}
      : { size: { level: change.size, score: 1, adjust: 0, reasons: [] } };
  const event = change.phase === "done" ? "change.closed" : "change.cancelled";
  // Only the size each change is given: none, and the server works it out from the spec.
  const { size: _unsized, ...rest } = base;
  const tasks = Object.fromEntries(
    (change.done ?? []).map((task) => [task, { status: "done", attempts: 1, scopeExtra: [] }]),
  );
  const audit = [
    ...(change.created === undefined
      ? []
      : [{ ts: change.created, actor: "agent", event: "change.created", data: {} }]),
    { ts: change.at, actor: "human", event, data: {} },
  ];
  const body = change.body === undefined ? "" : `\n${change.body.join("\n")}\n`;
  return {
    [`${dir}/spec.md`]: `---\n${front.join("\n")}\n---\n\n# ${change.title}\n${body}`,
    [`${dir}/state.json`]: `${JSON.stringify({ ...rest, id: change.id, kind, phase: change.phase, tasks, ...size })}\n`,
    [`${dir}/audit.jsonl`]: audit.map((line) => `${JSON.stringify(line)}\n`).join(""),
  };
}

/** A repository with SPEC's change open and `changes` in the archive, and a server there. */
async function serving(changes: readonly Finished[] = ALL) {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONFIG() });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  const base = await state(root);
  await writeFiles(root, Object.assign({}, ...changes.map((change) => archived(base, change))));
  const server = await startServer({
    session: await sessionAt(root, AGENT),
    port: 0,
    ui: undefined,
  });
  return { root, base, server, cookie: await signIn(server) };
}

/** Opens the server's link, as the browser does: the cookie of its session. */
async function signIn(server: UiServer): Promise<string> {
  const { pathname, search } = new URL(server.link);
  const cookie = (await call(server.port, `${pathname}${search}`)).headers["set-cookie"]?.[0];
  return cookie?.split(";")[0] ?? "";
}

/** The page of finished changes that `query` asks for, read with the session's cookie. */
async function page(server: UiServer, cookie: string, query = ""): Promise<Page> {
  const answer = await call(server.port, `/api/changes/finished${query}`, { cookie });
  expect([query, answer.status]).toEqual([query, 200]);
  return JSON.parse(answer.body);
}

describe("the finished changes the server gives by pages", () => {
  it("AC1: gives the first 30 archived changes, longest waiting first, with how many there are and their epics", async () => {
    const { server, cookie } = await serving();
    try {
      expect((await call(server.port, "/api/changes/finished")).status).toBe(403);
      const first = await page(server, cookie);
      expect(idsOf(first)).toEqual([
        "panel-academico",
        "notas-del-corte",
        "huerfano",
        "chat-docentes",
        ...lote(1, 26),
      ]);
      // The open change is not finished.
      expect(first.changes.map((change) => change.id)).not.toContain(CHANGE);
      expect([first.total, first.counts, first.finished]).toEqual([
        37,
        { done: 36, cancelled: 1 },
        37,
      ]);
      // Each change of the page, whole, by its id.
      for (const change of first.changes.slice(0, 5)) {
        const one = await call(server.port, `/api/changes/${change.id}`, { cookie });
        expect([one.status, JSON.parse(one.body).state.id]).toEqual([200, change.id]);
      }
    } finally {
      await server.close();
    }
  });

  it("AC2: gives the page asked, only what matches the search and the phase, in the order asked", async () => {
    const { server, cookie } = await serving();
    try {
      expect(idsOf(await page(server, cookie, "?offset=30"))).toEqual([
        ...lote(27, 31),
        "nube",
        "nandu",
      ]);
      expect(idsOf(await page(server, cookie, "?offset=2&limit=3"))).toEqual([
        "huerfano",
        "chat-docentes",
        "lote-01",
      ]);
      const counts = await page(server, cookie, "?limit=0");
      expect([idsOf(counts), counts.total, counts.counts]).toEqual([
        [],
        37,
        { done: 36, cancelled: 1 },
      ]);

      // The search looks at the title, the id and the epic's id, title and slice, without case or accents.
      const epic = await page(server, cookie, `?q=${encodeURIComponent("PANEL ACADEMICO")}`);
      expect([idsOf(epic), epic.total, epic.counts]).toEqual([
        ["panel-academico", "notas-del-corte"],
        2,
        { done: 2, cancelled: 0 },
      ]);
      expect(idsOf(await page(server, cookie, "?q=c3"))).toEqual(["huerfano"]);
      expect(idsOf(await page(server, cookie, "?q=20261004"))).toEqual(["chat-docentes"]);
      expect(idsOf(await page(server, cookie, `?q=${encodeURIComponent("ñandu")}`))).toEqual([
        "nandu",
      ]);

      // The phase narrows the page and its total; the counts stay those of the search.
      const cancelled = await page(server, cookie, "?phase=cancelled");
      expect([idsOf(cancelled), cancelled.total, cancelled.counts]).toEqual([
        ["chat-docentes"],
        1,
        { done: 36, cancelled: 1 },
      ]);
      const none = await page(server, cookie, "?q=docentes&phase=done");
      expect([idsOf(none), none.total, none.counts]).toEqual([[], 0, { done: 0, cancelled: 1 }]);
      const open = await page(server, cookie, "?phase=review");
      expect([idsOf(open), open.total, open.counts]).toEqual([[], 0, { done: 36, cancelled: 1 }]);

      // The four orders of the Inbox; titles in the language asked.
      expect(idsOf(await page(server, cookie, "?sort=recent&limit=3"))).toEqual([
        "nandu",
        "nube",
        "lote-31",
      ]);
      expect(idsOf(await page(server, cookie, "?sort=size&limit=3"))).toEqual([
        "notas-del-corte",
        "chat-docentes",
        "panel-academico",
      ]);
      expect(idsOf(await page(server, cookie, "?sort=waiting&limit=2"))).toEqual([
        "panel-academico",
        "notas-del-corte",
      ]);
      const titles = async (lang: string) =>
        idsOf(await page(server, cookie, `?sort=title&lang=${lang}&limit=100`));
      const spanish = await titles("es");
      expect(spanish.slice(0, 2)).toEqual(["chat-docentes", "huerfano"]);
      expect(spanish.indexOf("nube")).toBeLessThan(spanish.indexOf("nandu"));
      const english = await titles("en");
      expect(english.indexOf("nandu")).toBeLessThan(english.indexOf("nube"));

      // A value it does not understand takes the default.
      const odd = await page(
        server,
        cookie,
        "?offset=-3&limit=muchos&phase=ninguna&sort=raro&lang=xx",
      );
      expect(odd).toEqual(await page(server, cookie));
    } finally {
      await server.close();
    }
  });

  it("AC3: keeps the archived changes it read, until their state changes, and reads the new ones", async () => {
    const { root, base, server, cookie } = await serving(SPECIAL);
    const chat = "20261004-chat-docentes";
    const byId = `/api/changes/${chat}`;
    // Its title in the page of finished changes, and its spec in its record by its id.
    const titleInPage = async () =>
      (await page(server, cookie)).changes.find((change) => change.id === chat)?.title ?? "";
    const specById = async () => JSON.parse((await call(server.port, byId, { cookie })).body).spec;
    try {
      expect(await titleInPage()).toBe("Chat de docentes");
      // Its spec changes on disk, its state does not: what the server read stays.
      await writeFiles(root, {
        [`${ARCHIVE}/${chat}/spec.md`]: "---\nkind: standard\n---\n\n# Chat renombrado\n",
      });
      const newcomer: Finished = {
        id: "20261007-nuevo",
        title: "Nuevo en el archivo",
        phase: "done",
        at: "2026-10-04T10:00:00.000Z",
      };
      await writeFiles(root, archived(base, newcomer));
      expect(await titleInPage()).toBe("Chat de docentes");
      expect(await specById()).toContain("# Chat de docentes");
      // A change that appears in the archive is read.
      const after = await page(server, cookie);
      expect([after.total, idsOf(after).at(-1)]).toEqual([5, "nuevo"]);
      const found = await call(server.port, `/api/changes/${newcomer.id}`, { cookie });
      expect([found.status, JSON.parse(found.body).state.id]).toEqual([200, newcomer.id]);
      // Once its state changes, the server reads it again.
      const later = new Date(Date.now() + 60_000);
      await utimes(join(root, `${ARCHIVE}/${chat}/state.json`), later, later);
      expect(await titleInPage()).toBe("Chat renombrado");
      expect(await specById()).toContain("# Chat renombrado");
    } finally {
      await server.close();
    }
  });
});

/** What a change without files weighs, in both languages: the reason every summary here gives. */
const NO_FILES = [{ es: "0 archivos", en: "0 files" }];

describe("the summary of each finished change in a page", () => {
  it("AC1: gives each change by its summary, without its spec, state or audit, and no records nor epics", async () => {
    const { server, cookie } = await serving(SPECIAL);
    try {
      const first = await page(server, cookie);
      expect(Object.keys(first).toSorted()).toEqual(["changes", "counts", "finished", "total"]);
      expect(first.changes).toEqual([
        {
          id: EPIC,
          title: "Panel académico",
          kind: "epic",
          slices: [{ id: "C1", title: "Notas por curso" }],
          phase: "done",
          phaseSince: "2026-10-01T08:00:00.000Z",
          createdAt: "2026-10-01T08:00:00.000Z",
          closedAt: "2026-10-01T08:00:00.000Z",
          size: { level: "S", reasons: NO_FILES },
          tasks: { done: 0, total: 0 },
          tab: "history",
        },
        {
          id: "20261002-notas-del-corte",
          title: "Notas del corte",
          kind: "standard",
          epic: { id: EPIC, title: "Panel académico", slice: "C1", sliceTitle: "Notas por curso" },
          phase: "done",
          phaseSince: "2026-10-01T09:00:00.000Z",
          createdAt: "2026-09-30T08:00:00.000Z",
          closedAt: "2026-10-01T09:00:00.000Z",
          size: { level: "L", reasons: NO_FILES },
          tasks: { done: 1, total: 2 },
          tab: "history",
        },
        {
          id: "20261003-huerfano",
          title: "Corte sin su épica",
          kind: "standard",
          epic: { id: LOST_EPIC, title: LOST_EPIC, slice: "C3" },
          phase: "done",
          phaseSince: "2026-10-01T10:00:00.000Z",
          createdAt: "2026-10-01T10:00:00.000Z",
          closedAt: "2026-10-01T10:00:00.000Z",
          size: { level: "S", reasons: NO_FILES },
          tasks: { done: 0, total: 0 },
          tab: "history",
        },
        {
          id: "20261004-chat-docentes",
          title: "Chat de docentes",
          kind: "standard",
          phase: "cancelled",
          phaseSince: "2026-10-01T11:00:00.000Z",
          createdAt: "2026-10-01T11:00:00.000Z",
          closedAt: "2026-10-01T11:00:00.000Z",
          size: { level: "M", reasons: NO_FILES },
          tasks: { done: 0, total: 0 },
          tab: "history",
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("AC2: gives a slice the titles of its epic and of its slice, with the epic open or archived, or else the epic's id", async () => {
    const { root, base, server, cookie } = await serving(SPECIAL);
    try {
      // The open change becomes an epic whose Cortes name C1, and two of its slices finish.
      const epicSpec = [
        "---",
        "kind: epic",
        "---",
        "",
        "# Saludo en la portada",
        "",
        "## Cortes",
        "",
        "- C1: Saludo por nombre",
        "  - ac: AC1",
        "",
      ].join("\n");
      const slice = (id: string, title: string, cut: string, at: string): Finished => ({
        id,
        title,
        phase: "done",
        at,
        epic: CHANGE,
        slice: cut,
      });
      await writeFiles(root, {
        [`.specty/changes/${CHANGE}/spec.md`]: epicSpec,
        [`.specty/changes/${CHANGE}/state.json`]: `${JSON.stringify({ ...base, kind: "epic" })}\n`,
        ...archived(
          base,
          slice(
            "20261008-saludo-por-nombre",
            "Saludo por nombre",
            "C1",
            "2026-10-04T10:00:00.000Z",
          ),
        ),
        ...archived(
          base,
          slice("20261009-saludo-de-noche", "Saludo de noche", "C2", "2026-10-04T11:00:00.000Z"),
        ),
      });
      const epics = Object.fromEntries(
        (await page(server, cookie)).changes.map((change) => [short(change.id), change.epic]),
      );
      expect(epics).toEqual({
        "panel-academico": undefined,
        // Its epic archived, whose Cortes name its slice.
        "notas-del-corte": {
          id: EPIC,
          title: "Panel académico",
          slice: "C1",
          sliceTitle: "Notas por curso",
        },
        // Its epic is gone: its id.
        huerfano: { id: LOST_EPIC, title: LOST_EPIC, slice: "C3" },
        "chat-docentes": undefined,
        // Its epic open: its title, and its slice's when its Cortes name it.
        "saludo-por-nombre": {
          id: CHANGE,
          title: "Saludo en la portada",
          slice: "C1",
          sliceTitle: "Saludo por nombre",
        },
        "saludo-de-noche": { id: CHANGE, title: "Saludo en la portada", slice: "C2" },
      });
    } finally {
      await server.close();
    }
  });
});
