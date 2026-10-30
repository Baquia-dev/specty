// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  viewChildren,
} from "@angular/core";
import type { DiffFile } from "../data/diff";
import { Preferences } from "../theme/preferences";
import { countsLabel, DiffFileView, type DiffMode, pathParts } from "./diff-file";
import { Segmented } from "./segmented";

const MODES: readonly DiffMode[] = ["unified", "split"];
/** The mode is a preference, remembered in this browser like the Acceptance view. */
const MODE_KEY = "specty.diff.mode";
/** Narrower than this, side by side does not fit: only the unified view. */
const WIDE = "(min-width: 640px)";

/**
 * A diff to read (docs/ui.md, Visor de diffs): a summary, the bar its user projects (what changes
 * to see), unified or side by side, the list of files and each file. On a phone, only unified.
 * The title and the bar stay in view while the diff scrolls by. With no files to show yet, it
 * shows the state its user projects (`[diffStatus]`), so the bar stays put.
 */
@Component({
  selector: "sp-diff-viewer",
  imports: [Segmented, DiffFileView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex min-w-0 flex-col gap-3" },
  template: `
    <!--
      Fixed under the change's compact bar (--sp-sticky-top) until the diff ends: the title, the
      bar and the mode, on the page's ground so the code passing under it does not show. Its
      padding reaches into the gaps around it, so it only adds room once fixed; with nothing in
      it, it takes none. In the chat it stays in place and paints no ground: there is no bar to
      stay under, and a band would cross the translucent panel.
    -->
    <div class="sticky top-[var(--sp-sticky-top,0px)] z-10 -my-3 flex flex-col gap-3 bg-bg py-3 [&:not(:has(>:not(:empty)))]:hidden embedded:static embedded:bg-transparent" data-bar>
      <ng-content select="[diffHeading]" />
      <div class="flex flex-wrap items-center justify-between gap-3 empty:hidden">
        <ng-content />
        @if (wide()) {
          <sp-segmented class="ml-auto" [label]="t()('Cómo ver los cambios', 'How to see the changes')" [hideLabel]="true" [options]="modes()" [value]="mode()" (valueChange)="choose($event)" data-mode />
        }
      </div>
    </div>
    @if (files() === undefined) {
      <ng-content select="[diffStatus]" />
    } @else {
      <!-- While another diff loads, this one stays, dimmed. -->
      <div class="flex flex-col gap-3 transition-opacity" [class.opacity-60]="busy()" [attr.aria-busy]="busy()" data-content>
        @if (list().length === 0) {
          <p class="m-0 text-sm text-text-muted" role="status" data-empty>{{ t()('No hay cambios.', 'No changes.') }}</p>
        } @else {
          <p class="m-0 text-[13px] text-text-muted" data-summary>@if (range(); as range) {<span class="font-mono text-xs">{{ range }}</span> · }{{ fileCount() }} · <span class="font-mono text-xs" aria-hidden="true"><span class="text-diff-added-text">+{{ additions() }}</span>&nbsp;<span class="text-diff-removed-text">−{{ deletions() }}</span></span><span class="sr-only">{{ counts() }}</span></p>
          @if (list().length > 1) {
            <ul class="m-0 list-none overflow-hidden rounded-xl border border-border bg-surface p-0" [attr.aria-label]="t()('Archivos cambiados', 'Changed files')" data-files>
              @for (file of list(); track file.path; let index = $index) {
                <li class="border-border not-first:border-t">
                  <button type="button" class="flex min-h-10 w-full cursor-pointer items-center gap-2.5 px-3 py-1 text-left text-text hover:bg-text/4" (click)="goTo(index)" data-goto>
                    <span class="min-w-0 flex-1 font-mono text-xs wrap-anywhere" data-path>@for (part of parts(file.path); track $index) {{{ part }}<wbr />}</span>
                    <span class="font-mono text-xs" aria-hidden="true" data-counts><span class="text-diff-added-text">+{{ file.additions }}</span>&nbsp;<span class="text-diff-removed-text">−{{ file.deletions }}</span></span>
                    <span class="sr-only">, {{ countsOf(file) }}</span>
                  </button>
                </li>
              }
            </ul>
          }
          @for (file of list(); track file.path) {
            <sp-diff-file [file]="file" [mode]="shownMode()" />
          }
        }
      </div>
    }
  `,
})
export class DiffViewer {
  /** The files, as `parseDiff` reads them; none while there is no diff to show (`[diffStatus]`). */
  readonly files = input.required<readonly DiffFile[] | undefined>();
  /** What the diff goes between, as «5d2a7b0 → 3c9d1e2»; none when unknown. */
  readonly range = input<string | undefined>(undefined);
  /** Another diff is on its way: this one stays, dimmed, until it arrives. */
  readonly busy = input(false);

  private readonly window = inject(DOCUMENT).defaultView;
  private readonly preferences = inject(Preferences);
  private readonly views = viewChildren(DiffFileView);
  protected readonly t = this.preferences.t;
  protected readonly parts = pathParts;

  protected readonly mode = signal<DiffMode>(this.stored() ?? "unified");
  protected readonly wide = signal(true);
  protected readonly shownMode = computed<DiffMode>(() => (this.wide() ? this.mode() : "unified"));

  protected readonly modes = computed(() => [
    { value: "unified", label: this.t()("Unificado", "Unified") },
    { value: "split", label: this.t()("Lado a lado", "Side by side") },
  ]);

  protected readonly list = computed(() => this.files() ?? []);
  protected readonly additions = computed(() =>
    this.list().reduce((sum, file) => sum + file.additions, 0),
  );
  protected readonly deletions = computed(() =>
    this.list().reduce((sum, file) => sum + file.deletions, 0),
  );
  protected readonly counts = computed(() =>
    countsLabel(this.additions(), this.deletions(), this.preferences.lang()),
  );
  protected readonly fileCount = computed(() => {
    const count = this.list().length;
    return count === 1
      ? this.t()("1 archivo", "1 file")
      : this.t()(`${count} archivos`, `${count} files`);
  });

  constructor() {
    const media = this.window?.matchMedia?.(WIDE);
    if (media !== undefined) {
      this.wide.set(media.matches);
      const listener = (event: MediaQueryListEvent) => this.wide.set(event.matches);
      media.addEventListener?.("change", listener);
      inject(DestroyRef).onDestroy(() => media.removeEventListener?.("change", listener));
    }
    effect(() => this.store(this.mode()));
  }

  protected countsOf(file: DiffFile): string {
    return countsLabel(file.additions, file.deletions, this.preferences.lang());
  }

  protected choose(value: string): void {
    const mode = MODES.find((item) => item === value);
    if (mode !== undefined) this.mode.set(mode);
  }

  /** Takes the person to a file: its header gets the focus, which scrolls it into view. */
  protected goTo(index: number): void {
    this.views()[index]?.focus();
  }

  /** Storage can be missing or throw (private mode, blocked site data): unified is the default. */
  private stored(): DiffMode | undefined {
    try {
      const value = this.window?.localStorage.getItem(MODE_KEY);
      return MODES.find((item) => item === value);
    } catch {
      return undefined;
    }
  }

  private store(mode: DiffMode): void {
    try {
      this.window?.localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Not remembered across visits; the current choice still applies.
    }
  }
}
