// SPDX-License-Identifier: Apache-2.0
import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type TemplateRef,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { KindBadge, PhaseBadge } from "../components/badge";
import { Preferences } from "../theme/preferences";
import type { MemoryFeature, MemoryGroup, MemoryItem } from "./memory-view";

/** The row of an entry, as the memory page draws it in every section. */
type EntryRow = TemplateRef<{ readonly $implicit: MemoryItem }>;

/** The rows of a group, indented under its head with the Inbox's line on the left. */
const ROWS = "flex flex-col gap-0.5 border-l-2 border-border pl-3";

/**
 * The head of a group of «Pendientes y mejoras»: the phase of its change, its title with the link
 * to its page and its kind (a slice, «Feature · C2», under its epic). A change the source does not
 * know shows its id, with no phase nor link; «Sin feature», the entries of no change.
 */
@Component({
  selector: "sp-memory-group-head",
  imports: [RouterLink, PhaseBadge, KindBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5", "data-group-head": "" },
  template: `
    @if (change(); as known) {
      @if (known.phase; as phase) {
        <sp-phase-badge [phase]="phase" />
      }
      @if (known.kind) {
        <a class="font-semibold text-text no-underline hover:underline" [routerLink]="['/changes', known.id]">{{ known.title }}</a>
      } @else {
        <span class="font-semibold break-all text-text">{{ known.title }}</span>
      }
      <sp-kind-badge [kind]="known.kind ?? 'standard'" [epic]="known.epic" [inEpic]="true" />
    } @else {
      <span class="font-semibold text-text-muted">{{ t()('Sin feature', 'No feature') }}</span>
    }
  `,
})
export class MemoryGroupHead {
  /** None for «Sin feature». */
  readonly change = input<MemoryFeature | undefined>(undefined);
  protected readonly t = inject(Preferences).t;
}

/**
 * A group of «Pendientes y mejoras»: its head and its entries below, indented. An epic goes in a
 * block, as in the Inbox (`sp-inbox-epic`), with its own entries and then each slice with its head
 * and its entries. The rows are the page's, given as a template, so they look and act as in the
 * other sections.
 */
@Component({
  selector: "sp-memory-group",
  imports: [NgTemplateOutlet, MemoryGroupHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "[class]": "box()", "[attr.data-group]": "group().change?.id ?? 'none'" },
  template: `
    <sp-memory-group-head [change]="group().change" />
    @if (group().items.length > 0) {
      <div role="list" [class]="rows">
        @for (item of group().items; track item.entry.id) {
          <ng-container *ngTemplateOutlet="row(); context: { $implicit: item }" />
        }
      </div>
    }
    @if (group().features.length > 0) {
      <div class="flex flex-col gap-1 pl-3" data-features>
        @for (feature of group().features; track feature.change?.id) {
          <div class="flex flex-col gap-1" [attr.data-feature]="feature.change?.id">
            <sp-memory-group-head [change]="feature.change" />
            <div role="list" [class]="rows">
              @for (item of feature.items; track item.entry.id) {
                <ng-container *ngTemplateOutlet="row(); context: { $implicit: item }" />
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class MemoryGroupView {
  readonly group = input.required<MemoryGroup>();
  readonly row = input.required<EntryRow>();
  protected readonly rows = ROWS;

  /** An epic, in its block; a feature alone and «Sin feature», as a head with its rows. */
  protected readonly box = computed(() => {
    const group = this.group();
    return group.features.length > 0 || group.change?.kind === "epic"
      ? "my-1.5 flex flex-col gap-1 rounded-xl border border-border/80 bg-surface/50 px-3 py-2.5"
      : "my-1 flex flex-col gap-1";
  });
}
