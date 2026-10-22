// SPDX-License-Identifier: Apache-2.0
import { computed, DestroyRef, Injectable, inject, resource, type Signal } from "@angular/core";
import {
  type ChangeRecord,
  type ChangeView,
  type DeriveRequest,
  type DeriveResponse,
  SpectyData,
} from "./records";

const RECENT = 5;

/**
 * The changes as the screens see them. It reads from whatever `SpectyData` is provided, derives
 * the views in a web worker (or, without workers, in a chunk loaded on demand) and reloads when
 * the source says something changed, keeping the previous views on screen meanwhile.
 */
@Injectable({ providedIn: "root" })
export class ChangesStore {
  private readonly data = inject(SpectyData);
  private readonly worker =
    typeof Worker === "undefined"
      ? undefined
      : new Worker(new URL("./derive.worker", import.meta.url), { type: "module" });
  private readonly waiting = new Map<number, (views: readonly ChangeView[]) => void>();
  private nextRequest = 0;

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
    this.worker?.addEventListener("message", (event: MessageEvent<DeriveResponse>) => {
      this.waiting.get(event.data.id)?.(event.data.views);
      this.waiting.delete(event.data.id);
    });
    inject(DestroyRef).onDestroy(() => {
      stop();
      this.worker?.terminate();
    });
  }

  byId(id: Signal<string>): Signal<ChangeView | undefined> {
    return computed(() => this.all().find((view) => view.id === id()));
  }

  private async derive(records: readonly ChangeRecord[]): Promise<readonly ChangeView[]> {
    if (this.worker === undefined) return (await import("./views")).deriveViews(records);
    const request: DeriveRequest = { id: this.nextRequest++, records };
    return new Promise((resolve) => {
      this.waiting.set(request.id, resolve);
      this.worker?.postMessage(request);
    });
  }
}
