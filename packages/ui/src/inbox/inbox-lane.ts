// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { Button } from "../components/button";
import { Preferences } from "../theme/preferences";
import { PHASE_LABELS } from "../theme/tokens";
import { type EpicLane, type LaneCell, laneCells } from "./epic-lanes";
import { DECISIONS } from "./inbox-row";

/**
 * A line of an epic's card: it takes the card's four columns (`grid-cols-subgrid`), so its track
 * lines up with the stretches' headers. The one picked with j/k keeps the highlight the others
 * show on hover, and its scroll margin keeps it clear of the pinned search.
 */
const LANE =
  "col-span-full grid scroll-mt-[calc(var(--sp-sticky-top,9rem)+0.5rem)] scroll-mb-4 grid-cols-subgrid items-center rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-text/4 focus-within:bg-text/4 motion-reduce:transition-none";

/** The fill of a stretch that its phase's color does not give. */
const FILLS: Readonly<Record<LaneCell, string>> = {
  empty: "bg-text/10",
  past: "bg-text/35",
  current: "",
  done: "",
};

/**
 * A slice of an epic in its card: its id, its title linked to its change with the notices of its
 * row under it, a track of four stretches (Spec, Tests, Impl., Acept.) or what it waits for, and
 * on the right the button of its decision or, without one, who holds its change.
 */
@Component({
  selector: "sp-inbox-lane",
  imports: [RouterLink, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "listitem",
    "[class]": "current() ? classes + ' bg-text/4' : classes",
    "[attr.data-slice]": "lane().slice || null",
    "[attr.data-id]": "lane().change?.id ?? null",
    "[attr.data-state]": "lane().state.kind",
    "[attr.aria-current]": "current() || null",
  },
  template: `
    <span class="font-mono text-xs text-text-muted" data-slice-id>{{ lane().slice }}</span>
    <span class="flex min-w-0 flex-col gap-0.5 text-[13px]">
      <span class="min-w-0 truncate">
        @if (lane().change; as change) {
          <a class="font-medium text-text no-underline hover:underline" [routerLink]="['/changes', change.id]" [queryParams]="change.tab === undefined ? null : { tab: change.tab }" (focus)="picked.emit()">{{ lane().title }}</a>
        } @else {
          <span class="text-text" data-title>{{ lane().title }}</span>
        }
      </span>
      @if (lane().holds; as holds) {
        @if (holds.away; as away) {
          <span class="text-xs" style="color: var(--color-phase-review)" data-unheld>{{ t()('Su conversación (' + away + ') salió de su carpeta', 'Its conversation (' + away + ') left its folder') }}</span>
        } @else if (holds.orphan) {
          <span class="text-xs" style="color: var(--color-phase-review)" data-unheld>{{ t()('Ninguna conversación lo lleva', 'No conversation holds it') }}</span>
        }
        @if (holds.shared; as shared) {
          <span class="text-xs break-all" style="color: var(--color-phase-review)" data-shared>
            {{ t()('Comparte', 'Shares') }}
            @for (path of shared.paths; track path; let last = $last) {
              <code class="font-mono">{{ path }}</code>@if (!last) {,&ngsp;}
            }
            {{ t()('con', 'with') }} {{ shared.with.join(', ') }}
          </span>
        }
      }
    </span>
    @if (planned(); as line) {
      <span class="truncate rounded-md border border-dashed border-border px-2 text-xs leading-5 text-text-muted" data-planned>{{ line }}</span>
    } @else {
      <span class="grid grid-cols-4 gap-1" data-track [attr.role]="said() ? 'img' : null" [attr.aria-label]="said() || null" [attr.aria-hidden]="said() ? null : 'true'">
        @for (cell of cells(); track $index) {
          <span [class]="cellClass(cell, $index)" [attr.data-cell]="cell" [attr.data-marked]="marked($index) ? '' : null" [style.background]="cellColor(cell)"></span>
        }
      </span>
    }
    <span class="flex justify-end">
      @if (decision(); as decision) {
        <sp-button size="sm" [variant]="current() ? 'primary' : 'secondary'" (pressed)="open()">
          {{ t()(decisions[decision].action.es, decisions[decision].action.en) }}
        </sp-button>
      } @else if (lane().holds; as holds) {
        @if (holds.orphan) {
          <span class="text-xs whitespace-nowrap" style="color: var(--color-phase-review)" data-holder>{{ t()('Sin conversación', 'No conversation') }}</span>
        } @else if (holds.agent; as agent) {
          <span class="text-xs whitespace-nowrap text-text-muted" data-holder>{{ agent }}</span>
        }
      }
    </span>
  `,
})
export class InboxLane {
  readonly lane = input.required<EpicLane>();
  /** Picked with j/k: highlighted, with its decision as the main action. */
  readonly current = input(false);
  /** The person reached it with the keyboard or the pointer. */
  readonly picked = output();

  private readonly preferences = inject(Preferences);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly t = this.preferences.t;
  protected readonly classes = LANE;
  protected readonly decisions = DECISIONS;

  protected readonly cells = computed(() => laneCells(this.lane().state));

  /** The decision its change waits for, if any. */
  protected readonly decision = computed(() => {
    const { state } = this.lane();
    return state.kind === "open" ? state.decision : undefined;
  });

  /** In place of the track, what a slice without a change waits for. */
  protected readonly planned = computed(() => {
    const { state } = this.lane();
    if (state.kind !== "planned") return undefined;
    const t = this.t();
    const slices = new Intl.ListFormat(this.preferences.lang(), { type: "conjunction" }).format(
      state.waitsFor,
    );
    if (state.beforeApproval) {
      return slices === ""
        ? t("Puede arrancar en cuanto apruebes", "Can start once you approve")
        : t(`Tras ${slices}`, `After ${slices}`);
    }
    return slices === ""
      ? t("Listo para empezar", "Ready to start")
      : t(`Espera a ${slices}`, `Waits for ${slices}`);
  });

  /** What the track says to a screen reader: its phase and what it waits for; nothing unknown. */
  protected readonly said = computed(() => {
    const { state } = this.lane();
    const lang = this.preferences.lang();
    if (state.kind === "done") return PHASE_LABELS.done[lang];
    if (state.kind !== "open") return "";
    const phase = PHASE_LABELS[state.phase][lang];
    return state.decision === undefined
      ? phase
      : `${phase} · ${DECISIONS[state.decision].label[lang]}`;
  });

  /** The current stretch of a change that waits for the person is marked. */
  protected marked(index: number): boolean {
    return this.decision() !== undefined && this.cells()[index] === "current";
  }

  protected cellClass(cell: LaneCell, index: number): string {
    const mark = this.marked(index) ? " outline-1 outline-offset-2 outline-text" : "";
    return `h-1.5 rounded-full ${FILLS[cell]}${mark}`;
  }

  /** Its phase's color for the current stretch, and done's for a finished slice. */
  protected cellColor(cell: LaneCell): string | null {
    const { state } = this.lane();
    if (cell === "done") return "var(--color-phase-done)";
    return cell === "current" && state.kind === "open" ? `var(--color-phase-${state.phase})` : null;
  }

  /** Moves focus to the line's link, so Enter opens it, and brings the line into view. */
  focus(): void {
    this.host.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    this.host.scrollIntoView?.({ block: "nearest" });
  }

  protected open(): void {
    this.host.querySelector<HTMLAnchorElement>("a")?.click();
  }
}
