// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  closedCard,
  decisionCard,
  headerOf,
  nothingPendingCard,
  type Output,
  parseSpec,
  serializeSpec,
  transition,
  translator,
} from "@baquia-dev/specty-core";
import { commitState } from "../flow/active";
import { archive, commitArchive } from "../flow/finish";
import { absorbTarget, integrationOf } from "../flow/integrate";
import { landChange, withIntegration } from "../flow/land";
import { changeView } from "../flow/views";
import { execute, tail } from "../io/exec";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { humanChange, postponed } from "./human";
import { pendingIntegration } from "./integrate";

/** `specty accept`: a person accepts the result; quick changes close right away. */
export async function accept(session: Session): Promise<Output> {
  const guard = await humanChange(session, "accept");
  if (guard.kind === "output") return guard.output;
  const t = translator(session.lang);
  if (guard.change.state.phase !== "acceptance")
    return nothingPendingCard(
      guard.change.state.id,
      guard.change.state.phase,
      "accept",
      session.cards,
    );
  const pending = await pendingIntegration(session, guard.change, "accept");
  if (pending.kind === "wait") return pending.output;
  const { change } = pending;
  const { state } = change;
  const { terminal } = session.environment;
  const view = await changeView(session, change);
  terminal.note(
    view.title,
    view.tasks
      .map(
        (task) =>
          `${task.id} ${task.summary ?? task.title}${task.commit === undefined ? "" : ` (${task.commit})`}`,
      )
      .join("\n"),
  );
  const full = session.config.verify.full;
  if (
    full !== undefined &&
    (await terminal.confirm(
      t(
        `¿Ejecutar antes la verificación completa (\`${full}\`)?`,
        `Run the full verification (\`${full}\`) first?`,
      ),
    ))
  ) {
    const result = await execute(full, [], {
      cwd: session.root,
      shell: true,
      env: session.environment.env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
    terminal.note(
      result.code === 0
        ? t("Verificación correcta", "Verification passed")
        : t("Verificación fallida", "Verification failed"),
      tail(result, 15).join("\n"),
    );
    if (
      result.code !== 0 &&
      !(await terminal.confirm(t("¿Aceptar de todos modos?", "Accept anyway?")))
    )
      return postponed(session, state);
  }
  if (
    !(await terminal.confirm(
      t(`¿Aceptar el resultado de «${view.title}»?`, `Accept the result of "${view.title}"?`),
    ))
  )
    return postponed(session, state);
  const moved = transition({
    phase: "acceptance",
    kind: state.kind,
    actor: "human",
    event: { type: "accept" },
  });
  if (!moved.ok)
    return blockedCard(
      headerOf(state.id, state.phase),
      moved.code,
      t(
        `revisa \`${session.cards.command} status\`.`,
        `check \`${session.cards.command} status\`.`,
      ),
    );
  if (moved.phase === "done")
    return closeQuick(
      session,
      change,
      view.tasks.map((task) => task.summary ?? task.title),
    );
  await commitState(
    session,
    change,
    { ...state, phase: moved.phase },
    "change.accepted",
    { revision: state.revision },
    "human",
  );
  return decisionCard(
    headerOf(state.id, moved.phase),
    [
      t(
        "Resultado aceptado; el agente redactará el cierre.",
        "Result accepted; the agent will write the closing.",
      ),
    ],
    session.cards,
  );
}

/** `specty close`: a person confirms the closing and the change is archived. */

async function closeQuick(
  session: Session,
  change: StoredChange,
  summaries: readonly string[],
): Promise<Output> {
  const t = translator(session.lang);
  // As when closing: the main branch comes in first, and a refusal leaves it in acceptance.
  const plan = await integrationOf(session, change.state);
  const absorbed =
    plan === undefined ? undefined : await absorbTarget(session, plan, change, "accept");
  if (absorbed?.ok === false) return absorbed.output;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const closing = `### ${t("Resumen", "Summary")}\n\n${summaries.join("\n")}`;
  await writeText(
    change.files.spec,
    serializeSpec({ ...spec, sections: { ...spec.sections, closing } }),
  );
  const archived = await archive(
    session,
    change,
    { ...change.state, phase: "done" },
    "change.closed",
    { lane: "quick" },
  );
  const commit = await commitArchive(
    session,
    change,
    archived,
    `docs(spec): ${t("cerrar", "close")} ${spec.title}`,
  );
  const landed = plan === undefined ? undefined : await landChange(session, plan);
  return withIntegration(
    session,
    closedCard(
      headerOf(change.state.id, "done"),
      t(
        `Cambio aceptado, cerrado y archivado (commit ${commit}).`,
        `Change accepted, closed and archived (commit ${commit}).`,
      ),
      landed?.landed === true ? undefined : change.state.branch,
      session.cards,
    ),
    absorbed?.lines ?? [],
    landed,
  );
}
