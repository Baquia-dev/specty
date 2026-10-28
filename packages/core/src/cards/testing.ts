// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { isTestFile } from "../scope/tests";
import { termsSection } from "./glossary";
import { translator } from "./text";
import type { CardContext, ChangeView, CriterionView } from "./view";

// The testing phase (ADR 0014): the tests of the criteria come before the code.

/** What the agent writes in the testing phase: a failing test per criterion, and nothing else. */
export function testingCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const owing = change.tasks.filter((task) => task.testRules === "first");
  const tests = [...new Set(owing.flatMap((task) => task.files).filter(isTestFile))];
  const implicit = ctx.implicitTests
    ? [t("+ tests junto a los archivos del cambio", "+ tests next to the change's files")]
    : [];
  return {
    status: "ok",
    header: headerOf(change.id, "testing"),
    blocks: [
      ...section(undefined, [
        t(
          "FASE DE TESTS: los tests de los criterios van antes que el código.",
          "TESTING PHASE: the tests of the criteria come before the code.",
        ),
      ]),
      ...section(t("CRITERIOS", "CRITERIA"), criteriaOf(owing.flatMap((task) => task.criteria))),
      ...termsSection(
        change.glossary,
        owing.flatMap((task) => task.criteria.map((criterion) => criterion.text)),
        ctx.lang,
      ),
      ...section(t("ARCHIVOS PERMITIDOS", "ALLOWED FILES"), [...tests, ...implicit]),
      ...section("TESTS", [
        t(
          "Un test por criterio, con su id en el nombre (`AC1: …`).",
          "One test per criterion, with its id in the name (`AC1: …`).",
        ),
        t(
          "Solo tests: ni código de producción ni sus firmas; un test que no compila cuenta como rojo.",
          "Only tests: neither production code nor its signatures; a test that does not compile counts as red.",
        ),
      ]),
    ],
    next: t(
      `escribe los tests y envíalos con \`${ctx.command} propose\`.`,
      `write the tests and send them with \`${ctx.command} propose\`.`,
    ),
  };
}

/** Each criterion once, in the order the tasks name them. */
function criteriaOf(criteria: readonly CriterionView[]): string[] {
  const seen = new Map(criteria.map((criterion) => [criterion.id, criterion.text]));
  return [...seen].map(([id, text]) => `${id}: ${text}`);
}
