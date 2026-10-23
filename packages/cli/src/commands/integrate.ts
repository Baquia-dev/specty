// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  blockedCard,
  classifyPath,
  headerOf,
  isGoverned,
  isIntegrating,
  type Output,
  type OutputBlock,
  scopeRulesFrom,
  section,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { changeTrailers, commitWithReceipt } from "../flow/commits";
import { askAgent, blocked } from "../flow/integrate";
import { execute, tail } from "../io/exec";
import { readText } from "../io/files";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

/** A conflict marker left at the start of a line. */
const MARKER = /^(?:<{7}|>{7})(?:\s|$)|^={7}$/m;

/**
 * `specty integrate`: the agent finishes the merge a closing left in this folder. Nothing is
 * committed unless every conflict is resolved, the changes stay within the files the merge brings
 * together and the verification passes (ARCHITECTURE §9).
 */
export async function integrate(session: Session): Promise<Output> {
  const t = translator(session.lang);
  const { cards, git, config } = session;
  const change = await resolveActive(session);
  const integration = change?.state.integration;
  if (change === undefined || integration === undefined || !isIntegrating(change.state)) {
    return blockedCard(
      headerOf(change?.state.id, change?.state.phase),
      t("No hay ninguna incorporación pendiente.", "There is no pending incorporation."),
      t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`),
    );
  }
  const { state } = change;
  const { target } = integration;
  const again = state.phase === "acceptance" ? "accept" : "close";
  const header = headerOf(state.id, state.phase, t(`incorporando ${target}`, `merging ${target}`));
  const retry = t(
    `corrígelo y vuelve a ejecutar \`${cards.command} integrate\`.`,
    `fix it and run \`${cards.command} integrate\` again.`,
  );
  const refuse = (reason: string, details: OutputBlock, next = retry): Output => ({
    status: "blocked",
    header,
    blocks: [...section(undefined, [reason]), details],
    next,
  });
  if ((await git.run(["rev-parse", "-q", "--verify", "MERGE_HEAD"])).code !== 0) {
    return blocked(
      state,
      [
        t(
          "El merge ya no está en curso: alguien lo abortó.",
          "The merge is no longer in progress: someone aborted it.",
        ),
      ],
      undefined,
      runAgain(session, again),
    );
  }
  const marked: string[] = [];
  for (const path of integration.conflicts) {
    if (MARKER.test((await readText(join(session.root, path))) ?? "")) marked.push(path);
  }
  if (marked.length > 0) {
    const reason = t("Quedan marcadores de conflicto.", "Conflict markers are left.");
    return refuse(reason, { title: t("CON MARCADORES", "WITH MARKERS"), lines: marked });
  }
  const rules = scopeRulesFrom(config);
  const outside = pathsOf(await git.changedSince("HEAD")).filter(
    (path) =>
      !path.startsWith(".specty/") &&
      isGoverned(path, config) &&
      classifyPath(path, { taskFiles: integration.paths, extras: [], rules }) === "out-of-scope",
  );
  if (outside.length > 0) {
    const reason = t(
      `Hay cambios fuera de la incorporación de ${target}.`,
      `There are changes outside the incorporation of ${target}.`,
    );
    const next = t(
      `deshaz esos cambios y vuelve a ejecutar \`${cards.command} integrate\`.`,
      `undo those changes and run \`${cards.command} integrate\` again.`,
    );
    return refuse(reason, { title: t("FUERA", "OUTSIDE"), lines: outside }, next);
  }
  const command = config.verify.full ?? config.verify.default;
  if (command !== undefined) {
    session.environment.io.err(`specty: ${t("verificando", "verifying")} \`${command}\`…`);
    const result = await execute(command, [], {
      cwd: session.root,
      shell: true,
      env: session.environment.env,
      timeoutMs: config.verify.timeoutSec * 1000,
    });
    if (result.code !== 0) {
      const reason = t(`\`${command}\` falla.`, `\`${command}\` fails.`);
      const output = tail(result, 15);
      return refuse(reason, {
        title: t("SALIDA DE LA VERIFICACIÓN", "VERIFICATION OUTPUT"),
        lines: output,
      });
    }
  }
  const commit = await commitWithReceipt(session, {
    subject: `Merge branch '${target}' into ${state.branch ?? state.id}`,
    trailers: changeTrailers(session, state.id),
    stage: [[".", ":(exclude).specty"]],
    receipt: { change: state.id, kind: "close" },
  });
  const at = session.environment.now().toISOString();
  await commitState(
    session,
    change,
    { ...state, integration: { ...integration, resolved: { commit, at } } },
    "integration.resolved",
    { commit },
  );
  return {
    status: "ok",
    header: headerOf(state.id, state.phase),
    blocks: section(undefined, [
      t(
        `Incorporación de ${target} resuelta (merge ${commit}).`,
        `Incorporation of ${target} resolved (merge ${commit}).`,
      ),
    ]),
    next: runAgain(session, again),
  };
}

/** Who runs `again` once the merge is done: the person, or the agent itself in delegated mode. */
function runAgain(session: Session, again: "close" | "accept"): string {
  const t = translator(session.lang);
  const { command } = session.cards;
  if (session.cards.delegated === true)
    return t(
      `modo delegado: vuelve a ejecutar tú \`${command} ${again}\` y sigue su salida.`,
      `delegated mode: run \`${command} ${again}\` again yourself and follow its output.`,
    );
  return t(
    `pide al usuario que vuelva a ejecutar \`${command} ${again}\` y termina tu turno.`,
    `ask the user to run \`${command} ${again}\` again and end your turn.`,
  );
}

export type Pending =
  | { readonly kind: "wait"; readonly output: Output }
  | { readonly kind: "go"; readonly change: StoredChange };

/**
 * Before closing or accepting: while the agent's merge is still in progress the person waits for
 * it; a merge someone aborted is forgotten, and the incorporation starts over.
 */
export async function pendingIntegration(
  session: Session,
  change: StoredChange,
  again: "close" | "accept",
): Promise<Pending> {
  const { integration, ...rest } = change.state;
  if (integration === undefined || integration.resolved !== undefined)
    return { kind: "go", change };
  const t = translator(session.lang);
  if ((await session.git.run(["rev-parse", "-q", "--verify", "MERGE_HEAD"])).code === 0) {
    const waiting = t(
      `El agente aún resuelve la incorporación de ${integration.target} en esta carpeta.`,
      `The agent is still resolving the incorporation of ${integration.target} in this folder.`,
    );
    return {
      kind: "wait",
      output: blocked(change.state, [waiting], undefined, askAgent(session, again)),
    };
  }
  const forgotten = await commitState(
    session,
    change,
    rest,
    "integration.abandoned",
    { target: integration.target },
    "specty",
  );
  return { kind: "go", change: forgotten };
}
