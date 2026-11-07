// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import type { ConfigEdit } from "@baquia-dev/specty-core/light";
import type { ConfigRecord } from "../data/source";
import type { FieldView } from "./setting-row";
import type { Draft } from "./settings-edit";
import type { SettingRow } from "./settings-view";

/**
 * The view Flujo of the page «Configuración»: the phases of a change in line, each with the pieces
 * the configuration equips, with the page's edits not saved yet.
 */
@Component({
  selector: "sp-settings-flow",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-8" },
  template: `<ol data-line class="m-0 list-none p-0"></ol>`,
})
export class SettingsFlow {
  /** The configuration the server gives. */
  readonly record = input.required<ConfigRecord>();
  /** The page's edits, not saved yet. */
  readonly edits = input<readonly ConfigEdit[]>([]);
  /** Delegated mode in the clone; undefined when the source cannot tell. */
  readonly delegated = input<boolean | undefined>(undefined);
  /** Whether the person can change the settings here. */
  readonly editable = input(false);
  /** Each setting as the view General shows it. */
  readonly rows = input<readonly SettingRow[]>([]);
  /** Each setting's controls, by its key; none where the person cannot change it. */
  readonly fields = input<ReadonlyMap<string, readonly FieldView[]>>(new Map());
  /** The settings whose edits are not saved yet. */
  readonly pending = input<ReadonlySet<string>>(new Set());
  /** An edit of a piece or of one of its settings, for the page's edits. */
  readonly edit = output<Draft>();
}
