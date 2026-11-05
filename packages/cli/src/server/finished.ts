// SPDX-License-Identifier: Apache-2.0
import {
  CHANGE_SORTS,
  type ChangeSort,
  computeSize,
  DEFAULT_CONFIG,
  LANGS,
  type Lang,
  matchesQuery,
  PHASES,
  type Phase,
  parseSpec,
  type SizeLevel,
  sortChanges,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { readText } from "../io/files";
import type { Session } from "../session";
import { archivedRecords, type ChangeRecord, withTaskCommits } from "./records";

/** `GET /api/changes/finished` (ARCHITECTURE §15): a page of the finished changes. */
interface FinishedPage {
  readonly records: readonly ChangeRecord[];
  /** How many match the search and the phase. */
  readonly total: number;
  /** How many done and cancelled ones match the search, whatever the phase. */
  readonly counts: { readonly done: number; readonly cancelled: number };
  /** How many finished changes there are, with no search nor phase. */
  readonly finished: number;
  /** The title of the epic of each slice in the page, by the epic's id. */
  readonly epics: Readonly<Record<string, string>>;
}

/** What the page asks for, each value understood or its default. */
interface PageQuery {
  readonly offset: number;
  readonly limit: number;
  readonly query: string;
  readonly phase: Phase | "all";
  readonly sort: ChangeSort;
  readonly lang: Lang;
}

/** What a finished change is searched and sorted by, as the Inbox derives it (`data/views.ts`). */
interface Summary {
  readonly id: string;
  readonly title: string;
  readonly epicOwn: boolean;
  readonly phase: Phase;
  readonly phaseSince: string;
  readonly size: { readonly level: SizeLevel };
  readonly epic?: { readonly id: string; readonly slice?: string };
}

/** A finished change as the page lists it: its summary, its epic's title and its record. */
interface Listed extends Omit<Summary, "epic"> {
  readonly record: ChangeRecord;
  readonly epic?: { readonly id: string; readonly title: string; readonly slice?: string };
}

const PAGE = 30;

/** The summary of each archived record, kept while the record is (`archivedRecords` keeps it). */
const SUMMARIES = new WeakMap<ChangeRecord, Summary>();

/**
 * The finished changes that `params` ask for: those archived and not open in any worktree, found
 * and sorted with the Inbox's own functions, with the commits of the page's tasks.
 */
export async function finishedPage(
  session: Session,
  params: URLSearchParams,
): Promise<FinishedPage> {
  const query = pageQuery(params, session.lang);
  const open = await openSide(session);
  const archived = (await archivedRecords(session)).filter(
    (record) => !open.ids.has(record.state.id),
  );
  const summaries = archived.map((record) => ({ record, summary: summaryOf(record, session) }));
  const titles = new Map([
    ...open.epics,
    ...summaries.flatMap(({ summary }) =>
      summary.epicOwn ? [[summary.id, summary.title] as const] : [],
    ),
  ]);
  const listed = summaries.map(({ record, summary }) => listedOf(record, summary, titles));
  const found = listed.filter((item) => matchesQuery(item, query.query));
  const shown = found.filter((item) => query.phase === "all" || item.phase === query.phase);
  const page = sortChanges(shown, query.sort, query.lang).slice(
    query.offset,
    query.offset + query.limit,
  );
  const count = (phase: Phase) => found.filter((item) => item.phase === phase).length;
  return {
    records: await withTaskCommits(
      session,
      page.map((item) => item.record),
    ),
    total: shown.length,
    counts: { done: count("done"), cancelled: count("cancelled") },
    finished: listed.length,
    epics: Object.fromEntries(
      page.flatMap(({ epic }) => (epic === undefined ? [] : [[epic.id, epic.title]])),
    ),
  };
}

/** The values of the query string; one it does not understand takes its default. */
function pageQuery(params: URLSearchParams, lang: Lang): PageQuery {
  const whole = (name: string, fallback: number) => {
    const text = params.get(name);
    return text !== null && /^\d+$/.test(text) ? Number(text) : fallback;
  };
  const phase = params.get("phase");
  const sort = params.get("sort");
  const asked = params.get("lang");
  return {
    offset: whole("offset", 0),
    limit: whole("limit", PAGE),
    query: params.get("q") ?? "",
    phase: PHASES.find((item) => item === phase) ?? "all",
    sort: CHANGE_SORTS.find((item) => item === sort) ?? "waiting",
    lang: LANGS.find((item) => item === asked) ?? lang,
  };
}

/** The ids of the open changes of every worktree, and the title of each open epic. */
async function openSide(session: Session) {
  const ids = new Set<string>();
  const epics = new Map<string, string>();
  for (const { change } of await locateChanges(session)) {
    if (isFinished(change.state)) continue;
    ids.add(change.state.id);
    if (change.state.kind !== "epic") continue;
    const spec = await readText(change.files.spec);
    const title = spec === undefined ? "" : parseSpec(spec, { language: session.lang }).spec.title;
    epics.set(change.state.id, title || change.state.id);
  }
  return { ids, epics };
}

/** What `record` is searched and sorted by: read once, then kept with the record. */
function summaryOf(record: ChangeRecord, session: Session): Summary {
  const known = SUMMARIES.get(record);
  if (known !== undefined) return known;
  const { state } = record;
  const spec = parseSpec(record.spec, { language: session.lang }).spec;
  const { epic, slice } = spec.frontmatter;
  const summary: Summary = {
    id: state.id,
    title: spec.title || state.id,
    epicOwn: state.kind === "epic",
    phase: state.phase,
    phaseSince: record.phaseSince,
    size: { level: state.size?.level ?? computeSize(spec, DEFAULT_CONFIG).level },
    ...(epic === undefined
      ? {}
      : { epic: { id: epic, ...(slice === undefined ? {} : { slice }) } }),
  };
  SUMMARIES.set(record, summary);
  return summary;
}

/** The summary with the title of its epic: open or archived, or its id when it is neither. */
function listedOf(
  record: ChangeRecord,
  summary: Summary,
  titles: ReadonlyMap<string, string>,
): Listed {
  const { epic, ...rest } = summary;
  if (epic === undefined) return { ...rest, record };
  return { ...rest, record, epic: { ...epic, title: titles.get(epic.id) ?? epic.id } };
}
