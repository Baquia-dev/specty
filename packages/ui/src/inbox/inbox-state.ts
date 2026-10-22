// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import { computed, effect, Injectable, inject, signal } from "@angular/core";
import {
  INBOX_GROUPS,
  INBOX_SORTS,
  type InboxFilters,
  type InboxGroup,
  type InboxPhase,
  type InboxSort,
} from "./inbox-view";

const KEYS = { group: "specty.inbox.group", sort: "specty.inbox.sort" } as const;

/**
 * How the Inbox is being looked at, with the URL always clean. Grouping and sorting are
 * preferences, remembered in this browser like the theme; the search and the phase are of the
 * moment: they last while the app is open, so going into a change and back keeps them.
 */
@Injectable({ providedIn: "root" })
export class InboxState {
  private readonly window = inject(DOCUMENT).defaultView;

  readonly query = signal("");
  readonly phase = signal<InboxPhase>("all");
  readonly group = signal<InboxGroup>(this.stored(KEYS.group, INBOX_GROUPS) ?? "state");
  readonly sort = signal<InboxSort>(this.stored(KEYS.sort, INBOX_SORTS) ?? "waiting");
  readonly filters = computed<InboxFilters>(() => ({
    query: this.query(),
    phase: this.phase(),
    group: this.group(),
    sort: this.sort(),
  }));
  /** A search or a phase narrows the list. */
  readonly filtered = computed(() => this.query().trim() !== "" || this.phase() !== "all");

  constructor() {
    effect(() => this.store(KEYS.group, this.group()));
    effect(() => this.store(KEYS.sort, this.sort()));
  }

  /** Shows everything again; grouping and sorting stay as chosen. */
  clear(): void {
    this.query.set("");
    this.phase.set("all");
  }

  /** Storage can be missing or throw (private mode, blocked site data): fall back to defaults. */
  private stored<T extends string>(key: string, allowed: readonly T[]): T | undefined {
    try {
      const value = this.window?.localStorage.getItem(key);
      return allowed.find((item) => item === value);
    } catch {
      return undefined;
    }
  }

  private store(key: string, value: string): void {
    try {
      this.window?.localStorage.setItem(key, value);
    } catch {
      // Not remembered across visits; the current choice still applies.
    }
  }
}
