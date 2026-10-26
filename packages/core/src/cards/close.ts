// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";

// The texts of a person's `close` and `cancel`, and of the commits that archive a change.

/** The subject of the commit that archives a closed change. */
export function closeCommitSubject(title: string, lang: Lang): string {
  return `docs(spec): ${translator(lang)("cerrar", "close")} ${title}`;
}

/** The subject of the commit that archives a cancelled change. */
export function cancelCommitSubject(id: string, lang: Lang): string {
  return `docs(spec): ${translator(lang)("cancelar", "cancel")} ${id}`;
}

/** What the agent did to incorporate the main branch, shown before the person confirms. */
export function resolvedIntegrationNote(
  integration: {
    readonly target: string;
    readonly commit: string;
    readonly conflicts: readonly string[];
  },
  lang: Lang,
): { readonly title: string; readonly text: string } {
  const t = translator(lang);
  const { target, commit, conflicts } = integration;
  return {
    title: t("Incorporación resuelta por el agente", "Incorporation resolved by the agent"),
    text: [
      t(`${target} entró con el merge ${commit}.`, `${target} came in with merge ${commit}.`),
      conflicts.length > 0
        ? t(
            `Conflictos resueltos: ${conflicts.join(", ")}.`,
            `Conflicts resolved: ${conflicts.join(", ")}.`,
          )
        : t("Arregló lo que fallaba en la verificación.", "It fixed what failed the verification."),
    ].join("\n"),
  };
}

export function confirmCloseQuestion(lang: Lang): string {
  return translator(lang)("¿Confirmar el cierre?", "Confirm the closing?");
}

export function closedLine(commit: string, lang: Lang): string {
  return translator(lang)(
    `Cambio cerrado y archivado (commit ${commit}).`,
    `Change closed and archived (commit ${commit}).`,
  );
}

/** Asked to retry the incorporation of a change already closed that did not reach its branch. */
export function landQuestion(branch: string, target: string, lang: Lang): string {
  return translator(lang)(`¿Incorporar ${branch} a ${target}?`, `Merge ${branch} into ${target}?`);
}

export function alreadyClosedLine(lang: Lang): string {
  return translator(lang)(
    "El cambio ya estaba cerrado y archivado.",
    "The change was already closed and archived.",
  );
}

export function cancelReasonQuestion(lang: Lang): string {
  return translator(lang)("¿Por qué lo cancelas?", "Why do you cancel it?");
}

export function cancelQuestion(id: string, lang: Lang): string {
  return translator(lang)(`¿Cancelar ${id}?`, `Cancel ${id}?`);
}

export function cancelledLine(commit: string, lang: Lang): string {
  return translator(lang)(
    `Cambio cancelado y archivado (commit ${commit}).`,
    `Change cancelled and archived (commit ${commit}).`,
  );
}
