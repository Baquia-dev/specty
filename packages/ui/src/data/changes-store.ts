// SPDX-License-Identifier: Apache-2.0
import {
  computed,
  DestroyRef,
  Injectable,
  InjectionToken,
  inject,
  PendingTasks,
  resource,
  type Signal,
} from "@angular/core";
import { FinishedPages } from "./finished-pages";
import {
  type ChangeRecord,
  type ChangeView,
  type DeriveRequest,
  type DeriveResponse,
  SpectyData,
} from "./records";

const RECENT = 5;

export type Deriver = (records: readonly ChangeRecord[]) => Promise<readonly ChangeView[]>;

/**
 * How views are derived: in a web worker, bundled on its own, so core's parser (with zod and yaml)
 * never weighs on the main thread. Where no worker starts (an MCP App's sandbox, whose CSP blocks
 * it, or jsdom), in the main thread, with the derivation in a chunk loaded on first use: the main
 * thread's own code imports core only through its light entry.
 */
export const DERIVER = new InjectionToken<Deriver>("DERIVER", {
  providedIn: "root",
  factory: () => {
    const worker = startWorker();
    if (worker === undefined) return inThread;
    const waiting = new Map<number, { readonly records: readonly ChangeRecord[]; done: Done }>();
    let broken = false;
    let next = 0;
    worker.addEventListener("message", (event: MessageEvent<DeriveResponse>) => {
      waiting.get(event.data.id)?.done(event.data.views);
      waiting.delete(event.data.id);
    });
    // A worker the page refuses after starting it: what it was asked, and all after, derive here.
    worker.addEventListener("error", () => {
      broken = true;
      worker.terminate();
      for (const { records, done } of waiting.values()) void inThread(records).then(done);
      waiting.clear();
    });
    inject(DestroyRef).onDestroy(() => worker.terminate());
    return (records) => {
      if (broken) return inThread(records);
      return new Promise((done) => {
        const request: DeriveRequest = { id: next++, records };
        waiting.set(request.id, { records, done });
        worker.postMessage(request);
      });
    };
  },
});

type Done = (views: readonly ChangeView[]) => void;

function startWorker(): Worker | undefined {
  if (typeof Worker === "undefined") return undefined;
  try {
    return new Worker(new URL("./derive.worker", import.meta.url), { type: "module" });
  } catch {
    return undefined;
  }
}

/** Derives in the main thread: where a worker cannot start, as in an MCP App (ADR 0015). */
export const inThread: Deriver = async (records) => (await import("./views")).deriveViews(records);

/**
 * The changes as the screens see them. It reads from whatever `SpectyData` is provided, derives
 * the views with the `DERIVER` and reloads when the source says something changed, keeping the
 * previous views on screen meanwhile. The finished changes the Inbox shows come in pages, apart.
 */
@Injectable({ providedIn: "root" })
export class ChangesStore {
  private readonly data = inject(SpectyData);
  private readonly derive = inject(DERIVER);

  readonly views = resource({ loader: async () => this.derive(await this.data.changes()) });
  /** The pages of finished changes the Inbox asked for (`data/finished-pages.ts`). */
  readonly pages = new FinishedPages(this.data, this.derive, inject(PendingTasks));

  private readonly listed = computed(() => (this.views.hasValue() ? this.views.value() : []));
  /** The open changes: waiting for the person, in progress, or whose folder was lost. */
  readonly open = computed(() => this.listed().filter((view) => !isFinished(view)));
  /**
   * The finished changes of the loaded pages, in their order, each with its epic as known: the
   * epic open or loaded in a page, or else the title the page gives.
   */
  readonly finished = computed(() => {
    const loaded = new Map([...this.open(), ...this.pages.views()].map((view) => [view.id, view]));
    const titles = this.pages.epics();
    return this.pages.views().map((view) => withEpic(view, loaded, titles));
  });
  /** Every change loaded: those the source lists and those of the pages, each once. */
  readonly all: Signal<readonly ChangeView[]> = computed(() => {
    const listed = this.listed();
    const ids = new Set(listed.map((view) => view.id));
    return [...listed, ...this.finished().filter((view) => !ids.has(view.id))];
  });
  /** Waiting for the person, the longest first. */
  readonly decisions = computed(() =>
    this.all()
      .filter((view) => view.decision !== undefined)
      .toSorted((a, b) => a.phaseSince.localeCompare(b.phaseSince)),
  );
  /** In progress without a pending decision. */
  readonly active = computed(() =>
    this.all().filter(
      (view) => view.decision === undefined && view.phase !== "done" && view.phase !== "cancelled",
    ),
  );
  /** Finished or cancelled, the newest first. */
  readonly recent = computed(() =>
    this.all()
      .filter((view) => view.phase === "done" || view.phase === "cancelled")
      .toSorted((a, b) => b.phaseSince.localeCompare(a.phaseSince))
      .slice(0, RECENT),
  );

  constructor() {
    const stop = this.data.subscribe(() => {
      this.views.reload();
      void this.pages.reload();
    });
    inject(DestroyRef).onDestroy(stop);
  }

  /**
   * The change `id`: among the changes the source lists, whole, or, when they leave it out (a
   * finished change, even one a page of the Inbox brought), asked to the source by its id, and
   * again whenever the source says something changed. Called in an injection context, as
   * `resource`: it lasts as long as its caller.
   */
  byId(id: Signal<string>): FoundChange {
    const loaded = computed(() => this.listed().find((view) => view.id === id()));
    const asked = resource({
      params: () => (this.views.hasValue() && loaded() === undefined ? id() : undefined),
      loader: async ({ params }) => {
        const record = await this.data.change(params);
        return record === undefined ? undefined : (await this.derive([record]))[0];
      },
    });
    const stop = this.data.subscribe(() => asked.reload());
    inject(DestroyRef).onDestroy(stop);
    return {
      view: computed(() => {
        const view = asked.hasValue() ? asked.value() : undefined;
        const all = new Map(this.all().map((other) => [other.id, other]));
        return loaded() ?? (view === undefined ? undefined : withEpic(view, all, {}));
      }),
      missing: computed(
        () =>
          loaded() === undefined &&
          (asked.status() === "error" ||
            (asked.status() === "resolved" && asked.value() === undefined)),
      ),
    };
  }
}

/** A change looked for by its id, as its page reads it. */
export interface FoundChange {
  /** Its view, once known. */
  readonly view: Signal<ChangeView | undefined>;
  /** Neither the loaded changes nor the source have it, or the source failed to look for it. */
  readonly missing: Signal<boolean>;
}

function isFinished(view: ChangeView): boolean {
  return view.phase === "done" || view.phase === "cancelled";
}

/**
 * `view` with its epic as the list derives it: the title of the epic when it is loaded, or else the
 * one in `titles`, and the title the loaded epic gives its slice.
 */
function withEpic(
  view: ChangeView,
  loaded: ReadonlyMap<string, ChangeView>,
  titles: Readonly<Record<string, string>>,
): ChangeView {
  const { epic } = view;
  if (epic === undefined) return view;
  const own = loaded.get(epic.id);
  const title = own?.title ?? titles[epic.id];
  const sliceTitle = own?.slices?.find((slice) => slice.id === epic.slice)?.title;
  return {
    ...view,
    epic: {
      ...epic,
      ...(title === undefined ? {} : { title }),
      ...(sliceTitle === undefined ? {} : { sliceTitle }),
    },
  };
}
