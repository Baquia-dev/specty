// SPDX-License-Identifier: Apache-2.0
// What the status bar and the extension's notices say, in Spanish or in English like VS Code.
import type { Lang, Phase } from "@baquia-dev/specty-core";
import type { OpenChange, StatusRead } from "./specty";

type Bilingual = Readonly<Record<Lang, string>>;

/** Each phase with its icon and its name, as in the UI: never told apart by color alone. */
const PHASES: Readonly<Record<Phase, { readonly icon: string; readonly name: Bilingual }>> = {
  draft: { icon: "$(edit)", name: { es: "Borrador", en: "Draft" } },
  review: { icon: "$(eye)", name: { es: "Revisión", en: "Review" } },
  testing: { icon: "$(beaker)", name: { es: "Tests", en: "Tests" } },
  implementing: { icon: "$(code)", name: { es: "Implementación", en: "Implementing" } },
  adjusting: { icon: "$(tools)", name: { es: "Ajustes", en: "Adjusting" } },
  acceptance: { icon: "$(checklist)", name: { es: "Aceptación", en: "Acceptance" } },
  closing: { icon: "$(archive)", name: { es: "Cierre", en: "Closing" } },
  done: { icon: "$(pass)", name: { es: "Terminado", en: "Done" } },
  cancelled: { icon: "$(circle-slash)", name: { es: "Cancelado", en: "Cancelled" } },
};

const CHANGES_ICON = "$(list-unordered)";
const WARNING_ICON = "$(warning)";

/** The language of VS Code's interface: Spanish in any of its variants, English otherwise. */
export function langOf(language: string): Lang {
  return language === "es" || language.startsWith("es-") ? "es" : "en";
}

interface StatusView {
  readonly text: string;
  readonly tooltip: string;
  /** Something keeps the extension from working: the bar takes the warning colors. */
  readonly warning: boolean;
}

/** The status bar for what reading the status gave. */
export function statusView(read: StatusRead, lang: Lang): StatusView {
  const say = notices(lang);
  switch (read.kind) {
    case "status":
      return changesView(read.status.changes, lang);
    case "missing":
      return warned(say.missing);
    case "outdated":
      return warned(say.outdated);
    case "failed":
      return warned(say.statusFailed(read.message));
  }
}

/**
 * The folder's change with its phase, and whether it waits for the person; without one, how
 * many are open and how many wait for the person. The tooltip lists them all.
 */
function changesView(changes: readonly OpenChange[], lang: Lang): StatusView {
  const es = lang === "es";
  const click = es ? "Clic para abrir la UI." : "Click to open the UI.";
  if (changes.length === 0) {
    const none = es ? "Sin cambios abiertos." : "No open changes.";
    return { text: `${CHANGES_ICON} Specty`, tooltip: `${none}\n${click}`, warning: false };
  }
  const tooltip = [...changes.map((change) => lineOf(change, lang)), click].join("\n");
  const here = changes.find((change) => change.current);
  if (here !== undefined) {
    const { icon, name } = PHASES[here.phase];
    const waits = here.waitingFor === "human" ? ` · ${es ? "te espera" : "waiting for you"}` : "";
    return { text: `${icon} Specty: ${name[lang]}${waits}`, tooltip, warning: false };
  }
  const waiting = changes.filter((change) => change.waitingFor === "human").length;
  const open = es
    ? `${changes.length} ${changes.length === 1 ? "cambio abierto" : "cambios abiertos"}`
    : `${changes.length} ${changes.length === 1 ? "open change" : "open changes"}`;
  const yours = es
    ? `${waiting} ${waiting === 1 ? "te espera" : "te esperan"}`
    : `${waiting} waiting for you`;
  const text = `${CHANGES_ICON} Specty: ${open}${waiting > 0 ? ` · ${yours}` : ""}`;
  return { text, tooltip, warning: false };
}

/** `id · phase · who it waits for — title`, and where it lives when it is another folder. */
function lineOf(change: OpenChange, lang: Lang): string {
  const es = lang === "es";
  const waits: Readonly<Record<OpenChange["waitingFor"], string | undefined>> = {
    human: es ? "espera a ti" : "waits for you",
    agent: es ? "espera al agente" : "waits for the agent",
    nobody: undefined,
  };
  const parts = [change.id, PHASES[change.phase].name[lang], waits[change.waitingFor]];
  const where = change.folder === undefined ? "" : ` · ${es ? "en" : "in"} ${change.folder}`;
  return `${parts.filter(Boolean).join(" · ")} — ${change.title}${where}`;
}

function warned(message: string): StatusView {
  return { text: `${WARNING_ICON} Specty`, tooltip: message, warning: true };
}

/** What the extension's notices say. */
export function notices(lang: Lang) {
  const es = lang === "es";
  return {
    missing: es
      ? "No se encuentra el comando specty. Instálalo con npm install -g @baquia-dev/specty o indica su ruta en el ajuste specty.path."
      : "The specty command was not found. Install it with npm install -g @baquia-dev/specty or set its path in the specty.path setting.",
    outdated: es
      ? "Este specty no da el estado como datos. Actualízalo con npm install -g @baquia-dev/specty@latest o indica otro en el ajuste specty.path."
      : "This specty does not give the status as data. Update it with npm install -g @baquia-dev/specty@latest or set another one in the specty.path setting.",
    openSettings: es ? "Abrir ajustes" : "Open settings",
    statusFailed: (message: string) =>
      es
        ? `Specty no pudo leer el estado: ${message}`
        : `Specty could not read the status: ${message}`,
    uiFailed: (message: string) => {
      const reason =
        message.length > 0
          ? message
          : es
            ? "specty ui no dio su enlace."
            : "specty ui gave no link.";
      return es ? `No se pudo abrir la UI: ${reason}` : `Could not open the UI: ${reason}`;
    },
  };
}
