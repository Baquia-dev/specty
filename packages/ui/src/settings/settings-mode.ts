// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  Injectable,
  inject,
  signal,
} from "@angular/core";
import { SETTINGS } from "@baquia-dev/specty-core/light";
import { Button } from "../components/button";
import { Segmented, type SegmentedOption } from "../components/segmented";
import { Preferences } from "../theme/preferences";

// How the page «Configuración» is looked at: the view, General or Flujo, and the mode, Básico or
// Avanzado, remembered in this browser like the Inbox's grouping; their selectors; and the line
// that says, in Básico, how many more settings Avanzado has.

const VIEWS = ["general", "flow"] as const;
const MODES = ["basic", "advanced"] as const;
type View = (typeof VIEWS)[number];
type Mode = (typeof MODES)[number];

const KEYS = { view: "specty.settings.view", mode: "specty.settings.mode" } as const;

/** The view and the mode of the page; the first time, General in Avanzado, as before they existed. */
@Injectable({ providedIn: "root" })
export class SettingsMode {
  private readonly window = inject(DOCUMENT).defaultView;

  readonly view = signal<View>(this.stored(KEYS.view, VIEWS) ?? "general");
  readonly mode = signal<Mode>(this.stored(KEYS.mode, MODES) ?? "advanced");
  readonly flow = computed(() => this.view() === "flow");
  readonly basic = computed(() => this.mode() === "basic");

  constructor() {
    effect(() => this.store(KEYS.view, this.view()));
    effect(() => this.store(KEYS.mode, this.mode()));
  }

  chooseView(value: string): void {
    const view = VIEWS.find((item) => item === value);
    if (view !== undefined) this.view.set(view);
  }

  chooseMode(value: string): void {
    const mode = MODES.find((item) => item === value);
    if (mode !== undefined) this.mode.set(mode);
  }

  /** Storage can be missing or throw (private mode, blocked site data): fall back to defaults. */
  private stored<T extends string>(key: string, allowed: readonly T[]): T | undefined {
    try {
      const value = this.window?.localStorage.getItem(key);
      return allowed.find((item) => item === value);
    } catch {
      return undefined;
    }
  }

  private store(key: string, value: string): void {
    try {
      this.window?.localStorage.setItem(key, value);
    } catch {
      // Not remembered across visits; the current choice still applies.
    }
  }
}

/** The page's selectors: the view, General or Flujo, and the mode, Básico or Avanzado. */
@Component({
  selector: "sp-settings-views",
  imports: [Segmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-wrap items-center gap-3", "data-views": "" },
  template: `
    <sp-segmented data-view [label]="t()('Vista', 'View')" [hideLabel]="true" [options]="views()" [value]="state.view()" (valueChange)="state.chooseView($event)" />
    <sp-segmented data-mode [label]="t()('Modo', 'Mode')" [hideLabel]="true" [options]="modes()" [value]="state.mode()" (valueChange)="state.chooseMode($event)" />
  `,
})
export class SettingsViews {
  protected readonly state = inject(SettingsMode);
  protected readonly t = inject(Preferences).t;

  protected readonly views = computed((): readonly SegmentedOption[] => [
    { value: "general", label: "General" },
    { value: "flow", label: this.t()("Flujo", "Flow") },
  ]);

  protected readonly modes = computed((): readonly SegmentedOption[] => [
    { value: "basic", label: this.t()("Básico", "Basic") },
    { value: "advanced", label: this.t()("Avanzado", "Advanced") },
  ]);
}

const BASIC = SETTINGS.filter((setting) => setting.basic === true).length;

/** Under General in Básico: how many settings Avanzado adds, and the way there. */
@Component({
  selector: "sp-settings-basic-more",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-wrap items-center justify-between gap-3 pl-6",
    "data-basic-more": "",
  },
  template: `
    <p class="m-0 text-sm text-text-muted">{{ line() }}</p>
    <sp-button data-show-advanced size="sm" variant="ghost" (pressed)="state.mode.set('advanced')">{{ t()('Ver todos en Avanzado', 'See all in Advanced') }}</sp-button>
  `,
})
export class SettingsBasicMore {
  protected readonly state = inject(SettingsMode);
  protected readonly t = inject(Preferences).t;

  protected readonly line = computed(() =>
    this.t()(
      `Ves ${BASIC} de ${SETTINGS.length} ajustes. Los demás conservan su valor y están en Avanzado.`,
      `You see ${BASIC} of ${SETTINGS.length} settings. The others keep their value and are in Advanced.`,
    ),
  );
}
