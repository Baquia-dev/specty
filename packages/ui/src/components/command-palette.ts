// SPDX-License-Identifier: Apache-2.0
import { Combobox, ComboboxPopup, ComboboxWidget } from "@angular/aria/combobox";
import { Listbox, Option } from "@angular/aria/listbox";
import { DialogRef } from "@angular/cdk/dialog";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Injectable,
  inject,
  signal,
} from "@angular/core";
import { fold, type Lang } from "@baquia-dev/specty-core";
import { Shortcuts } from "../keyboard/shortcuts";
import { Preferences } from "../theme/preferences";
import { DialogFrame, Dialogs } from "./dialog";
import { Kbd } from "./kbd";

export interface Command {
  readonly id: string;
  readonly label: Readonly<Record<Lang, string>>;
  /** Also registered as a shortcut, and shown next to the command. */
  readonly keys?: string;
  readonly run: () => void;
}

/** Commands of the palette (`mod+k`). Each lives as long as whoever registered it. */
@Injectable({ providedIn: "root" })
export class Commands {
  private readonly entries = signal<readonly Command[]>([]);
  readonly all = this.entries.asReadonly();
  private readonly dialogs = inject(Dialogs);
  private readonly shortcuts = inject(Shortcuts);
  private open: DialogRef<unknown, CommandPalette> | undefined;

  constructor() {
    this.shortcuts.register(
      {
        keys: "mod+k",
        description: { es: "Abrir la paleta de comandos", en: "Open the command palette" },
        run: () => this.openPalette(),
      },
      inject(DestroyRef),
    );
  }

  /** Call it in an injection context, or pass the `DestroyRef` that ends the command. */
  register(command: Command, destroyRef: DestroyRef = inject(DestroyRef)): void {
    this.entries.update((all) => [...all, command]);
    if (command.keys !== undefined) {
      this.shortcuts.register(
        { keys: command.keys, description: command.label, run: command.run },
        destroyRef,
      );
    }
    destroyRef.onDestroy(() =>
      this.entries.update((all) => all.filter((entry) => entry !== command)),
    );
  }

  openPalette(): void {
    if (this.open !== undefined) return;
    const ref = this.dialogs.open(CommandPalette);
    this.open = ref;
    ref.closed.subscribe(() => {
      this.open = undefined;
    });
  }
}

/** Search and run a command: arrows move, Enter runs, and it closes. */
@Component({
  selector: "sp-command-palette",
  imports: [DialogFrame, Kbd, Combobox, ComboboxPopup, ComboboxWidget, Listbox, Option],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog [heading]="t()('Comandos', 'Commands')">
      <input
        ngCombobox
        cdkFocusInitial
        #combobox="ngCombobox"
        alwaysExpanded
        class="h-10 w-full rounded-lg border border-border bg-bg px-3 font-sans text-base text-text placeholder:text-text-muted"
        [placeholder]="t()('Busca un comando…', 'Search a command…')"
        [attr.aria-label]="t()('Buscar comando', 'Search command')"
        [(value)]="query"
      />
      <ng-template ngComboboxPopup [combobox]="combobox">
        <div
          ngComboboxWidget
          ngListbox
          #listbox="ngListbox"
          class="flex max-h-80 flex-col gap-0.5 overflow-y-auto"
          selectionMode="explicit"
          [activeDescendant]="listbox.activeDescendant()"
          [value]="[]"
          (valueChange)="run($event)"
        >
          @for (command of results(); track command.id) {
            <div
              ngOption
              class="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm text-text hover:bg-bg aria-selected:bg-bg data-[active=true]:bg-bg"
              [value]="command.id"
              [label]="command.label[lang()]"
            >
              {{ command.label[lang()] }}
              @if (command.keys; as keys) {
                <sp-kbd [keys]="keys" />
              }
            </div>
          }
        </div>
      </ng-template>
      @if (results().length === 0) {
        <p class="m-0 text-sm text-text-muted" role="status">
          {{ t()('Ningún comando coincide.', 'No command matches.') }}
        </p>
      }
    </sp-dialog>
  `,
})
export class CommandPalette {
  private readonly commands = inject(Commands);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly query = signal("");
  protected readonly results = computed(() => {
    const words = fold(this.query()).split(/\s+/).filter(Boolean);
    return this.commands
      .all()
      .filter((command) => words.every((word) => fold(command.label[this.lang()]).includes(word)));
  });
  /** The palette always opens as a dialog: running a command closes it first. */
  private readonly ref = inject(DialogRef);

  protected run(ids: readonly string[]): void {
    const command = this.commands.all().find((entry) => entry.id === ids[0]);
    if (command === undefined) return;
    this.ref.close();
    command.run();
  }
}
