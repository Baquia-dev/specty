// SPDX-License-Identifier: Apache-2.0
import { NgTemplateOutlet } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Injector,
  inject,
  input,
  linkedSignal,
  model,
  resource,
  viewChild,
} from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core";
import { LucideDynamicIcon } from "@lucide/angular";
import {
  type DiffFile,
  type DiffFileStatus,
  type DiffHunk,
  type DiffLine,
  type DiffLineKind,
  splitRows,
} from "../data/diff";
import type { Bilingual } from "../data/records";
import { type FileColors, HIGHLIGHT, type LineSpan, spansOf } from "../highlight/highlight";
import { Preferences } from "../theme/preferences";
import { LucideChevronDown } from "./icons";

export type DiffMode = "unified" | "split";

/** Past this many lines a file shows only its first ones, until the person asks for the rest. */
export const LONG_FILE = 60;
export const PREVIEW_LINES = 40;

/** The hunks with only their first `limit` lines in all, and how many lines were left out. */
export function firstLines(
  hunks: readonly DiffHunk[],
  limit: number,
): { readonly hunks: readonly DiffHunk[]; readonly hidden: number } {
  const total = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
  let left = limit;
  const kept: DiffHunk[] = [];
  for (const hunk of hunks) {
    if (left <= 0) break;
    kept.push({ ...hunk, lines: hunk.lines.slice(0, left) });
    left -= hunk.lines.length;
  }
  return { hunks: kept, hidden: Math.max(0, total - limit) };
}

/** «24 añadidas, 1 quitada»: what +24 −1 says to a screen reader. */
export function countsLabel(added: number, removed: number, lang: Lang): string {
  if (lang === "en") return `${added} added, ${removed} removed`;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "a" : "as"}`;
  return `${plural(added, "añadid")}, ${plural(removed, "quitad")}`;
}

interface LineView {
  readonly kind: DiffLineKind;
  readonly oldNumber?: number;
  readonly newNumber?: number;
  readonly spans: readonly LineSpan[];
}

/** «lib/», «attendance/», «panel.dart»: a path breaks only after a slash. */
export const pathParts = (path: string): readonly string[] => path.split(/(?<=\/)/);

type Row =
  | { readonly type: "hunk"; readonly hunk: DiffHunk }
  | { readonly type: "line"; readonly line: LineView }
  | { readonly type: "pair"; readonly left?: LineView; readonly right?: LineView };

/** The rows of the hunks in the chosen mode, each line in pieces with its colors, if any. */
function rowsOf(hunks: readonly DiffHunk[], mode: DiffMode, colors?: FileColors): readonly Row[] {
  const view = (line: DiffLine): LineView => ({ ...line, spans: spansOf(line, colors?.get(line)) });
  return hunks.flatMap((hunk): Row[] => [
    { type: "hunk", hunk },
    ...(mode === "unified"
      ? hunk.lines.map((line): Row => ({ type: "line", line: view(line) }))
      : splitRows(hunk).map(
          ({ left, right }): Row => ({
            type: "pair",
            ...(left === undefined ? {} : { left: view(left) }),
            ...(right === undefined ? {} : { right: view(right) }),
          }),
        )),
  ]);
}

const STATUS: Readonly<
  Record<DiffFileStatus, { readonly label: Bilingual; readonly tone: string }>
> = {
  added: { label: { es: "Nuevo", en: "Added" }, tone: "bg-diff-added text-diff-added-text" },
  deleted: {
    label: { es: "Borrado", en: "Deleted" },
    tone: "bg-diff-removed text-diff-removed-text",
  },
  modified: { label: { es: "Modificado", en: "Modified" }, tone: "border border-border" },
  renamed: { label: { es: "Renombrado", en: "Renamed" }, tone: "border border-border" },
};

/** Line background, changed words and sign, by kind of line: never by color alone. */
const LINE = {
  context: { bg: "", word: "", sign: "", tone: "" },
  added: {
    bg: "bg-diff-added",
    word: "rounded-[2px] bg-diff-added-word",
    sign: "+",
    tone: "text-diff-added-text",
  },
  removed: {
    bg: "bg-diff-removed",
    word: "rounded-[2px] bg-diff-removed-word",
    sign: "−",
    tone: "text-diff-removed-text",
  },
} as const satisfies Record<DiffLineKind, unknown>;

const EMPTY_SIDE = { bg: "bg-text/4", word: "", sign: "", tone: "" } as const;

let nextId = 0;

/**
 * One file of a diff (docs/ui.md, Visor de diffs): a header that folds it, and its hunks in the
 * chosen mode. Numbers and signs are hidden from a screen reader; a changed line begins with
 * «Añadida:» or «Quitada:» instead.
 */
@Component({
  selector: "sp-diff-file",
  imports: [LucideDynamicIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block overflow-hidden rounded-xl border border-border bg-surface",
    role: "group",
    "[attr.aria-label]": "file().path",
    "[attr.data-file]": "file().path",
  },
  template: `
    <button #toggle type="button" [class]="head" [class.border-b]="open()" [attr.aria-expanded]="open()" [attr.aria-controls]="open() ? bodyId : null" (click)="open.set(!open())" data-file-toggle>
      <svg class="mt-0.75 shrink-0 text-text-muted transition-transform" style="transition-duration: var(--duration-base)" size="14" aria-hidden="true" [lucideIcon]="chevron" [class.-rotate-90]="!open()"></svg>
      <!-- Beside the chevron, on as many lines as it needs: the path, its status and its counts. -->
      <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1" data-head>
        <span class="min-w-0 font-mono text-[13px] font-medium wrap-anywhere" data-path>@if (file().oldPath; as old) {<span class="text-text-muted">@for (part of parts(old); track $index) {{{ part }}<wbr />}</span><span aria-hidden="true"> → </span><span class="sr-only">{{ t()(', ahora ', ', now ') }}</span>}@for (part of parts(file().path); track $index) {{{ part }}<wbr />}</span>
        <!-- A button's name runs its pieces together: the commas keep them apart when read. -->
        <span class="sr-only">, </span>
        <span [class]="badge + ' ' + status().tone" data-status>{{ status().label[lang()] }}</span>
        <span class="ml-auto font-mono text-xs" aria-hidden="true" data-counts><span class="text-diff-added-text">+{{ file().additions }}</span>&nbsp;<span class="text-diff-removed-text">−{{ file().deletions }}</span></span>
        <span class="sr-only">, {{ counts() }}</span>
      </span>
    </button>
    @if (open()) {
      <div class="font-mono text-xs leading-5 [tab-size:4]" [id]="bodyId" [style.--diff-cols]="columns()" data-body>
        @if (file().binary) {
          <p class="m-0 px-3 py-2 font-sans text-[13px] text-text-muted">{{ t()('Archivo binario: no se muestra.', 'Binary file: not shown.') }}</p>
        } @else if (file().hunks.length === 0) {
          <p class="m-0 px-3 py-2 font-sans text-[13px] text-text-muted">{{ t()('Sin cambios de contenido.', 'No content changes.') }}</p>
        }
        @for (row of rows(); track $index) {
          @switch (row.type) {
            @case ('hunk') {
              <div class="bg-text/4 px-3 py-1 text-text-muted wrap-anywhere" [attr.tabindex]="$index === revealed() ? -1 : null" data-hunk><span aria-hidden="true">&#64;&#64; -{{ row.hunk.oldStart }},{{ row.hunk.oldLines }} +{{ row.hunk.newStart }},{{ row.hunk.newLines }} &#64;&#64;{{ row.hunk.section ? ' ' + row.hunk.section : '' }}</span><span class="sr-only">{{ t()('Desde la línea ', 'From line ') + (row.hunk.newLines > 0 ? row.hunk.newStart : row.hunk.oldStart) + (row.hunk.section ? ': ' + row.hunk.section : '') }}</span></div>
            }
            @case ('line') {
              <div [class]="'grid grid-cols-(--diff-cols) ' + lookOf(row.line).bg" [attr.tabindex]="$index === revealed() ? -1 : null" [attr.data-line]="row.line.kind">
                <span [class]="number" aria-hidden="true">{{ row.line.oldNumber }}</span>
                <span [class]="number" aria-hidden="true">{{ row.line.newNumber }}</span>
                <ng-container *ngTemplateOutlet="cells; context: { $implicit: row.line, last: true }" />
              </div>
            }
            @case ('pair') {
              <div class="grid grid-cols-(--diff-cols)" [attr.tabindex]="$index === revealed() ? -1 : null" data-pair>
                <span [class]="number + ' ' + lookOf(row.left).bg" aria-hidden="true">{{ row.left?.oldNumber }}</span>
                <ng-container *ngTemplateOutlet="cells; context: { $implicit: row.left, last: false }" />
                <span [class]="number + ' ' + lookOf(row.right).bg" aria-hidden="true">{{ row.right?.newNumber }}</span>
                <!-- A context line shows on both sides; a screen reader hears it once. -->
                <ng-container *ngTemplateOutlet="cells; context: { $implicit: row.right, last: true, echo: row.left?.kind === 'context' }" />
              </div>
            }
          }
        }
        @if (hidden() > 0) {
          <button type="button" class="block min-h-10 w-full cursor-pointer border-t border-border bg-text/4 font-sans text-[13px] text-text hover:bg-text/8" (click)="reveal()" data-more>{{ t()('Mostrar ' + hidden() + ' líneas más', 'Show ' + hidden() + ' more lines') }}</button>
        }
      </div>
    }
    <ng-template #cells let-line let-last="last" let-echo="echo">
      <span [class]="'select-none ' + lookOf(line).bg + ' ' + lookOf(line).tone" aria-hidden="true">{{ lookOf(line).sign }}</span>
      <span [class]="code + ' ' + lookOf(line).bg + (last ? ' pr-3' : ' border-r border-border pr-2')" [attr.aria-hidden]="echo ? 'true' : null" data-code>@if (spoken(line); as said) {<span class="sr-only">{{ said }}</span>}@for (span of line?.spans ?? []; track $index) {<span [class]="span.changed ? lookOf(line).word : ''" [class.italic]="span.italic === true" [style.color]="span.color ?? null" [attr.data-changed]="span.changed ? '' : null">{{ span.text }}</span>}</span>
    </ng-template>
  `,
})
export class DiffFileView {
  readonly file = input.required<DiffFile>();
  readonly mode = input<DiffMode>("unified");
  readonly open = model(true);

  private readonly preferences = inject(Preferences);
  private readonly injector = inject(Injector);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>("toggle");
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly bodyId = `sp-diff-file-${nextId++}`;
  protected readonly chevron = LucideChevronDown;
  protected readonly parts = pathParts;
  protected readonly head =
    "flex min-h-10 w-full cursor-pointer items-start gap-2.5 border-border bg-bg px-3 py-2.5 text-left text-text";
  protected readonly badge = "inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium";
  protected readonly number = "pr-2 text-right text-text-muted select-none";
  protected readonly code = "min-w-0 whitespace-pre-wrap wrap-anywhere";

  /**
   * A long file shows its first lines until «Mostrar N líneas más»; then, the first row it brought,
   * which takes the focus. A new file starts over.
   */
  protected readonly revealed = linkedSignal<DiffFile, number | undefined>({
    source: this.file,
    computation: () => undefined,
  });

  /** The code's colors: the diff shows plain at once, and in color once they are ready. */
  private readonly highlight = inject(HIGHLIGHT);
  private readonly colors = resource({
    params: () => this.file(),
    loader: ({ params }) => this.highlight(params),
  });

  protected readonly status = computed(() => STATUS[this.file().status]);
  protected readonly counts = computed(() =>
    countsLabel(this.file().additions, this.file().deletions, this.lang()),
  );

  private readonly shown = computed(() => {
    const { hunks } = this.file();
    const total = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    return this.revealed() !== undefined || total <= LONG_FILE
      ? { hunks, hidden: 0 }
      : firstLines(hunks, PREVIEW_LINES);
  });
  protected readonly hidden = computed(() => this.shown().hidden);
  protected readonly rows = computed(() =>
    rowsOf(
      this.shown().hunks,
      this.mode(),
      this.colors.hasValue() ? this.colors.value() : undefined,
    ),
  );

  /** Room for the longest line number, then the sign and the code; on each side when split. */
  protected readonly columns = computed(() => {
    const numbers = this.file().hunks.flatMap((hunk) =>
      hunk.lines.flatMap((line) => [line.oldNumber ?? 0, line.newNumber ?? 0]),
    );
    const digits = String(Math.max(0, ...numbers)).length;
    const side = `calc(${digits}ch + 1rem) 1.25rem minmax(0, 1fr)`;
    return this.mode() === "unified" ? `calc(${digits}ch + 1rem) ${side}` : `${side} ${side}`;
  });

  /** Brings the focus to this file's header, which also scrolls it into view. */
  focus(): void {
    this.toggle().nativeElement.focus();
  }

  /** How a line looks; the empty side of a split row, on a faint ground. */
  protected lookOf(line: LineView | undefined): (typeof LINE)[DiffLineKind] | typeof EMPTY_SIDE {
    return line === undefined ? EMPTY_SIDE : LINE[line.kind];
  }

  /** What a screen reader hears before a changed line, instead of its sign. */
  protected spoken(line: LineView | undefined): string {
    if (line?.kind === "added") return this.t()("Añadida: ", "Added: ");
    if (line?.kind === "removed") return this.t()("Quitada: ", "Removed: ");
    return "";
  }

  protected reveal(): void {
    this.revealed.set(this.rows().length);
    // The button is gone: the focus moves to the first line it brought.
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>("[data-body] [tabindex='-1']")?.focus(),
      { injector: this.injector },
    );
  }
}
