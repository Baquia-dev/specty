// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { isTestFile } from "../scope/tests";
import { termsSection } from "./glossary";
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
      ...section(
        t("CRITERIOS", "CRITERIA"),
        criteriaOf(owing.flatMap((task) => task.criteria).filter((criterion) => !criterion.manual)),
      ),
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

/**
 * Why `propose` sent nothing in the testing phase: no new tests, code changed with them, a
 * criterion without its test, or tests that are not red.
 */
export type TestsRefusal =
  | { readonly reason: "no-tests" }
  | { readonly reason: "code"; readonly paths: readonly string[] }
  | { readonly reason: "untested"; readonly criteria: readonly string[] }
  | { readonly reason: "green"; readonly commands: readonly string[] }
  | { readonly reason: "unnamed"; readonly paths: readonly string[] };

export function testsRefusedCard(id: string, refusal: TestsRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const again = t(
    `vuelve a ejecutar \`${ctx.command} propose\``,
    `run \`${ctx.command} propose\` again`,
  );
  const { title, next } = REFUSALS[refusal.reason](t, again);
  const items = itemsOf(refusal);
  return {
    status: "blocked",
    header: headerOf(id, "testing"),
    blocks: items === undefined ? section(undefined, [title]) : section(title, items),
    next,
  };
}

/** What a refusal is about: the paths, the criteria or the commands, when it lists any. */
function itemsOf(refusal: TestsRefusal): readonly string[] | undefined {
  switch (refusal.reason) {
    case "code":
    case "unnamed":
      return refusal.paths;
    case "untested":
      return refusal.criteria;
    case "green":
      return refusal.commands;
    case "no-tests":
      return undefined;
  }
}

type Words = (
  t: ReturnType<typeof translator>,
  again: string,
) => { readonly title: string; readonly next: string };

/** Each refusal in words: what is wrong, and what to do. */
const REFUSALS: Readonly<Record<TestsRefusal["reason"], Words>> = {
  "no-tests": (t, again) => ({
    title: t(
      "No hay tests nuevos de los archivos del cambio que enviar.",
      "There are no new tests of the change's files to send.",
    ),
    next: t(
      `escribe los tests de los criterios y ${again}.`,
      `write the tests of the criteria and ${again}.`,
    ),
  }),
  code: (t, again) => ({
    title: t(
      "En la fase de tests solo se envían tests; cambió este código",
      "In the testing phase only tests are sent; this code changed",
    ),
    next: t(
      `deshaz esos cambios, porque el código va después de que la persona apruebe los tests, y ${again}.`,
      `undo those changes, since the code comes after the person approves the tests, and ${again}.`,
    ),
  }),
  untested: (t, again) => ({
    title: t(
      "Estos criterios no tienen un test nuevo con su id",
      "These criteria have no new test with their id",
    ),
    next: t(
      `escribe un test por criterio, con su id en el nombre (\`AC1: …\`), y ${again}.`,
      `write one test per criterion, with its id in the name (\`AC1: …\`), and ${again}.`,
    ),
  }),
  green: (t, again) => ({
    title: t(
      "Los tests nuevos no fallan: pasó su verificación",
      "The new tests do not fail: their verification passed",
    ),
    next: t(
      `escribe los tests de modo que fallen sin el código y ${again}.`,
      `write the tests so that they fail without the code and ${again}.`,
    ),
  }),
  unnamed: (t, again) => ({
    title: t(
      "La verificación falla, pero su salida no nombra estos tests nuevos",
      "The verification fails, but its output does not name these new tests",
    ),
    next: t(
      `comprueba que la verificación de su tarea los ejecuta y que fallan sin el código, y ${again}.`,
      `check that their task's verification runs them and that they fail without the code, and ${again}.`,
    ),
  }),
};

/**
 * The agent in delegated mode does not decide a request that unlocks an approved test: only the
 * person does (A2 of ADR 0014's epic), as with `delegate` and `uninstall`.
 */
export function unlockRefusedCard(header: string, request: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const decide = `\`${ctx.command} approve --scope ${request}\``;
  const reject = `\`${ctx.command} reject --scope ${request}\``;
  return {
    status: "blocked",
    header,
    blocks: section(undefined, [
      t(
        `${request} desbloquea un test aprobado: lo decide solo la persona, también en modo delegado.`,
        `${request} unlocks an approved test: only the person decides it, in delegated mode too.`,
      ),
    ]),
    next: t(
      `pide al usuario que lo decida con ${decide} o ${reject} en su terminal, y termina tu turno.`,
      `ask the user to decide it with ${decide} or ${reject} in their terminal, and end your turn.`,
    ),
  };
}

/** What `specty approve` asks the person in the testing phase. */
export function approveTestsQuestion(title: string, lang: Lang): string {
  return translator(lang)(`¿Aprobar los tests de «${title}»?`, `Approve the tests of "${title}"?`);
}

/** A bug's red tests, locked by themselves (ADR 0014): what comes before the task's card. */
export function testsLockedLead(commit: string, lang: Lang): string {
  return translator(lang)(
    `Tests en rojo y bloqueados (commit ${commit}): el fallo queda reproducido; ahora, el arreglo.`,
    `Tests red and locked (commit ${commit}): the defect is reproduced; now, the fix.`,
  );
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
