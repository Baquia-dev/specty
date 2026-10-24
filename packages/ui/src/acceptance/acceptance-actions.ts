// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { Button } from "../components/button";
import type { RunRecord } from "../data/progress";
import type { ChangeView } from "../data/records";
import { SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { type FullState, fullLine, fullStateOf, ResultDialogs } from "./result-dialogs";

/**
 * The decision on the result: ask for adjustments or accept. In the page header and, compact, in
 * the sticky bar, as the decision on the spec is in review.
 */
@Component({
  selector: "sp-acceptance-actions",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col items-end gap-1.5 max-lg:items-start",
    role: "group",
    "[attr.aria-label]": "t()('Decisión sobre el resultado', 'Decision on the result')",
    "[attr.data-compact]": "compact() || null",
  },
  template: `
    <div class="flex flex-wrap gap-2">
      <sp-button [size]="compact() ? 'sm' : 'md'" (pressed)="dialogs.adjust(change())">{{ t()('Pedir ajustes…', 'Ask for adjustments…') }}</sp-button>
      <sp-button variant="primary" [size]="compact() ? 'sm' : 'md'" (pressed)="dialogs.accept(change(), full)">{{ t()('Aceptar resultado', 'Accept result') }}</sp-button>
    </div>
    @if (!compact() && full(); as state) {
      <p class="m-0 text-xs" [style.color]="said(state).tone" data-full-hint>{{ said(state).text }}</p>
    }
  `,
})
export class AcceptanceActions {
  readonly change = input.required<ChangeView>();
  /** In the sticky bar: small buttons, and no line about the full verification. */
  readonly compact = input(false);

  protected readonly dialogs = inject(ResultDialogs);
  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  /** The run streaming in this change: one with no task is the full verification. */
  private readonly streaming = signal<RunRecord | undefined>(undefined);
  protected readonly full = computed(() => fullStateOf(this.change(), this.streaming()));
  protected readonly said = (state: FullState) => fullLine(state, this.preferences.lang());

  constructor() {
    const id = computed(() => this.change().id);
    effect((onCleanup) => {
      onCleanup(this.source.watchRun(id(), (run) => this.streaming.set(run)));
    });
  }
}
