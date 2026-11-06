// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from "@angular/core";
import { type ListedChange, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import {
  asksForSlices,
  type EpicLane,
  epicLanes,
  LANE_STEPS,
  type SliceAnswer,
} from "./epic-lanes";
import { InboxLane } from "./inbox-lane";

/**
 * The card of an epic in a section of the Inbox: the epic's own row heads it, projected with
 * `data-epic-head`, and below it, under the headers of the four stretches, a line per slice of its
 * Cortes section, in its order, whether it has a change or not. While its slices may start or run,
 * it asks the source for the change of each one, also the archived ones, and again with each
 * notice of the source; in acceptance, closing or done, every line is finished.
 */
@Component({
  selector: "sp-inbox-epic",
  imports: [InboxLane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "my-1.5 flex flex-col gap-1 rounded-xl border border-border/80 bg-surface/50 px-3 py-2.5",
    "[attr.data-epic-group]": "epic().id",
  },
  template: `
    <ng-content select="[data-epic-head]" />
    @if (lanes().length > 0) {
      <div role="list" class="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(7rem,11rem)_auto] gap-x-3 border-l-2 border-border pl-3" [attr.aria-label]="t()('Cortes de ' + epic().title, 'Slices of ' + epic().title)" data-epic-lanes>
        <div class="col-span-full grid grid-cols-subgrid px-2" aria-hidden="true" data-lane-steps>
          <span class="col-start-3 grid grid-cols-4 gap-1">
            @for (step of steps; track step.es) {
              <span class="text-center text-[10px] font-medium tracking-wider text-text-muted uppercase">{{ t()(step.es, step.en) }}</span>&ngsp;
            }
          </span>
        </div>
        @for (lane of lanes(); track lane.key) {
          <sp-inbox-lane [lane]="lane" [current]="isSelected(lane)" (picked)="pick(lane)" />
        }
      </div>
    }
  `,
})
export class InboxEpic {
  readonly epic = input.required<ListedChange>();
  /** Its slices loaded, whatever their state: the block's. */
  readonly slices = input<readonly ListedChange[]>([]);
  /** The change picked with j/k in the Inbox: a line of this card may be it. */
  readonly selected = input<string | undefined>(undefined);
  /** The change of the line the person reached with the keyboard or the pointer. */
  readonly picked = output<string>();

  protected readonly t = inject(Preferences).t;
  protected readonly steps = LANE_STEPS;
  private readonly lines = viewChildren(InboxLane);
  /** The source, to ask for the change of each slice; none where nothing provides it. */
  private readonly data = inject(SpectyData, { optional: true });

  /** The epic whose slices' changes the card asks for: only while they may start or run. */
  private readonly asking = computed(() => {
    const epic = this.epic();
    return asksForSlices(epic.phase) ? epic.id : undefined;
  });

  /** The last answer of the source, for the epic it was asked about. */
  private readonly told = signal<
    { readonly epic: string; readonly answer: SliceAnswer } | undefined
  >(undefined);

  /** What the source said of this epic: its answer, that it cannot tell, or nothing yet. */
  private readonly answer = computed((): SliceAnswer => {
    const told = this.told();
    return told !== undefined && told.epic === this.asking() ? told.answer : { kind: "waiting" };
  });

  protected readonly lanes = computed(() => epicLanes(this.epic(), this.slices(), this.answer()));

  /** The changes of its lines, in their order: where j/k stop after the epic's row. */
  readonly stops = computed(() =>
    this.lanes().flatMap((lane) => (lane.change === undefined ? [] : [lane.change.id])),
  );

  constructor() {
    // Asked by hand and not with a resource: the Inbox stays stable while the source answers.
    effect((onCleanup) => {
      const epic = this.asking();
      if (epic === undefined) return;
      let latest = 0;
      const ask = (): void => {
        const mine = ++latest;
        const keep = (answer: SliceAnswer) => {
          if (mine === latest) this.told.set({ epic, answer });
        };
        void (this.data?.sliceChanges(epic) ?? Promise.resolve(undefined)).then(
          (changes) =>
            keep(changes === undefined ? { kind: "untold" } : { kind: "given", changes }),
          () => keep({ kind: "waiting" }),
        );
      };
      ask();
      const stop = this.data?.subscribe(ask);
      onCleanup(() => {
        latest = -1;
        stop?.();
      });
    });
  }

  /** Focuses the line of the change `id`, if the card has it. */
  focus(id: string): boolean {
    const line = this.lines().find((item) => item.lane().change?.id === id);
    line?.focus();
    return line !== undefined;
  }

  protected isSelected(lane: EpicLane): boolean {
    return lane.change !== undefined && lane.change.id === this.selected();
  }

  protected pick(lane: EpicLane): void {
    if (lane.change !== undefined) this.picked.emit(lane.change.id);
  }
}
