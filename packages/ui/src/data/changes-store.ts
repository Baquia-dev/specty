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
 * How views are derived. Always a web worker: it is bundled on its own, so core's parser (with
 * zod and yaml) never reaches the main bundle. A main-thread fallback would import core through
 * its index and pull all of it into a shared initial chunk; it waits for light entry points in
 * core. Tests, where jsdom has no Worker, provide a deriver that runs in the same thread.
 */
export const DERIVER = new InjectionToken<Deriver>("DERIVER", {
  providedIn: "root",
  factory: () => {
    if (typeof Worker === "undefined") {
      return () => Promise.reject(new Error("This environment has no Web Workers."));
    }
    const worker = new Worker(new URL("./derive.worker", import.meta.url), { type: "module" });
    const waiting = new Map<number, (views: readonly ChangeView[]) => void>();
    let next = 0;
    worker.addEventListener("message", (event: MessageEvent<DeriveResponse>) => {
      waiting.get(event.data.id)?.(event.data.views);
      waiting.delete(event.data.id);
    });
    inject(DestroyRef).onDestroy(() => worker.terminate());
    return (records) =>
      new Promise((resolve) => {
        const request: DeriveRequest = { id: next++, records };
        waiting.set(request.id, resolve);
        worker.postMessage(request);
      });
  },
});

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

  byId(id: Signal<string>): Signal<ChangeView | undefined> {
    return computed(() => this.all().find((view) => view.id === id()));
  }
}
