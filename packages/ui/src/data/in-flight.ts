// SPDX-License-Identifier: Apache-2.0
import { Injectable, signal } from "@angular/core";

/** A decision on a change that can take minutes: accepting its result or confirming its closing. */
export interface InFlightAction {
  readonly kind: "accept" | "close";
}

/**
 * The acceptances and closings this tab sent that the server has not answered yet, by change:
 * their dialogs close at once, and the header and the sticky bar follow them here. Root, so they
 * outlive leaving the change's page within the UI, but not a reload.
 */
@Injectable({ providedIn: "root" })
export class InFlight {
  private readonly running = signal<ReadonlyMap<string, InFlightAction>>(new Map());

  /** Notes the action on the change while `pending` runs, and gives `pending` back. */
  run<T>(change: string, kind: InFlightAction["kind"], pending: Promise<T>): Promise<T> {
    this.running.update((running) => new Map(running).set(change, { kind }));
    return pending.finally(() =>
      this.running.update((running) => {
        const rest = new Map(running);
        rest.delete(change);
        return rest;
      }),
    );
  }

  /** What runs on the change, read from a signal: a `computed` or a template that asks follows it. */
  of(change: string): InFlightAction | undefined {
    return this.running().get(change);
  }
}
