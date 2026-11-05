// SPDX-License-Identifier: Apache-2.0
import {
  computed,
  DestroyRef,
  Injectable,
  InjectionToken,
  inject,
  resource,
  type Signal,
} from "@angular/core";
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
 * previous views on screen meanwhile.
 */
@Injectable({ providedIn: "root" })
export class ChangesStore {
  private readonly data = inject(SpectyData);
  private readonly derive = inject(DERIVER);

  readonly views = resource({ loader: async () => this.derive(await this.data.changes()) });

  readonly all: Signal<readonly ChangeView[]> = computed(() =>
    this.views.hasValue() ? this.views.value() : [],
  );
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
    const stop = this.data.subscribe(() => this.views.reload());
    inject(DestroyRef).onDestroy(stop);
  }

  /**
   * The change `id`: among the loaded changes or, when they leave it out (a finished change the
   * Inbox has not loaded), asked to the source by its id, and again whenever the source says
   * something changed. Called in an injection context, as `resource`: it lasts as long as its caller.
   */
  byId(id: Signal<string>): FoundChange {
    const loaded = computed(() => this.all().find((view) => view.id === id()));
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
      view: computed(
        () => loaded() ?? withEpicTitle(asked.hasValue() ? asked.value() : undefined, this.all()),
      ),
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

/** `view` with the title of its epic when the epic is loaded, as the list derives it. */
function withEpicTitle(
  view: ChangeView | undefined,
  loaded: readonly ChangeView[],
): ChangeView | undefined {
  const epic = view?.epic;
  const title = loaded.find((other) => other.id === epic?.id)?.title;
  return view === undefined || epic === undefined || title === undefined
    ? view
    : { ...view, epic: { ...epic, title } };
}
