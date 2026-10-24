// SPDX-License-Identifier: Apache-2.0
import { computed, Injectable, inject, signal } from "@angular/core";
import { Preferences } from "../theme/preferences";
import { type Bilingual, SpectyData } from "./records";

/**
 * Whether the person may decide from this page, as the data source says once: a server the
 * agent started is read only. Until the source answers, decisions stay open; a refused one still
 * explains itself.
 */
@Injectable({ providedIn: "root" })
export class Decisions {
  private readonly preferences = inject(Preferences);
  private readonly reason = signal<Bilingual | undefined>(undefined);

  /** Why the person cannot decide here, in their language; empty when they can. */
  readonly blocked = computed(() => this.reason()?.[this.preferences.lang()] ?? "");
  readonly allowed = computed(() => this.blocked() === "");

  constructor() {
    inject(SpectyData)
      .readOnly()
      .then(
        (reason) => this.reason.set(reason),
        () => undefined,
      );
  }
}
