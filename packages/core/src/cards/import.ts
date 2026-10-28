// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/**
 * `specty import`: a change of OpenSpec brought in as a draft (ARCHITECTURE §6). The exporters'
 * package reads its files into an `ImportedChange`; these cards turn it into a spec's sections.
 */

/** What an OpenSpec change says, read from its files and not yet in Specty's words. */
export interface ImportedChange {
  /** The proposal's title, without a «Change:» or «Proposal:» prefix. */
  readonly title?: string;
  readonly why?: string;
  readonly whatChanges?: string;
  readonly outOfScope?: string;
  /** Parts of the proposal with no place of their own, such as Impact; untitled text has "". */
  readonly other: readonly { readonly heading: string; readonly body: string }[];
  /** `design.md` without its title. */
  readonly design?: string;
  /** Each scenario with a WHEN and a THEN, which makes a criterion. */
  readonly scenarios: readonly {
    readonly given?: string;
    readonly when: string;
    readonly outcome: string;
  }[];
  /** Requirements without a scenario, and scenarios without a WHEN and a THEN, as text. */
  readonly loose: readonly string[];
  /** The requirements the change removes. */
  readonly removed: readonly string[];
  /** The tasks still to do, and those already done. */
  readonly pending: readonly string[];
  readonly done: readonly string[];
}

/** The sections of the spec an imported change fills; the others keep their hint. */
interface ImportedSections {
  readonly goal?: string;
  readonly outOfScope?: string;
  readonly criteria?: string;
  readonly design?: string;
  readonly tasks?: string;
}

/**
 * The change in the spec's words: Why and What Changes are its goal, each scenario a criterion,
 * each task to do a task; whatever has no place of its own goes to the design, as it is.
 */
export function importedSections(change: ImportedChange, lang: Lang): ImportedSections {
  const t = translator(lang);
  const goal = [change.why, change.whatChanges].filter(written).join("\n\n");
  const criteria = change.scenarios
    .map((scenario, index) => `- AC${index + 1}: ${criterionOf(scenario, t)}`)
    .join("\n");
  const tasks = change.pending.map((title, index) => `- [ ] T${index + 1}: ${title}`).join("\n");
  const design = [
    change.design,
    ...change.other.map((part) =>
      part.heading === "" ? part.body : `**${part.heading}**\n\n${part.body}`,
    ),
    listed(
      t(
        "**Sin criterio todavía** (requisitos o escenarios de OpenSpec sin WHEN y THEN):",
        "**No criterion yet** (OpenSpec requirements or scenarios without WHEN and THEN):",
      ),
      change.loose,
    ),
    listed(
      t("**Requisitos que el cambio quita:**", "**Requirements the change removes:**"),
      change.removed,
    ),
    listed(t("**Hecho antes de importar:**", "**Done before the import:**"), change.done),
  ]
    .filter(written)
    .join("\n\n");
  return {
    ...(goal === "" ? {} : { goal }),
    ...(change.outOfScope === undefined ? {} : { outOfScope: change.outOfScope }),
    ...(criteria === "" ? {} : { criteria }),
    ...(design === "" ? {} : { design }),
    ...(tasks === "" ? {} : { tasks }),
  };
}

function written(text: string | undefined): text is string {
  return text !== undefined && text !== "";
}

function criterionOf(scenario: ImportedChange["scenarios"][number], t: Translate): string {
  const given = scenario.given === undefined ? "" : `${t("DADO", "GIVEN")} ${scenario.given} `;
  return `${given}${t("CUANDO", "WHEN")} ${scenario.when} ${t("ENTONCES", "THEN")} ${scenario.outcome}`;
}

/** A labelled list, or nothing without items. */
function listed(label: string, items: readonly string[]): string {
  return items.length === 0 ? "" : `${label}\n\n${items.map((item) => `- ${item}`).join("\n")}`;
}

/** The literal request of an imported change: where it came from. */
export function importRequest(folder: string, lang: Lang): string {
  return translator(lang)(`Importado de OpenSpec: ${folder}`, `Imported from OpenSpec: ${folder}`);
}

/** What leads the card of `new` for an imported change: what the agent still writes. */
export function importedLead(folder: string, ctx: CardContext): readonly string[] {
  const t = translator(ctx.lang);
  return [
    t(
      `Importado de OpenSpec: ${folder}. Completa los supuestos, los archivos y los \`files\` de cada tarea, y revisa el diseño.`,
      `Imported from OpenSpec: ${folder}. Complete the assumptions, the files and each task's \`files\`, and review the design.`,
    ),
  ];
}

/** Why `specty import` creates nothing. */
type ImportRefusal = {
  readonly reason: "missing" | "no-proposal";
  readonly folder: string;
};

export function importRefusalCard(refusal: ImportRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { folder } = refusal;
  return blockedCard(
    headerOf(),
    refusal.reason === "missing"
      ? t(`No existe la carpeta ${folder}.`, `There is no folder ${folder}.`)
      : t(
          `${folder} no es un cambio de OpenSpec: le falta proposal.md.`,
          `${folder} is not an OpenSpec change: it has no proposal.md.`,
        ),
    t(
      `ejecuta \`${ctx.command} import\` para ver los cambios que se pueden importar.`,
      `run \`${ctx.command} import\` to see the changes you can import.`,
    ),
  );
}

/** The OpenSpec changes `specty import` can bring in, or that there are none. */
export function importListCard(folders: readonly string[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  if (folders.length === 0) {
    return {
      status: "ok",
      header: headerOf(),
      blocks: section(undefined, [
        t(
          "No hay cambios de OpenSpec que importar en openspec/changes/.",
          "There is no OpenSpec change to import in openspec/changes/.",
        ),
      ]),
      next: t(
        `crea el cambio con \`${ctx.command} new "<título>"\`.`,
        `create the change with \`${ctx.command} new "<title>"\`.`,
      ),
    };
  }
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(t("CAMBIOS DE OPENSPEC", "OPENSPEC CHANGES"), folders),
    next: t(
      `importa uno con \`${ctx.command} import <carpeta>\`.`,
      `import one with \`${ctx.command} import <folder>\`.`,
    ),
  };
}
