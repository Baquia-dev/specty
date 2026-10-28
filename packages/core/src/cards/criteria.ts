// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";
import type { CriterionTestsView } from "./view";

// Each criterion and the tests that carry its id (ADR 0014), as the acceptance shows them.

/** The tests a criterion's line shows; the rest it only counts. */
const SHOWN_TESTS = 3;

/**
 * One line per criterion: where its first tests are, by file and line, with their task and
 * commit, and how many more there are; or why none.
 */
export function criteriaTestLines(criteria: readonly CriterionTestsView[], lang: Lang): string[] {
  const t = translator(lang);
  return criteria.map((criterion) => {
    const tests = criterion.tests
      .toSorted((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
      .map((test) => `${test.path}:${test.line} (${test.task}, ${test.commit})`);
    const more = tests.length - SHOWN_TESTS;
    const shown =
      tests.slice(0, SHOWN_TESTS).join(", ") +
      (more > 0 ? t(` y ${more} más`, ` and ${more} more`) : "");
    const where = [
      ...(shown === "" ? [] : [shown]),
      ...(criterion.manual ? [t("a mano (test: manual)", "by hand (test: manual)")] : []),
    ];
    return `${criterion.id}: ${where.length === 0 ? t("sin test", "no test") : where.join(", ")}`;
  });
}

/**
 * The criteria the person checks by hand, and those a `feat` or `fix` task covers that no test
 * carries the id of: for the person as they are, and for the agent with what to do about each.
 */
export function criteriaWarnings(
  criteria: readonly CriterionTestsView[],
  lang: Lang,
  reader: "agent" | "person",
): string[] {
  const t = translator(lang);
  const manual = ids(criteria.filter((criterion) => criterion.manual));
  const untested = ids(
    criteria.filter(
      (criterion) => criterion.owed && !criterion.manual && criterion.tests.length === 0,
    ),
  );
  const advised = (line: string, advice: string) => (reader === "agent" ? [line, advice] : [line]);
  return [
    ...(manual === ""
      ? []
      : advised(
          t(
            `A comprobar a mano (test: manual): ${manual}.`,
            `To check by hand (test: manual): ${manual}.`,
          ),
          t(
            "Pide al usuario que los compruebe antes de aceptar.",
            "Ask the user to check them before they accept.",
          ),
        )),
    ...(untested === ""
      ? []
      : advised(
          t(
            `Sin un test con su id, aunque los cubre una tarea feat o fix: ${untested}.`,
            `No test with their id, though a feat or fix task covers them: ${untested}.`,
          ),
          t(
            "Cuéntaselo al usuario antes de que acepte: ningún test comprueba esos criterios.",
            "Tell the user before they accept: no test checks those criteria.",
          ),
        )),
  ];
}

function ids(criteria: readonly CriterionTestsView[]): string {
  return criteria.map((criterion) => criterion.id).join(", ");
}
