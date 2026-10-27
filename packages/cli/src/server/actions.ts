// SPDX-License-Identifier: Apache-2.0
import {
  delegationWarning,
  headerOf,
  noActiveChangeCard,
  type Output,
  parseSpec,
  uiApprovalRefusalCard,
} from "@baquia-dev/specty-core";
import { accept } from "../commands/accept";
import { adjust } from "../commands/adjust";
import { approve } from "../commands/approve";
import { delegate } from "../commands/delegate";
import { close } from "../commands/finish";
import { type PersonAction, personSession } from "../commands/human";
import { reject } from "../commands/scope-decision";
import { resolveActive } from "../flow/active";
import { addComment, decideAssumption, requestChanges } from "../flow/review";
import { isRecord } from "../io/files";
import { type Session, sessionFrom, type Terminal } from "../session";
import { readSpec } from "../store/changes";
import { type CommentAnchor, isAnchor } from "../store/comments";
import { readDelegation } from "../store/local";

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
  | { readonly kind: "comment"; readonly anchor: CommentAnchor; readonly body: string }
  | { readonly kind: "requestChanges" }
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
  const parse = verb === undefined ? undefined : PARSERS.get(verb);
  const action = parse?.(target, isRecord(body) ? body : {});
  return action === undefined ? undefined : { id: decodeURIComponent(id), action };
}

/** How a verb reads its action from the route's target and the body: nothing if malformed. */
type ActionParser = (
  target: string | undefined,
  data: Readonly<Record<string, unknown>>,
) => Action | undefined;

/** A string field of the body. */
function text(data: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

const PARSERS: ReadonlyMap<string, ActionParser> = new Map<string, ActionParser>([
  [
    "approve",
    (target, data) =>
      target === undefined && Number.isInteger(data.revision)
        ? { kind: "approve", revision: Number(data.revision) }
        : undefined,
  ],
  [
    "assumptions",
    (target, data) => {
      if (target === undefined || !isOneOf(data.decision, DECISIONS)) return undefined;
      const comment = text(data, "comment");
      return {
        kind: "assumption",
        item: target,
        decision: data.decision,
        ...(comment === undefined ? {} : { comment }),
      };
    },
  ],
  [
    "scope",
    (target, data) => {
      if (target === undefined || !isOneOf(data.decision, SCOPE_DECISIONS)) return undefined;
      const reason = text(data, "reason");
      return {
        kind: "scope",
        request: target,
        decision: data.decision,
        ...(reason === undefined ? {} : { reason }),
      };
    },
  ],
  [
    "comments",
    (target, data) => {
      const body = text(data, "body");
      return target === undefined && isAnchor(data.anchor) && body !== undefined
        ? { kind: "comment", anchor: data.anchor, body }
        : undefined;
    },
  ],
  ["request-changes", (target) => (target === undefined ? { kind: "requestChanges" } : undefined)],
  [
    "adjust",
    (target, data) => {
      const request = text(data, "request")?.trim();
      return target === undefined && request !== undefined && request !== ""
        ? { kind: "adjust", request }
        : undefined;
    },
  ],
  ["accept", (target) => (target === undefined ? { kind: "accept" } : undefined)],
  ["close", (target) => (target === undefined ? { kind: "close" } : undefined)],
]);

const DECISIONS = ["confirmed", "rejected"] as const;
const SCOPE_DECISIONS = ["approved", "rejected"] as const;

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

/** Which of the person's commands an action is, to find the change's folder. */
const COMMAND: Readonly<Record<Action["kind"], PersonAction>> = {
  approve: "approve",
  assumption: "approve",
  comment: "approve",
  requestChanges: "approve",
  scope: "approve",
  accept: "accept",
  adjust: "accept",
  close: "close",
};

/**
 * The person deciding on the UI's screen: they already decided there, so every confirmation is
 * a yes. Only `choice`, what they picked on screen, is chosen for them; any other question that
 * needs a choice postpones the action.
 */
function screen(choice?: string): Terminal {
  return {
    interactive: true,
    channel: "ui",
    confirm: () => Promise.resolve(true),
    choose: (_message, options) =>
      Promise.resolve(options.find((option) => option.value === choice)?.value),
    ask: () => Promise.resolve(undefined),
    note: () => undefined,
  };
}

/** `session` with the person deciding on the UI's screen. */
function onScreen(session: Session, choice?: string): Session {
  return sessionFrom(
    { ...session.environment, terminal: screen(choice) },
    session.root,
    session.paths,
    session.git,
    session.config,
    session.delegated,
  );
}

/** Delegated mode as the UI shows it: on or off, who turned it on and when, and the warning. */
export async function delegationView(session: Session) {
  const delegation = await readDelegation(session.git);
  const warning = {
    es: delegationWarning({ ...session.cards, lang: "es" }),
    en: delegationWarning({ ...session.cards, lang: "en" }),
  };
  return delegation === undefined ? { on: false, warning } : { on: true, ...delegation, warning };
}

/**
 * The person turns delegated mode on or off from the UI, as `specty delegate on|off`: turning it
 * on answers the command's question with the yes they gave after reading the warning.
 */
export function setDelegation(session: Session, on: boolean): Promise<Output> {
  return delegate(onScreen(session, on ? "yes" : undefined), on ? "on" : "off");
}

/**
 * Runs an action of the person in the folder of change `id`, with the same command as at the
 * terminal; the answer is that command's output.
 */
export async function runAction(session: Session, id: string, action: Action): Promise<Output> {
  const ui = onScreen(session);
  const scope = action.kind === "scope" ? { scope: action.request } : {};
  const chosen = await personSession(ui, COMMAND[action.kind], { id, ...scope });
  if (chosen.kind === "output") return chosen.output;
  const there = chosen.session;
  switch (action.kind) {
    case "approve":
      return approveRevision(there, action.revision);
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
    default:
      return reviewAction(there, action);
  }
}

/** An action on the spec under review: an assumption's decision, a comment or asking for changes. */
async function reviewAction(
  session: Session,
  action: Extract<Action, { kind: "assumption" | "comment" | "requestChanges" }>,
): Promise<Output> {
  const change = await resolveActive(session);
  if (change === undefined) return noChange(session);
  if (action.kind === "comment") return addComment(session, change, action.anchor, action.body);
  if (action.kind === "requestChanges") return requestChanges(session, change);
  return decideAssumption(session, change, action.item, action.decision, action.comment);
}

/**
 * Approves exactly the revision the person saw, once every high-impact assumption is confirmed:
 * `approve` would otherwise ask, and the UI does not answer for them.
 */
async function approveRevision(session: Session, revision: number): Promise<Output> {
  const change = await resolveActive(session);
  if (change === undefined) return noChange(session);
  const { state } = change;
  if (state.phase === "review") {
    const header = headerOf(state.id, "review");
    if (state.revision !== revision) {
      return uiApprovalRefusalCard(
        { reason: "stale", current: state.revision, asked: revision },
        header,
        session.cards,
      );
    }
    const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
    const open = (spec.sections.assumptions?.items ?? [])
      .filter((item) => item.impact === "high" && state.items[item.id]?.decision !== "confirmed")
      .map((item) => item.id);
    if (open.length > 0) {
      return uiApprovalRefusalCard({ reason: "unconfirmed", ids: open }, header, session.cards);
    }
  }
  return approve(session, undefined);
}

function noChange(session: Session): Output {
  return noActiveChangeCard("ui", session.cards);
}
