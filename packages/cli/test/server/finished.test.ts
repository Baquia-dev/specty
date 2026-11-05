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
}

const EPIC = "20261001-panel-academico";
const LOST_EPIC = "20260901-perdida";

/** The oldest first: an epic, its slice, a slice whose epic is gone and a cancelled change. */
const SPECIAL: readonly Finished[] = [
  {
    id: EPIC,
    title: "Panel académico",
    phase: "done",
    at: "2026-10-01T08:00:00.000Z",
    kind: "epic",
  },
  {
    id: "20261002-notas-del-corte",
    title: "Notas del corte",
    phase: "done",
    at: "2026-10-01T09:00:00.000Z",
    epic: EPIC,
    slice: "C1",
    size: "L",
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

/** What `/api/changes/finished` answers, with the fields the tests read. */
interface Page {
  readonly records: readonly { readonly spec: string; readonly state: { readonly id: string } }[];
  readonly total: number;
  readonly counts: { readonly done: number; readonly cancelled: number };
  readonly finished: number;
  readonly epics: Readonly<Record<string, string>>;
}

const short = (id: string) => id.slice(9);
const idsOf = (page: Page) => page.records.map((record) => short(record.state.id));
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
  return {
    [`${dir}/spec.md`]: `---\n${front.join("\n")}\n---\n\n# ${change.title}\n`,
    [`${dir}/state.json`]: `${JSON.stringify({ ...rest, id: change.id, kind, phase: change.phase, ...size })}\n`,
    [`${dir}/audit.jsonl`]: `${JSON.stringify({ ts: change.at, actor: "human", event, data: {} })}\n`,
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
      expect(first.records.map((record) => record.state.id)).not.toContain(CHANGE);
      expect([first.total, first.counts, first.finished]).toEqual([
        37,
        { done: 36, cancelled: 1 },
        37,
      ]);
      // The title of the epic of each slice in the page; an epic that is gone, by its id.
      expect(first.epics).toEqual({ [EPIC]: "Panel académico", [LOST_EPIC]: LOST_EPIC });
      // Each record as `/api/changes/<id>` gives it.
      for (const record of first.records.slice(0, 5)) {
        const one = await call(server.port, `/api/changes/${record.state.id}`, { cookie });
        expect(JSON.parse(one.body)).toEqual(record);
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
    const specOf = async (path: string) => {
      const records: Page["records"] = path.endsWith("finished")
        ? (await page(server, cookie)).records
        : [JSON.parse((await call(server.port, path, { cookie })).body)];
      return records.find((record) => record.state.id === chat)?.spec ?? "";
    };
    try {
      expect(await specOf("/api/changes/finished")).toContain("# Chat de docentes");
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
      expect(await specOf("/api/changes/finished")).toContain("# Chat de docentes");
      expect(await specOf(byId)).toContain("# Chat de docentes");
      // A change that appears in the archive is read.
      const after = await page(server, cookie);
      expect([after.total, idsOf(after).at(-1)]).toEqual([5, "nuevo"]);
      const found = await call(server.port, `/api/changes/${newcomer.id}`, { cookie });
      expect([found.status, JSON.parse(found.body).state.id]).toEqual([200, newcomer.id]);
      // Once its state changes, the server reads it again.
      const later = new Date(Date.now() + 60_000);
      await utimes(join(root, `${ARCHIVE}/${chat}/state.json`), later, later);
      expect(await specOf("/api/changes/finished")).toContain("# Chat renombrado");
      expect(await specOf(byId)).toContain("# Chat renombrado");
    } finally {
      await server.close();
    }
  });
});
