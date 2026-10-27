// SPDX-License-Identifier: Apache-2.0
import fc from "fast-check";
import {
  type Assumption,
  CHANGE_KINDS,
  COMMIT_TYPES,
  type Criterion,
  EFFORT_LEVELS,
  type FileAction,
  type FileEntry,
  type Frontmatter,
  type Impact,
  type ItemList,
  type Lang,
  type Risk,
  type Slice,
  type Spec,
  type Task,
} from "../../src";

const WORDS = [
  "modelo",
  "tarjeta",
  "gráfico",
  "filtro",
  "serie",
  "leyenda",
  "materia",
  "período",
  "año",
  "data",
  "view",
  "card",
  "chart",
  "legend",
  "user",
];

const phrase = fc
  .tuple(
    fc.array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 7 }),
    fc.constantFrom(" ", ", "),
  )
  .map(([words, separator]) => words.join(separator));

const sentence = phrase.map((text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`);

/** Prose with paragraphs and, sometimes, bullets and a fenced block that looks structural. */
const prose = fc
  .tuple(
    fc.array(sentence, { minLength: 1, maxLength: 3 }),
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
  )
  .map(([paragraphs, subheading, bullets, fence]) =>
    [
      ...(subheading ? ["### Detalle"] : []),
      paragraphs.join("\n\n"),
      ...(bullets ? ["- un punto de lista", "- otro punto"] : []),
      ...(fence ? ["```txt", "## no es una sección", "<!-- no es un comentario -->", "```"] : []),
    ].join("\n"),
  );

const path = fc
  .tuple(
    fc.constantFrom("lib", "src", "app"),
    fc.constantFrom("features", "core", "ui"),
    fc.constantFrom("home", "analytics", "profile", "grades"),
    fc.constantFrom("model", "view", "card", "service", "card_test"),
    fc.constantFrom(".dart", ".ts", ".py"),
  )
  .map(([root, area, module, name, extension]) => `${root}/${area}/${module}/${name}${extension}`);

const optional = <T>(arbitrary: fc.Arbitrary<T>) => fc.option(arbitrary, { nil: undefined });

function listOf<T>(items: fc.Arbitrary<readonly T[]>): fc.Arbitrary<ItemList<T>> {
  return fc.oneof(
    { arbitrary: items.map((list) => ({ none: false, items: list })), weight: 4 },
    { arbitrary: fc.constant({ none: true, items: [] }), weight: 1 },
  );
}

/** Up to three items numbered PREFIX1, PREFIX2… */
function numbered<S, T>(
  prefix: string,
  seed: fc.Arbitrary<S>,
  build: (seed: S, id: string) => T,
): fc.Arbitrary<T[]> {
  return fc
    .array(seed, { maxLength: 3 })
    .map((seeds) => seeds.map((value, index) => build(value, `${prefix}${index + 1}`)));
}

const fileEntry = (target: string): fc.Arbitrary<FileEntry> =>
  fc
    .tuple(fc.constantFrom<FileAction>("create", "modify", "delete", "rename"), optional(phrase))
    .map(([action, reason]) => ({
      action,
      path: target,
      ...(action === "rename" ? { from: target.replace(/(\.\w+)$/, "_old$1") } : {}),
      ...(reason !== undefined ? { reason } : {}),
    }));

const frontmatter: fc.Arbitrary<Frontmatter> = fc
  .record({
    kind: fc.constantFrom(...CHANGE_KINDS),
    epic: optional(fc.constant("20261015-dashboard-estudiante")),
    slice: optional(fc.constantFrom("C1", "C2")),
    follows: fc.subarray(["20261001-analytics-base", "20261002-grades"]),
    dependsOn: fc.subarray(["20261003-api"]),
    allowedDependencies: fc.subarray(["zod", "@angular/*", "riverpod"]),
    timebox: optional(fc.constantFrom("2h", "1d")),
    estimate: optional(
      fc.record({ adjust: fc.constantFrom<-1 | 0 | 1>(-1, 0, 1), reason: sentence }),
    ),
    effort: optional(fc.record({ review: fc.constantFrom(...EFFORT_LEVELS), reason: sentence })),
  })
  .map((data) => ({
    kind: data.kind,
    follows: data.follows,
    dependsOn: data.dependsOn,
    ...(data.allowedDependencies.length > 0
      ? { allowedDependencies: data.allowedDependencies }
      : {}),
    ...(data.epic !== undefined ? { epic: data.epic } : {}),
    ...(data.slice !== undefined ? { slice: data.slice } : {}),
    ...(data.timebox !== undefined ? { timebox: data.timebox } : {}),
    ...(data.estimate !== undefined ? { estimate: data.estimate } : {}),
    ...(data.effort !== undefined ? { effort: data.effort } : {}),
  }));

const task = (
  index: number,
  paths: readonly string[],
  criteria: readonly string[],
): fc.Arbitrary<Task> =>
  fc
    .record({
      title: phrase,
      done: fc.boolean(),
      files: fc.subarray([...paths]),
      ac: fc.oneof(
        fc.constant(undefined),
        fc.constant("none" as const),
        ...(criteria.length > 0 ? [fc.subarray([...criteria], { minLength: 1 })] : []),
      ),
      verify: optional(fc.constantFrom("pnpm test", "flutter test test/features", "pytest -q")),
      type: optional(fc.constantFrom(...COMMIT_TYPES)),
      notes: optional(sentence),
      effort: optional(
        fc.record(
          { level: fc.constantFrom(...EFFORT_LEVELS), reason: sentence },
          { requiredKeys: ["level"] },
        ),
      ),
    })
    .map((data) => ({
      id: `T${index + 1}`,
      title: data.title,
      done: data.done,
      files: data.files,
      ...(data.ac !== undefined ? { ac: data.ac } : {}),
      ...(data.verify !== undefined ? { verify: data.verify } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.effort !== undefined ? { effort: data.effort } : {}),
    }));

const tasks = (paths: readonly string[], criteria: readonly string[]): fc.Arbitrary<Task[]> =>
  fc
    .integer({ min: 0, max: 3 })
    .chain((count) =>
      fc.tuple(...Array.from({ length: count }, (_, index) => task(index, paths, criteria))),
    );

const slices = (criteria: readonly string[]): fc.Arbitrary<Slice[]> =>
  fc
    .integer({ min: 0, max: 3 })
    .chain((count) =>
      fc.tuple(
        ...Array.from({ length: count }, (_, index) =>
          fc
            .tuple(
              phrase,
              fc.subarray([...criteria]),
              fc.subarray(Array.from({ length: index }, (_, previous) => `C${previous + 1}`)),
            )
            .map(([title, ac, depends]) => ({ id: `C${index + 1}`, title, ac, depends })),
        ),
      ),
    );

const assumptions = numbered(
  "A",
  fc.tuple(sentence, optional(fc.constantFrom<Impact>("high", "medium", "low"))),
  ([text, impact], id): Assumption => ({ id, text, ...(impact !== undefined ? { impact } : {}) }),
);

const criteriaList = numbered(
  "AC",
  fc.tuple(
    fc.oneof(
      sentence,
      fc.tuple(phrase, phrase).map(([when, then]) => `CUANDO ${when} ENTONCES ${then}.`),
    ),
    fc.boolean(),
  ),
  ([text, manual], id): Criterion => ({ id, text, ...(manual ? { test: "manual" as const } : {}) }),
);

const risks = numbered("R", sentence, (text, id): Risk => ({ id, text }));

/** Random, syntactically valid specs (semantic rules are not required to hold). */
export const specArbitrary: fc.Arbitrary<Spec> = fc
  .tuple(
    fc.constantFrom<Lang>("es", "en"),
    frontmatter,
    phrase,
    fc.uniqueArray(path, { maxLength: 4 }),
    criteriaList,
  )
  .chain(([language, front, title, paths, criteria]) => {
    const ids = criteria.map((item) => item.id);
    return fc
      .record({
        goal: prose,
        question: optional(prose),
        reason: optional(prose),
        outOfScope: optional(prose),
        assumptions: optional(listOf(assumptions)),
        criteria: optional(listOf(fc.constant(criteria))),
        design: optional(prose),
        files: optional(listOf(fc.tuple(...paths.map(fileEntry)))),
        tasks: optional(listOf(tasks(paths, ids))),
        slices: optional(listOf(slices(ids))),
        risks: optional(listOf(risks)),
        closing: optional(prose),
      })
      .map(
        (s): Spec => ({
          language,
          frontmatter: front,
          title,
          sections: {
            goal: s.goal,
            ...(s.question !== undefined ? { question: s.question } : {}),
            ...(s.reason !== undefined ? { reason: s.reason } : {}),
            ...(s.outOfScope !== undefined ? { outOfScope: s.outOfScope } : {}),
            ...(s.assumptions !== undefined ? { assumptions: s.assumptions } : {}),
            ...(s.criteria !== undefined ? { criteria: s.criteria } : {}),
            ...(s.design !== undefined ? { design: s.design } : {}),
            ...(s.files !== undefined ? { files: s.files } : {}),
            ...(s.tasks !== undefined ? { tasks: s.tasks } : {}),
            ...(s.slices !== undefined ? { slices: s.slices } : {}),
            ...(s.risks !== undefined ? { risks: s.risks } : {}),
            ...(s.closing !== undefined ? { closing: s.closing } : {}),
          },
        }),
      );
  });
