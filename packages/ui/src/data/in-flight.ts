// SPDX-License-Identifier: Apache-2.0
import { Injectable, inject, signal } from "@angular/core";
import { SpectyData } from "./records";

/** A decision on a change that can take minutes: accepting its result or confirming its closing. */
export interface InFlightAction {
  readonly kind: "accept" | "close";
  /** The last line the server said of it, without the terminal's mark: why it waits, say. */
  readonly note?: string;
}

/**
 * The acceptances and closings this tab sent that the server has not answered yet, by change:
 * their dialogs close at once, and the header and the sticky bar follow them here. Root, so they
 * outlive leaving the change's page within the UI, but not a reload.
 */
@Injectable({ providedIn: "root" })
export class InFlight {
  private readonly source = inject(SpectyData);
  private readonly running = signal<ReadonlyMap<string, InFlightAction>>(new Map());

  /**
   * Notes the action on the change while `pending` runs, with the last line the server says of
   * that action on that change: one of its events without a line, as its end, leaves none. Gives
   * `pending` back.
   */
  run<T>(change: string, kind: InFlightAction["kind"], pending: Promise<T>): Promise<T> {
    this.note(change, { kind });
    const stop = this.source.watchActions((told) => {
      if (told.change !== change || told.action !== kind) return;
      this.note(change, told.note === undefined ? { kind } : { kind, note: told.note });
    });
    return pending.finally(() => {
      stop();
      this.running.update((running) => {
        const rest = new Map(running);
        rest.delete(change);
        return rest;
      });
    });
  }

  private note(change: string, action: InFlightAction): void {
    this.running.update((running) => new Map(running).set(change, action));
  }

  /** What runs on the change, read from a signal: a `computed` or a template that asks follows it. */
  of(change: string): InFlightAction | undefined {
    return this.running().get(change);
  }
}
