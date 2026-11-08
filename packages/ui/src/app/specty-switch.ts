// SPDX-License-Identifier: Apache-2.0
// Specty's switch in the UI (ARCHITECTURE §10): a switch in the header to turn Specty off, so
// nothing the agent does goes through it, or on again, with its log, and a palette command.
import { DialogRef } from "@angular/cdk/dialog";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Injectable,
  inject,
  resource,
} from "@angular/core";
import type { Lang } from "@baquia-dev/specty-core";
import { Button } from "../components/button";
import { Commands } from "../components/command-palette";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Toasts } from "../components/toast";
import { Tooltip } from "../components/tooltip";
import { Decisions } from "../data/decisions";
import { SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";

/** The switch as the screens see it, read again whenever the source says something changed. */
@Injectable({ providedIn: "root" })
class SwitchState {
  private readonly data = inject(SpectyData);
  private readonly read = resource({ loader: () => this.data.specty() });
  /** Nothing while it loads, when it failed, or when the source does not know the switch. */
  readonly current = computed(() => (this.read.hasValue() ? this.read.value() : undefined));

  constructor() {
    const stop = this.data.subscribe(() => this.read.reload());
    inject(DestroyRef).onDestroy(stop);
  }

  set(on: boolean): Promise<void> {
    return this.data.setSpecty(on).then(() => {
      this.read.reload();
    });
  }
}

/** Opens what fits: what turning it off does, or since when it is off and turning it on. */
function openSwitch(dialogs: Dialogs, state: SwitchState): void {
  const current = state.current();
  if (current === undefined) return;
  if (current.on) dialogs.open(TurnSpectyOff);
  else dialogs.open(TurnSpectyOn);
}

/** «8 nov, 10:30» / «Nov 8, 10:30»; nothing without a time. */
const when = (at: string | undefined, lang: Lang) =>
  at === undefined
    ? ""
    : new Intl.DateTimeFormat(lang, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(at));

/** The log in a dialog: each change of state, who and when, the most recent first. */
@Component({
  selector: "sp-switch-log",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-2">
      <h3 class="m-0 text-[13px] font-semibold text-text-muted">{{ t()('Registro', 'Log') }}</h3>
      @if (entries().length === 0) {
        <p class="m-0 text-[13px] text-text-muted">{{ t()('Aún no se ha apagado nunca.', 'It has never been turned off.') }}</p>
      } @else {
        <ul data-log class="m-0 flex max-h-48 list-none flex-col gap-1 overflow-y-auto p-0 text-[13px]">
          @for (entry of entries(); track $index) {
            <li class="flex flex-wrap gap-x-2">
              <span class="font-medium">{{ entry.on ? t()('Encendido', 'On') : t()('Apagado', 'Off') }}</span>
              <span class="text-text-muted">· {{ entry.by }} · {{ entry.when }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
class SwitchLog {
  private readonly state = inject(SwitchState);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly entries = computed(() =>
    (this.state.current()?.log ?? []).map((entry) => ({
      ...entry,
      when: when(entry.at, this.preferences.lang()),
    })),
  );
}

/** Turning Specty off: what stops going through it, the log and the confirmation. */
@Component({
  selector: "sp-turn-specty-off",
  imports: [DialogFrame, Button, SwitchLog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Apagar Specty', 'Turn Specty off')">
      <p class="m-0 text-sm">{{ t()('Con Specty apagado, nada de lo que hace tu agente pasa por Specty: el guard deja pasar todas sus acciones, los hooks de git no bloquean commits, el fin de turno no revisa nada y ', 'With Specty off, nothing your agent does goes through Specty: the guard lets every action through, the git hooks block no commit, the end of turn checks nothing and ') }}<code class="font-mono text-[0.9em]">specty next</code>{{ t()(' le dice que trabaje sin el flujo.', ' tells it to work without the flow.') }}</p>
      <p class="m-0 text-[13px] text-text-muted">{{ t()('Los cambios abiertos se quedan en su fase y siguen al volver a encenderlo. Vale para este clon y todas sus worktrees.', 'Open changes stay in their phase and go on once you turn it back on. It applies to this clone and all its worktrees.') }}</p>
      <sp-switch-log />
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" [disabledReason]="decisions.blocked()" (pressed)="turn(false)">{{ t()('Apagar', 'Turn off') }}</sp-button>
    </sp-dialog>
  `,
})
class TurnSpectyOff {
  protected readonly turn = turning(
    "Specty apagado: tu agente trabaja sin el flujo.",
    "Specty off: your agent works without the flow.",
  );
  protected readonly decisions = inject(Decisions);
  protected readonly t = inject(Preferences).t;
}

/** Turning Specty on again: since when it is off and who turned it off, the log and the confirmation. */
@Component({
  selector: "sp-turn-specty-on",
  imports: [DialogFrame, Button, SwitchLog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Encender Specty', 'Turn Specty on')">
      <p class="m-0 text-sm" data-since>{{ t()('Apagado desde el ' + since() + '; lo apagó ' + by() + '.', 'Off since ' + since() + '; ' + by() + ' turned it off.') }}</p>
      <p class="m-0 text-[13px] text-text-muted">{{ t()('Al encenderlo, el guard, los hooks de git, el fin de turno y ', 'Once it is on, the guard, the git hooks, the end of turn and ') }}<code class="font-mono text-[0.9em]">specty next</code>{{ t()(' vuelven a actuar como antes, y los cambios abiertos siguen en la fase en que estaban.', ' act as before again, and open changes go on in the phase they were in.') }}</p>
      <sp-switch-log />
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions variant="primary" [disabledReason]="decisions.blocked()" (pressed)="turn(true)">{{ t()('Encender', 'Turn on') }}</sp-button>
    </sp-dialog>
  `,
})
class TurnSpectyOn {
  private readonly state = inject(SwitchState);
  private readonly preferences = inject(Preferences);
  protected readonly turn = turning(
    "Specty encendido: tu agente vuelve a seguir el flujo.",
    "Specty on: your agent follows the flow again.",
  );
  protected readonly decisions = inject(Decisions);
  protected readonly t = this.preferences.t;
  protected readonly since = computed(() =>
    when(this.state.current()?.at, this.preferences.lang()),
  );
  protected readonly by = computed(() => this.state.current()?.by ?? "?");
}

/**
 * A dialog's confirmation: switches Specty to `on`, then closes the dialog and says so with
 * `es` / `en`; a refusal says why and leaves the dialog open. Called in the dialog's injection
 * context, from a field.
 */
function turning(es: string, en: string): (on: boolean) => void {
  const ref = inject(DialogRef);
  const state = inject(SwitchState);
  const toasts = inject(Toasts);
  const preferences = inject(Preferences);
  const failed = reportFailure(toasts, preferences);
  return (on) => {
    state.set(on).then(() => {
      ref.close();
      toasts.show(preferences.t()(es, en), "success");
    }, failed);
  };
}

/**
 * The «Specty» switch of the header, checked while Specty is on and in the attention tone while
 * off; it opens the dialog to turn it off or on. On a read-only server it shows the state,
 * disabled with the reason. It also adds the palette command. Nothing when the source does not
 * know the switch.
 */
@Component({
  selector: "sp-specty-switch",
  imports: [Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "contents" },
  template: `
    @if (state.current(); as current) {
      <sp-tooltip [text]="decisions.blocked()">
        <button
          type="button"
          role="switch"
          aria-label="Specty"
          [attr.aria-checked]="current.on"
          [disabled]="!decisions.allowed()"
          [attr.aria-disabled]="!decisions.allowed() || null"
          class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border-0 px-2 font-sans text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          [style.color]="current.on ? 'var(--color-text-muted)' : 'var(--color-phase-review)'"
          [style.background]="current.on ? 'transparent' : 'var(--color-phase-review-bg)'"
          style="transition-duration: var(--duration-fast)"
          (click)="open()"
        >
          <span aria-hidden="true" class="relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors" [class.bg-accent]="current.on" [class.bg-border]="!current.on" style="transition-duration: var(--duration-fast)">
            <span class="absolute top-0.5 size-3 rounded-full bg-surface shadow-sm transition-[left]" [style.left]="current.on ? '14px' : '2px'" style="transition-duration: var(--duration-fast)"></span>
          </span>
          <span class="hidden sm:inline">Specty</span>
        </button>
      </sp-tooltip>
    }
  `,
})
export class SpectySwitchToggle {
  protected readonly state = inject(SwitchState);
  protected readonly decisions = inject(Decisions);
  private readonly dialogs = inject(Dialogs);

  constructor() {
    inject(Commands).register({
      id: "specty-switch",
      label: { es: "Encender o apagar Specty…", en: "Turn Specty on or off…" },
      run: () => this.open(),
    });
  }

  protected open(): void {
    openSwitch(this.dialogs, this.state);
  }
}
