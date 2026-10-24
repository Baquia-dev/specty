// SPDX-License-Identifier: Apache-2.0
// Delegated mode in the UI (ADR 0010): a chip in the header while the agent decides for the
// person, a section in the preferences menu and a palette command to turn it on or off.
import { DialogRef } from "@angular/cdk/dialog";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Injectable,
  inject,
  input,
  resource,
} from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core";
import { LucideBot, LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { Commands } from "../components/command-palette";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Toasts } from "../components/toast";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

/** Delegated mode as the screens see it, read again whenever the source says something changed. */
@Injectable({ providedIn: "root" })
export class DelegationState {
  private readonly data = inject(SpectyData);
  private readonly read = resource({ loader: () => this.data.delegation() });
  /** Nothing while it loads, when it failed, or when the source cannot tell. */
  readonly current = computed(() => (this.read.hasValue() ? this.read.value() : undefined));

  constructor() {
    const stop = this.data.subscribe(() => this.read.reload());
    inject(DestroyRef).onDestroy(stop);
  }

  set(on: boolean): Promise<void> {
    return this.data.setDelegation(on).then(() => {
      this.read.reload();
    });
  }
}

/** Opens what fits: the warning to turn delegated mode on, or the confirmation to turn it off. */
function openDelegation(dialogs: Dialogs, state: DelegationState): void {
  const current = state.current();
  if (current === undefined) return;
  if (current.on) dialogs.open(TurnOffDelegation);
  else dialogs.open(TurnOnDelegation);
}

interface Piece {
  readonly text: string;
  readonly code: boolean;
}

/** A line of the warning as the CLI writes it: `code` goes between backticks. */
const piecesOf = (line: string): readonly Piece[] =>
  line.split("`").map((text, index) => ({ text, code: index % 2 === 1 }));

/** The warning in paragraphs, with its «- » lines together as one list. */
function blocksOf(lines: readonly string[]) {
  const blocks: { readonly items?: readonly string[]; readonly line?: string }[] = [];
  for (const line of lines) {
    const last = blocks.at(-1);
    if (!line.startsWith("- ")) blocks.push({ line });
    else if (last?.items !== undefined)
      blocks[blocks.length - 1] = { items: [...last.items, line.slice(2)] };
    else blocks.push({ items: [line.slice(2)] });
  }
  return blocks;
}

const when = (at: string | undefined, lang: Lang) =>
  at === undefined
    ? ""
    : new Intl.DateTimeFormat(lang, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(at));

/** The warning `specty delegate on` shows, and the explicit yes that turns it on. */
@Component({
  selector: "sp-turn-on-delegation",
  imports: [DialogFrame, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Activar el modo delegado', 'Turn delegated mode on')">
      <div class="flex flex-col gap-3 text-sm" data-warning>
        @for (block of blocks(); track $index) {
          @if (block.items; as items) {
            <ul class="m-0 flex list-disc flex-col gap-1 pl-5">
              @for (item of items; track $index) {
                <li>@for (piece of pieces(item); track $index) {@if (piece.code) {<code class="font-mono text-[0.9em]">{{ piece.text }}</code>} @else {{{ piece.text }}}}</li>
              }
            </ul>
          } @else {
            <p class="m-0">@for (piece of pieces(block.line ?? ''); track $index) {@if (piece.code) {<code class="font-mono text-[0.9em]">{{ piece.text }}</code>} @else {{{ piece.text }}}}</p>
          }
        }
      </div>
      <sp-button actions (pressed)="frame.close()">{{ t()('No, sigo decidiendo yo', 'No, I keep deciding') }}</sp-button>
      <sp-button actions variant="primary" (pressed)="turnOn()">{{ t()('Sí, que decida mi agente', 'Yes, let my agent decide') }}</sp-button>
    </sp-dialog>
  `,
})
export class TurnOnDelegation {
  private readonly ref = inject(DialogRef);
  private readonly state = inject(DelegationState);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly pieces = piecesOf;
  protected readonly blocks = computed(() =>
    blocksOf(this.state.current()?.warning[this.preferences.lang()] ?? []),
  );

  protected turnOn(): void {
    this.state.set(true).then(() => {
      this.ref.close();
      this.toasts.show(
        this.t()(
          "Modo delegado activado: tu agente toma tus decisiones.",
          "Delegated mode on: your agent makes your decisions.",
        ),
        "success",
      );
    }, this.failed);
  }
}

/** Since when the agent decides, and turning it off: the person decides again. */
@Component({
  selector: "sp-turn-off-delegation",
  imports: [DialogFrame, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Desactivar el modo delegado', 'Turn delegated mode off')">
      <p class="m-0 text-sm" data-since>
        {{ t()('Activo desde el ' + since() + '; lo activó ' + by() + '. Tu agente aprueba, decide el alcance, acepta, cierra y cancela por ti.', 'On since ' + since() + '; ' + by() + ' turned it on. Your agent approves, decides scope, accepts, closes and cancels for you.') }}
      </p>
      <p class="m-0 text-[13px] text-text-muted">{{ t()('Al desactivarlo, vuelves a decidir tú, en la UI o en la terminal.', 'Once it is off, you decide again, in the UI or in the terminal.') }}</p>
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" (pressed)="turnOff()">{{ t()('Desactivar', 'Turn off') }}</sp-button>
    </sp-dialog>
  `,
})
export class TurnOffDelegation {
  private readonly ref = inject(DialogRef);
  private readonly state = inject(DelegationState);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  protected readonly t = this.preferences.t;
  protected readonly since = computed(() =>
    when(this.state.current()?.at, this.preferences.lang()),
  );
  protected readonly by = computed(() => this.state.current()?.by ?? "?");

  protected turnOff(): void {
    this.state.set(false).then(() => {
      this.ref.close();
      this.toasts.show(
        this.t()(
          "Modo delegado desactivado: vuelves a decidir tú.",
          "Delegated mode off: you decide again.",
        ),
        "success",
      );
    }, this.failed);
  }
}

/**
 * In the header while delegated mode is on, so the person never forgets the agent decides for
 * them; it opens the confirmation to turn it off. It also adds the palette command.
 */
@Component({
  selector: "sp-delegation-chip",
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "contents" },
  template: `
    @if (on()) {
      <button type="button" class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 px-2.5 font-sans text-[13px] font-medium whitespace-nowrap" style="color: var(--color-phase-review); background: var(--color-phase-review-bg)" [attr.aria-label]="t()('Modo delegado activo: tu agente decide por ti', 'Delegated mode on: your agent decides for you')" (click)="open()">
        <svg [lucideIcon]="icon" size="14" aria-hidden="true"></svg>
        <span class="hidden sm:inline">{{ t()('Modo delegado', 'Delegated mode') }}</span>
      </button>
    }
  `,
})
export class DelegationChip {
  private readonly state = inject(DelegationState);
  private readonly dialogs = inject(Dialogs);
  protected readonly t = inject(Preferences).t;
  protected readonly icon = LucideBot;
  protected readonly on = computed(() => this.state.current()?.on === true);

  constructor() {
    inject(Commands).register({
      id: "delegation",
      label: { es: "Modo delegado…", en: "Delegated mode…" },
      run: () => this.open(),
    });
  }

  protected open(): void {
    openDelegation(this.dialogs, this.state);
  }
}

/** The section of the preferences menu: whether the agent decides, and turning it on or off. */
@Component({
  selector: "sp-delegation-setting",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state.current(); as delegation) {
      <fieldset class="m-0 border-0 p-0">
        <legend [class]="legendClass()">{{ t()('Modo delegado', 'Delegated mode') }}</legend>
        <div class="flex items-center justify-between gap-3">
          <p class="m-0 text-[13px] text-text-muted">{{ delegation.on ? t()('Activo: tu agente decide por ti.', 'On: your agent decides for you.') : t()('Apagado: tu agente te pide cada decisión.', 'Off: your agent asks you for each decision.') }}</p>
          <sp-button size="sm" (pressed)="open()">{{ delegation.on ? t()('Desactivar…', 'Turn off…') : t()('Activar…', 'Turn on…') }}</sp-button>
        </div>
      </fieldset>
    }
  `,
})
export class DelegationSetting {
  /** The menu's own legend style. */
  readonly legendClass = input("");

  protected readonly state = inject(DelegationState);
  private readonly dialogs = inject(Dialogs);
  protected readonly t = inject(Preferences).t;

  protected open(): void {
    openDelegation(this.dialogs, this.state);
  }
}
