// SPDX-License-Identifier: Apache-2.0
import {
  CHANGE_SORTS,
  type ChangeSort,
  type ChangeSummary,
  LANGS,
  type Lang,
  matchesQuery,
  PHASES,
  type Phase,
  parseSpec,
  sortChanges,
  summarizeChange,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { readText } from "../io/files";
import type { Session } from "../session";
import { archivedRecords, type ChangeRecord } from "./records";

/**
 * `GET /api/changes/finished` (ARCHITECTURE §15): a page of the finished changes, each by its
 * summary; the UI asks for the record of one by its id.
 */
interface FinishedPage {
  readonly changes: readonly Listed[];
  /** How many match the search and the phase. */
  readonly total: number;
  /** How many done and cancelled ones match the search, whatever the phase. */
  readonly counts: { readonly done: number; readonly cancelled: number };
  /** How many finished changes there are, with no search nor phase. */
  readonly finished: number;
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

/**
 * A finished change as the page lists it, as the UI's `ChangeSummary`: core's summary, with the
 * title of its epic and the one its epic gives its slice.
 */
interface Listed extends Omit<ChangeSummary, "epic"> {
  readonly epic?: {
    readonly id: string;
    readonly title: string;
    readonly slice?: string;
    readonly sliceTitle?: string;
  };
}

/** An epic as its slices read it: its title and its slices, by their id and title. */
interface Epic {
  readonly title: string;
  readonly slices: readonly { readonly id: string; readonly title: string }[];
}

const PAGE = 30;

/** The summary of each archived record, kept while the record is (`archivedRecords` keeps it). */
const SUMMARIES = new WeakMap<ChangeRecord, ChangeSummary>();

/**
 * The finished changes that `params` ask for: those archived and not open in any worktree, each
 * by its summary, found and sorted with the Inbox's own functions.
 */
export async function finishedPage(
  session: Session,
  params: URLSearchParams,
): Promise<FinishedPage> {
  const query = pageQuery(params, session.lang);
  const open = await openSide(session);
  const summaries = (await archivedRecords(session))
    .filter((record) => !open.ids.has(record.state.id))
    .map(summaryOf);
  const epics = new Map([
    ...open.epics,
    ...summaries.flatMap((summary) =>
      summary.kind === "epic"
        ? [[summary.id, { title: summary.title, slices: summary.slices ?? [] }] as const]
        : [],
    ),
  ]);
  const listed = summaries.map((summary) => listedOf(summary, epics));
  const found = listed.filter((item) => matchesQuery(item, query.query));
  const shown = found.filter((item) => query.phase === "all" || item.phase === query.phase);
  const count = (phase: Phase) => found.filter((item) => item.phase === phase).length;
  return {
    changes: sortChanges(shown, query.sort, query.lang).slice(
      query.offset,
      query.offset + query.limit,
    ),
    total: shown.length,
    counts: { done: count("done"), cancelled: count("cancelled") },
    finished: listed.length,
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

/** The ids of the open changes of every worktree, and each open epic, read from its spec. */
async function openSide(session: Session) {
  const ids = new Set<string>();
  const epics = new Map<string, Epic>();
  for (const { change } of await locateChanges(session)) {
    if (isFinished(change.state)) continue;
    ids.add(change.state.id);
    if (change.state.kind !== "epic") continue;
    const text = await readText(change.files.spec);
    const spec = text === undefined ? undefined : parseSpec(text).spec;
    epics.set(change.state.id, {
      title: spec?.title || change.state.id,
      slices: (spec?.sections.slices?.items ?? []).map(({ id, title }) => ({ id, title })),
    });
  }
  return { ids, epics };
}

/**
 * What the UI would derive of `record` for its list, with core's own function and its spec read
 * as the UI reads it: read once, then kept with the record.
 */
function summaryOf(record: ChangeRecord): ChangeSummary {
  const known = SUMMARIES.get(record);
  if (known !== undefined) return known;
  const summary = summarizeChange({
    spec: parseSpec(record.spec).spec,
    state: record.state,
    phaseSince: record.phaseSince,
    audit: record.audit ?? [],
  });
  SUMMARIES.set(record, summary);
  return summary;
}

/**
 * The summary with the title of its epic, open or archived, or its id when it is neither, and the
 * title its epic gives its slice, as `deriveViews` gives them in the UI.
 */
function listedOf(summary: ChangeSummary, epics: ReadonlyMap<string, Epic>): Listed {
  const { epic, ...rest } = summary;
  if (epic === undefined) return rest;
  const known = epics.get(epic.id);
  const sliceTitle = known?.slices.find((slice) => slice.id === epic.slice)?.title;
  return {
    ...rest,
    epic: {
      ...epic,
      title: known?.title ?? epic.id,
      ...(sliceTitle === undefined ? {} : { sliceTitle }),
    },
  };
}
