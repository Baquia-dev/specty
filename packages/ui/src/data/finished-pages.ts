// SPDX-License-Identifier: Apache-2.0
import { computed, type PendingTasks, type Signal, signal } from "@angular/core";
import type { Deriver } from "./changes-store";
import type { ChangeSummary, ChangeView } from "./records";
import type { FinishedPage, FinishedRequest, SpectyData } from "./source";

/** How many finished changes each page brings, as the local server gives them by default. */
const PAGE = 30;

/** What the finished changes are asked with: the Inbox's search, phase and sort, in its language. */
export type FinishedQuery = Omit<FinishedRequest, "offset" | "limit">;

/** What a page says besides its records. */
type Told = Omit<FinishedPage, "records">;

/**
 * The pages of finished changes loaded so far, for one query: the first when it is asked, the
 * next ones on demand, each change once and only by its summary (its page asks for the rest by its
 * id), and all of them again, from the first, on `reload`. A
 * new query leaves the pages before once its first page arrives, and an answer to a request older
 * than the last one is left out. Each request is a pending task, so the app is stable once it ends.
 */
export class FinishedPages {
  private readonly loaded = signal<readonly ChangeSummary[]>([]);
  private readonly told = signal<Told | undefined>(undefined);
  /** Where the next page starts: every record received, not only those not seen before. */
  private readonly next = signal(0);
  private readonly busy = signal(false);
  private readonly failure = signal<unknown>(undefined);
  private query: FinishedQuery | undefined;
  /** The number of the last request: the only one whose answer counts. */
  private asked = 0;

  /** The finished changes loaded, by their summary, in the order of the pages, each once. */
  readonly views: Signal<readonly ChangeSummary[]> = this.loaded.asReadonly();
  /** How many finished changes match the query. */
  readonly total = computed(() => this.told()?.total ?? 0);
  /** How many done and cancelled ones match the search, whatever the phase. */
  readonly counts = computed(() => this.told()?.counts ?? { done: 0, cancelled: 0 });
  /** How many finished changes there are, with no search nor phase. */
  readonly finished = computed(() => this.told()?.finished ?? 0);
  /** The title of the epic of each slice loaded, by the epic's id. */
  readonly epics = computed(() => this.told()?.epics ?? {});
  readonly loading = this.busy.asReadonly();
  /** Why the last request failed; nothing once one succeeds. */
  readonly error = this.failure.asReadonly();
  /** Some page has arrived: the Inbox can show the list. */
  readonly ready = computed(() => this.told() !== undefined);
  /** Every finished change that matches the query is loaded. */
  readonly complete = computed(() => this.ready() && this.next() >= this.total());

  constructor(
    private readonly source: SpectyData,
    private readonly derive: Deriver,
    private readonly tasks: Pick<PendingTasks, "add">,
  ) {}

  /** Asks the first page of `query`; the query already asked keeps its pages. */
  ask(query: FinishedQuery): Promise<void> {
    if (this.query !== undefined && sameQuery(this.query, query)) return Promise.resolve();
    this.query = query;
    return this.read(query, 0, PAGE, "replace");
  }

  /** Asks the page after the last one, unless one is on its way or none are left. */
  more(): Promise<void> {
    const query = this.query;
    if (query === undefined || this.busy() || this.complete() || this.failure() !== undefined)
      return Promise.resolve();
    return this.read(query, this.next(), PAGE, "append");
  }

  /** Reads again, from the first, as many as were loaded: the source says something changed. */
  reload(): Promise<void> {
    const query = this.query;
    if (query === undefined) return Promise.resolve();
    return this.read(query, 0, Math.max(this.next(), PAGE), "replace");
  }

  private async read(
    query: FinishedQuery,
    offset: number,
    limit: number,
    how: "replace" | "append",
  ): Promise<void> {
    const asked = ++this.asked;
    const done = this.tasks.add();
    this.busy.set(true);
    try {
      const { records, ...told } = await this.source.finished({ ...query, offset, limit });
      const summaries = (await this.derive(records)).map(summaryOf);
      if (asked !== this.asked) return;
      const before = how === "append" ? this.loaded() : [];
      this.loaded.set(unique([...before, ...summaries]));
      this.told.set(
        how === "append" ? { ...told, epics: { ...this.told()?.epics, ...told.epics } } : told,
      );
      // A page with nothing in it ends the list, even if the total said there were more.
      this.next.set(records.length === 0 ? told.total : offset + records.length);
      this.failure.set(undefined);
    } catch (error) {
      if (asked === this.asked) this.failure.set(error);
    } finally {
      if (asked === this.asked) this.busy.set(false);
      done();
    }
  }
}

function sameQuery(a: FinishedQuery, b: FinishedQuery): boolean {
  return a.query === b.query && a.phase === b.phase && a.sort === b.sort && a.lang === b.lang;
}

/** Each change once, where it first appears. */
function unique(summaries: readonly ChangeSummary[]): readonly ChangeSummary[] {
  const seen = new Set<string>();
  return summaries.filter((summary) => {
    if (seen.has(summary.id)) return false;
    seen.add(summary.id);
    return true;
  });
}

/** What the Inbox keeps of a finished change: what its row and the lists read, nothing else. */
function summaryOf(view: ChangeView): ChangeSummary {
  const { id, title, kind, epic, slices, phase, phaseSince, createdAt, closedAt, size } = view;
  return {
    id,
    title,
    kind,
    ...(epic === undefined ? {} : { epic }),
    ...(slices === undefined ? {} : { slices }),
    phase,
    phaseSince,
    createdAt,
    ...(closedAt === undefined ? {} : { closedAt }),
    ...(size === undefined ? {} : { size }),
    tasks: view.tasks,
    tab: view.tab,
  };
}
