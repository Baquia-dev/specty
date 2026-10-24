// SPDX-License-Identifier: Apache-2.0
import { blockedCard, headerOf, type Output, parseSpec, translator } from "@baquia-dev/specty-core";
import { accept } from "../commands/accept";
import { adjust } from "../commands/adjust";
import { approve } from "../commands/approve";
import { close } from "../commands/finish";
import { type PersonAction, personSession } from "../commands/human";
import { reject } from "../commands/scope-decision";
import { resolveActive } from "../flow/active";
import { decideAssumption } from "../flow/review";
import { isRecord } from "../io/files";
import { type Session, sessionFrom, type Terminal } from "../session";
import { readSpec } from "../store/changes";

/** A decision the person takes in the UI, as its route and its body say it. */
export type Action =
  | { readonly kind: "approve"; readonly revision: number }
  | {
      readonly kind: "assumption";
      readonly item: string;
      readonly decision: "confirmed" | "rejected";
      readonly comment?: string;
    }
  | {
      readonly kind: "scope";
      readonly request: string;
      readonly decision: "approved" | "rejected";
      readonly reason?: string;
    }
  | { readonly kind: "accept" }
  | { readonly kind: "adjust"; readonly request: string }
  | { readonly kind: "close" };

/** The change a POST to `/api/changes/<id>/…` acts on, and what it asks; nothing if malformed. */
export function parseAction(
  segments: readonly string[],
  body: unknown,
): { readonly id: string; readonly action: Action } | undefined {
  const [api, changes, id, verb, target, ...rest] = segments;
  if (api !== "api" || changes !== "changes" || id === undefined || rest.length > 0) return;
  const data = isRecord(body) ? body : {};
  const text = (key: string) => (typeof data[key] === "string" ? data[key] : undefined);
  const action = ((): Action | undefined => {
    if (verb === "approve" && target === undefined && Number.isInteger(data.revision))
      return { kind: "approve", revision: Number(data.revision) };
    if (verb === "assumptions" && target !== undefined && isOneOf(data.decision, DECISIONS)) {
      const comment = text("comment");
      return {
        kind: "assumption",
        item: target,
        decision: data.decision,
        ...(comment === undefined ? {} : { comment }),
      };
    }
    if (verb === "scope" && target !== undefined && isOneOf(data.decision, SCOPE_DECISIONS)) {
      const reason = text("reason");
      return {
        kind: "scope",
        request: target,
        decision: data.decision,
        ...(reason === undefined ? {} : { reason }),
      };
    }
    const request = text("request")?.trim();
    if (verb === "adjust" && target === undefined && request !== undefined && request !== "")
      return { kind: "adjust", request };
    if (verb === "accept" && target === undefined) return { kind: "accept" };
    if (verb === "close" && target === undefined) return { kind: "close" };
    return undefined;
  })();
  return action === undefined ? undefined : { id: decodeURIComponent(id), action };
}

const DECISIONS = ["confirmed", "rejected"] as const;
const SCOPE_DECISIONS = ["approved", "rejected"] as const;

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

/** Which of the person's commands an action is, to find the change's folder. */
const COMMAND: Readonly<Record<Action["kind"], PersonAction>> = {
  approve: "approve",
  assumption: "approve",
  scope: "approve",
  accept: "accept",
  adjust: "accept",
  close: "close",
};

/**
 * The person deciding on the UI's screen: they already decided there, so every confirmation is
 * a yes. Nothing is chosen for them: a question that needs a choice postpones the action.
 */
function screen(): Terminal {
  return {
    interactive: true,
    channel: "ui",
    confirm: () => Promise.resolve(true),
    choose: () => Promise.resolve(undefined),
    ask: () => Promise.resolve(undefined),
    note: () => undefined,
  };
}

/**
 * Runs an action of the person in the folder of change `id`, with the same command as at the
 * terminal; the answer is that command's output.
 */
export async function runAction(session: Session, id: string, action: Action): Promise<Output> {
  const ui = sessionFrom(
    { ...session.environment, terminal: screen() },
    session.root,
    session.paths,
    session.git,
    session.config,
    session.delegated,
  );
  const scope = action.kind === "scope" ? { scope: action.request } : {};
  const chosen = await personSession(ui, COMMAND[action.kind], { id, ...scope });
  if (chosen.kind === "output") return chosen.output;
  const there = chosen.session;
  switch (action.kind) {
    case "approve":
      return approveRevision(there, action.revision);
    case "assumption": {
      const change = await resolveActive(there);
      if (change === undefined) return noChange(there);
      return decideAssumption(there, change, action.item, action.decision, action.comment);
    }
    case "scope":
      return action.decision === "approved"
        ? approve(there, action.request)
        : reject(there, action.request, action.reason ?? "");
    case "accept":
      return accept(there, false);
    case "adjust":
      return adjust(there, action.request);
    case "close":
      return close(there);
  }
}

/**
 * Approves exactly the revision the person saw, once every high-impact assumption is confirmed:
 * `approve` would otherwise ask, and the UI does not answer for them.
 */
async function approveRevision(session: Session, revision: number): Promise<Output> {
  const t = translator(session.lang);
  const change = await resolveActive(session);
  if (change === undefined) return noChange(session);
  const { state } = change;
  if (state.phase === "review") {
    const header = headerOf(state.id, "review");
    if (state.revision !== revision) {
      return blockedCard(
        header,
        t(
          `La revisión vigente es la ${state.revision}, no la ${revision}.`,
          `The current revision is ${state.revision}, not ${revision}.`,
        ),
        t("vuelve a cargarla antes de aprobar.", "reload it before approving."),
      );
    }
    const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
    const open = (spec.sections.assumptions?.items ?? [])
      .filter((item) => item.impact === "high" && state.items[item.id]?.decision !== "confirmed")
      .map((item) => item.id);
    if (open.length > 0) {
      return blockedCard(
        header,
        t(
          `Faltan por confirmar supuestos de alto impacto: ${open.join(", ")}.`,
          `High-impact assumptions are not confirmed yet: ${open.join(", ")}.`,
        ),
        t(
          "confírmalos o, si alguno está mal, recházalo y pide cambios al agente.",
          "confirm them or, if one is wrong, reject it and ask the agent for changes.",
        ),
      );
    }
  }
  return approve(session, undefined);
}

function noChange(session: Session): Output {
  const t = translator(session.lang);
  return blockedCard(
    headerOf(),
    t("No hay un cambio activo.", "There is no active change."),
    t("vuelve a cargar la UI.", "reload the UI."),
  );
}
