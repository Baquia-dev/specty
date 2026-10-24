// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  evaluateTaskScope,
  type Finding,
  parseSpec,
  type Spec,
  scopeRulesFrom,
  specHash,
  translator,
} from "@baquia-dev/specty-core";
import { resolveActive } from "../flow/active";
import type { Session } from "../session";
import { loadChange, readSpec } from "../store/changes";
import type { CheckDefinition, Provider } from "./provider";

/**
 * The checks `--spec` adds (ADR 0012): what the approved plan of a change allows the diff. The
 * approval stays in `state.json`, which the agent cannot write, and the scope is the plan's
 * Files with the files of its tasks, as `task done` reads it.
 */

/** The change `--spec` names, or the active one, with its spec; or why there is none. */
export type Plan =
  | { readonly id: string; readonly state: ChangeState; readonly spec: Spec }
  | { readonly missing: string | undefined };

export async function loadPlan(session: Session, id: string | undefined): Promise<Plan> {
  const change =
    id === undefined ? await resolveActive(session) : await loadChange(session.paths, id);
  if (change === undefined) return { missing: id };
  const { spec } = parseSpec(await readSpec(change.files), { language: session.lang });
  return { id: change.state.id, state: change.state, spec };
}

/** The checks of `plan`; `extra` are the ones of other files that need it too. */
export function planProvider(plan: Plan, extra: readonly CheckDefinition[] = []): Provider {
  return {
    id: "plan",
    applies: () => true,
    checks: [approved(plan), scope(plan), ...extra],
  };
}

function approved(plan: Plan): CheckDefinition {
  return {
    id: "spec-approved",
    async run({ session }) {
      const problem = approvalProblem(plan, translator(session.lang));
      return { findings: problem === undefined ? [] : [{ message: problem }] };
    },
  };
}

type Translate = ReturnType<typeof translator>;

/** Why there is no plan: no active change, or none with the id `--spec` gave. */
export function missingPlan(id: string | undefined, t: Translate): string {
  return id === undefined
    ? t("No hay un cambio activo en esta carpeta", "There is no active change in this folder")
    : t(`No hay un cambio ${id}`, `There is no change ${id}`);
}

function approvalProblem(plan: Plan, t: Translate): string | undefined {
  if ("missing" in plan) return missingPlan(plan.missing, t);
  const { id, state } = plan;
  if (state.phase === "cancelled") return t(`${id} está cancelado`, `${id} is cancelled`);
  if (state.approved === undefined) {
    return t(`La spec de ${id} no está aprobada`, `The spec of ${id} is not approved`);
  }
  // The closing comes after the approval and is no part of what was approved.
  const { closing: _closing, ...sections } = plan.spec.sections;
  if (specHash({ ...plan.spec, sections }) === state.approved.hash) return undefined;
  const revision = state.approved.revision;
  return t(
    `La spec de ${id} cambió desde su aprobación (revisión ${revision})`,
    `The spec of ${id} changed since it was approved (revision ${revision})`,
  );
}

function scope(plan: Plan): CheckDefinition {
  return {
    id: "scope",
    async run({ session, files }) {
      const t = translator(session.lang);
      if ("missing" in plan) return { skipped: missingPlan(plan.missing, t) };
      const { spec, state } = plan;
      const planned = (spec.sections.files?.items ?? []).flatMap((entry) =>
        entry.from === undefined ? [entry.path] : [entry.from, entry.path],
      );
      const tasks = spec.sections.tasks?.items ?? [];
      const evaluation = evaluateTaskScope({
        changed: files.map((path) => ({ path, status: "modified" })),
        taskFiles: [...planned, ...tasks.flatMap((task) => task.files)],
        extras: Object.values(state.tasks).flatMap((task) => task.scopeExtra),
        rules: scopeRulesFrom(session.config),
      });
      const findings = evaluation.outOfScope.map(
        (path): Finding => ({
          path,
          message: t("fuera del alcance de la spec", "outside the scope of the spec"),
        }),
      );
      return { findings };
    },
  };
}
