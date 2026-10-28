// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { isTestFile } from "../scope/tests";
import { translator } from "./text";
import type { CardContext, ChangeView, CriterionView } from "./view";

// The testing phase (ADR 0014): the tests of the criteria come before the code.

/** What the agent writes in the testing phase: a failing test per criterion, and nothing else. */
export function testingCard(change: ChangeView, ctx: CardContext): Output {
  if (change.testsSubmitted === true) return testsSubmittedCard(change.id, undefined, ctx);
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

/**
 * The tests are sent and wait for the gate 2: the person's approval, or the agent's in delegated
 * mode. Right after `propose`, `sent` says what was committed.
 */
export function testsSubmittedCard(
  id: string,
  sent: { readonly commit: string; readonly files: readonly string[] } | undefined,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const delegated = ctx.delegated === true;
  return {
    status: "ok",
    header: headerOf(id, "testing"),
    blocks:
      sent === undefined
        ? section(undefined, [
            delegated
              ? t(
                  "Tests enviados; en modo delegado los apruebas tú.",
                  "Tests sent; in delegated mode you approve them.",
                )
              : t(
                  "Tests enviados; falta la aprobación del usuario.",
                  "Tests sent; waiting for the user's approval.",
                ),
          ])
        : section(
            t(`TESTS ENVIADOS (commit ${sent.commit})`, `TESTS SENT (commit ${sent.commit})`),
            sent.files,
          ),
    next: delegated
      ? t(
          `modo delegado: aprueba tú los tests con \`${ctx.command} approve\` y sigue su salida.`,
          `delegated mode: approve the tests yourself with \`${ctx.command} approve\` and follow its output.`,
        )
      : t(
          `pide al usuario que revise los tests y los apruebe con \`${ctx.command} approve\`, y termina tu turno.`,
          `ask the user to review the tests and approve them with \`${ctx.command} approve\`, and end your turn.`,
        ),
  };
}

/** Why `propose` sent nothing in the testing phase: no new tests, or code changed with them. */
export type TestsRefusal =
  | { readonly reason: "no-tests" }
  | { readonly reason: "code"; readonly paths: readonly string[] };

export function testsRefusedCard(id: string, refusal: TestsRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const again = t(
    `vuelve a ejecutar \`${ctx.command} propose\``,
    `run \`${ctx.command} propose\` again`,
  );
  return refusal.reason === "no-tests"
    ? {
        status: "blocked",
        header: headerOf(id, "testing"),
        blocks: section(undefined, [
          t(
            "No hay tests nuevos de los archivos del cambio que enviar.",
            "There are no new tests of the change's files to send.",
          ),
        ]),
        next: t(
          `escribe los tests de los criterios y ${again}.`,
          `write the tests of the criteria and ${again}.`,
        ),
      }
    : {
        status: "blocked",
        header: headerOf(id, "testing"),
        blocks: section(
          t(
            "En la fase de tests solo se envían tests; cambió este código",
            "In the testing phase only tests are sent; this code changed",
          ),
          refusal.paths,
        ),
        next: t(
          `deshaz esos cambios, porque el código va después de que la persona apruebe los tests, y ${again}.`,
          `undo those changes, since the code comes after the person approves the tests, and ${again}.`,
        ),
      };
}

/** What `specty approve` asks the person in the testing phase. */
export function approveTestsQuestion(title: string, lang: Lang): string {
  return translator(lang)(`¿Aprobar los tests de «${title}»?`, `Approve the tests of "${title}"?`);
}

/** The tests approved, with the commit that records it. */
export function testsApprovedLine(commit: string, lang: Lang): string {
  return translator(lang)(
    `Tests aprobados (commit ${commit}).`,
    `Tests approved (commit ${commit}).`,
  );
}

/** Each criterion once, in the order the tasks name them. */
function criteriaOf(criteria: readonly CriterionView[]): string[] {
  const seen = new Map(criteria.map((criterion) => [criterion.id, criterion.text]));
  return [...seen].map(([id, text]) => `${id}: ${text}`);
}
