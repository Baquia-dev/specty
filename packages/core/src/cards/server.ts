// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { type Output, section } from "../output";
import { blockedCard } from "./flow";
import { reloadNext } from "./refusals";
import { translator } from "./text";
import type { CardContext } from "./view";

// What the local server of `specty ui` answers (ARCHITECTURE §15): the full verification the
// person starts from the UI, an approval with a stale page, and the page when the UI is not built.

/** Why the full verification does not start from the UI. */
export type RunRefusal =
  | { readonly reason: "no-change"; readonly id: string }
  | { readonly reason: "not-in-acceptance" }
  | { readonly reason: "no-full-verify" }
  | { readonly reason: "running" };

export function runRefusalCard(refusal: RunRefusal, header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  switch (refusal.reason) {
    case "no-change":
      return blockedCard(
        header,
        t(`No hay ningún cambio ${refusal.id}.`, `There is no change ${refusal.id}.`),
        reloadNext("ui", ctx),
      );
    case "not-in-acceptance":
      return blockedCard(
        header,
        t(
          "La verificación completa se ejecuta con el cambio en aceptación.",
          "The full verification runs with the change in acceptance.",
        ),
        reloadNext("ui", ctx),
      );
    case "no-full-verify":
      return blockedCard(
        header,
        t(
          "Este proyecto no tiene verificación completa (`verify.full`).",
          "This project has no full verification (`verify.full`).",
        ),
        t("añádela en .specty/config.yaml.", "add it in .specty/config.yaml."),
      );
    case "running":
      return blockedCard(
        header,
        t(
          "Ya corre la verificación completa de este cambio.",
          "The full verification of this change is already running.",
        ),
        t("espera a que termine.", "wait for it to finish."),
      );
  }
}

export function runStartedCard(header: string, command: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: section(undefined, [
      t(
        `Verificación completa en marcha: \`${command}\`.`,
        `Full verification running: \`${command}\`.`,
      ),
    ]),
    next: t("sigue su salida en la UI.", "follow its output in the UI."),
  };
}

/** Why the UI cannot approve the spec it shows. */
export type UiApprovalRefusal =
  /** The UI shows an older revision than the current one. */
  | { readonly reason: "stale"; readonly current: number; readonly asked: number }
  | { readonly reason: "unconfirmed"; readonly ids: readonly string[] };

export function uiApprovalRefusalCard(
  refusal: UiApprovalRefusal,
  header: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return refusal.reason === "stale"
    ? blockedCard(
        header,
        t(
          `La revisión vigente es la ${refusal.current}, no la ${refusal.asked}.`,
          `The current revision is ${refusal.current}, not ${refusal.asked}.`,
        ),
        t("vuelve a cargarla antes de aprobar.", "reload it before approving."),
      )
    : blockedCard(
        header,
        t(
          `Faltan por confirmar supuestos de alto impacto: ${refusal.ids.join(", ")}.`,
          `High-impact assumptions are not confirmed yet: ${refusal.ids.join(", ")}.`,
        ),
        t(
          "confírmalos o, si alguno está mal, recházalo y pide cambios al agente.",
          "confirm them or, if one is wrong, reject it and ask the agent for changes.",
        ),
      );
}

/** The page the server shows when the UI is not built: how to build it, and where the data is. */
export function notBuiltPage(lang: Lang): string {
  const text = translator(lang)(
    "La UI no está construida: ejecuta <code>pnpm --filter @baquia-dev/specty-ui build</code> y vuelve a cargar esta página. Los datos siguen en <code>/api/changes</code>.",
    "The UI is not built: run <code>pnpm --filter @baquia-dev/specty-ui build</code> and reload this page. The data is still at <code>/api/changes</code>.",
  );
  return `<!doctype html><meta charset="utf-8"><title>Specty</title><p>${text}</p>`;
}
