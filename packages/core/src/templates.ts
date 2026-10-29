// SPDX-License-Identifier: Apache-2.0
import { translator } from "./cards/text";
import type { Lang } from "./i18n";
import { DEFAULT_CONFIG } from "./schema/config";
import { type ChangeKind, type FileEntry, SECTION_ORDER, type SectionKey } from "./spec/model";
import { fileLine, serializeSpec } from "./spec/serialize";
import { KIND_RULES, SECTION_TITLES } from "./spec/vocabulary";

/** Hints for the agent, as HTML comments; `propose` removes them. */
const HINTS: Readonly<Record<Lang, Readonly<Record<SectionKey, string>>>> = {
  es: {
    goal: "1–3 frases: qué cambia para el usuario y por qué.",
    question: "La pregunta que el spike debe responder.",
    reason: "Por qué se hizo el cambio. Si no lo sabes, pregúntale al usuario.",
    outOfScope:
      'Lo que este cambio NO hará, en viñetas. Escribe "- Ninguno" solo si de verdad no hay nada.',
    assumptions:
      'Lo que das por cierto sin confirmarlo: "- A1: …". Debajo, "  - impacto: alto" si cambiaría el diseño.',
    criteria:
      'Resultados observables: "- AC1: CUANDO … ENTONCES …". Debajo, "  - test: manual" si ningún test puede comprobarlo.',
    design: "Opcional: decisiones técnicas, componentes y datos. Borra la sección si no aplica.",
    files: 'Cada ruta que tocarás: "- crear|modificar|borrar ruta — motivo".',
    tasks:
      'Pasos pequeños y en orden: "- [ ] T1: título", y debajo "  - files: …", "  - ac: AC1", "  - verify: comando".',
    slices:
      'Cortes verticales que funcionan de punta a punta: "- C1: título", "  - ac: AC1", "  - depends: C0".',
    risks: 'Opcional: "- R1: riesgo — mitigación". Borra la sección si no aplica.',
    closing: "Se escribe al cerrar el cambio.",
  },
  en: {
    goal: "1–3 sentences: what changes for the user and why.",
    question: "The question the spike must answer.",
    reason: "Why the change was made. If you do not know, ask the user.",
    outOfScope: 'What this change will NOT do, as bullets. Write "- None" only if nothing applies.',
    assumptions:
      'What you take for granted without confirmation: "- A1: …". Below it, "  - impact: high" if it would change the design.',
    criteria:
      'Observable outcomes: "- AC1: WHEN … THEN …". Below it, "  - test: manual" if no test can check it.',
    design: "Optional: technical decisions, components and data. Remove the section if unused.",
    files: 'Every path you will touch: "- create|modify|delete path — reason".',
    tasks:
      'Small, ordered steps: "- [ ] T1: title", then "  - files: …", "  - ac: AC1", "  - verify: command".',
    slices:
      'Vertical slices that work end to end: "- C1: title", "  - ac: AC1", "  - depends: C0".',
    risks: 'Optional: "- R1: risk — mitigation". Remove the section if unused.',
    closing: "Written when the change closes.",
  },
};

/** What the first change of a new project needs to hear instead (ARCHITECTURE §14). */
const BOOTSTRAP_HINTS: Readonly<Record<Lang, Readonly<Partial<Record<SectionKey, string>>>>> = {
  es: {
    goal: "El esqueleto del proyecto, a partir de PRODUCT.md: qué se podrá hacer y comprobar al terminar este cambio.",
    assumptions:
      'El stack, las herramientas y los comandos que eliges (o que pide PRODUCT.md), uno por supuesto: "- A1: …"; con "  - impacto: alto" los que el usuario debe confirmar.',
    files:
      'Lo que crea el andamiaje: el manifiesto y la configuración, el primer test, y con un glob lo que genere una herramienta: "- crear src/** — …".',
    tasks:
      'Pasos pequeños: la primera tarea deja el proyecto construyendo y con un test que pasa. Cada tarea con "  - verify: comando", porque aún no hay verify.default.',
  },
  en: {
    goal: "The project's skeleton, from PRODUCT.md: what can be done and checked when this change ends.",
    assumptions:
      'The stack, tools and commands you choose (or PRODUCT.md asks for), one per assumption: "- A1: …"; with "  - impact: high" those the user must confirm.',
    files:
      'What the scaffolding creates: the manifest and configuration, the first test, and with a glob what a tool generates: "- create src/** — …".',
    tasks:
      'Small steps: the first task leaves the project building with a passing test. Every task with "  - verify: command", since there is no verify.default yet.',
  },
};

export interface TemplateOptions {
  readonly kind: ChangeKind;
  readonly lang: Lang;
  readonly title: string;
  readonly timebox?: string;
  readonly follows?: readonly string[];
  readonly epic?: string;
  readonly slice?: string;
  /** Pre-filled Files section (retro specs are written from the diff). */
  readonly files?: readonly FileEntry[];
  /** The first change of a new project: its skeleton (ARCHITECTURE §14). */
  readonly bootstrap?: boolean;
  /** Sections that come written (`specty import`), in place of their hint. */
  readonly prefilled?: Readonly<Partial<Record<SectionKey, string>>>;
}

/** Skeleton of a new spec: frontmatter, title and one hinted section per allowed section. */
export function specTemplate(options: TemplateOptions): string {
  const { kind, lang } = options;
  const rules = KIND_RULES[kind];
  const keys = SECTION_ORDER.filter(
    (key) => rules.required.includes(key) || rules.optional.includes(key),
  );
  const header = serializeSpec({
    language: lang,
    title: options.title,
    sections: {},
    frontmatter: {
      kind,
      follows: options.follows ?? [],
      dependsOn: [],
      ...(options.timebox !== undefined ? { timebox: options.timebox } : {}),
      ...(options.epic !== undefined ? { epic: options.epic } : {}),
      ...(options.slice !== undefined ? { slice: options.slice } : {}),
    },
  }).trimEnd();
  const sections = keys.map((key) => `## ${SECTION_TITLES[lang][key]}\n\n${bodyOf(key, options)}`);
  return `${[header, ...sections].join("\n\n")}\n`;
}

/** A section's body in the skeleton: what came written, a retro's files, or its hint. */
function bodyOf(key: SectionKey, options: TemplateOptions): string {
  const { lang } = options;
  const written = options.prefilled?.[key];
  if (written !== undefined) return written;
  if (key === "files" && options.files !== undefined && options.files.length > 0) {
    return options.files.map((entry) => fileLine(entry, lang)).join("\n");
  }
  const hint =
    (options.bootstrap === true ? BOOTSTRAP_HINTS[lang][key] : undefined) ?? HINTS[lang][key];
  return `<!-- ${hint} -->`;
}

/** What `init` detected, for the first `.specty/config.yaml`. */
export interface ConfigTemplateOptions {
  readonly lang: Lang;
  /** The verification commands found in the project. */
  readonly verify: { readonly default?: string; readonly full?: string };
  /** Generated files, which tasks may change without asking. */
  readonly generated: readonly string[];
  /** Paths under the flow and free paths, when they come from elsewhere (the legacy's). */
  readonly governed?: readonly string[];
  readonly ignored?: readonly string[];
}

/** `.specty/config.yaml` with the detected values and short comments (docs/formats.md §6). */
export function configTemplate(options: ConfigTemplateOptions): string {
  const { lang, verify } = options;
  const t = translator(lang);
  const list = (values: readonly string[]) => JSON.stringify(values);
  const optional = (key: string, value: string | undefined) =>
    value === undefined ? [] : [`  ${key}: ${JSON.stringify(value)}`];
  return [
    t(
      "# Configuración de Specty. Referencia: docs/formats.md §6",
      "# Specty configuration. Reference: docs/formats.md §6",
    ),
    "version: 1",
    `language: ${lang}`,
    "mode: individual",
    t(
      "# Rutas donde rige el flujo: código que necesita una spec aprobada.",
      "# Paths under the flow: code that needs an approved spec.",
    ),
    `governed: ${list(options.governed ?? DEFAULT_CONFIG.governed)}`,
    t(
      "# Rutas libres: documentación y archivos que no son código.",
      "# Free paths: documentation and non-code files.",
    ),
    `ignored: ${list(options.ignored ?? DEFAULT_CONFIG.ignored)}`,
    t(
      "# Rutas que nunca se aprueban solas y que pesan en el tamaño.",
      "# Paths never approved automatically, weighed in the size.",
    ),
    `sensitive: ${list(DEFAULT_CONFIG.sensitive)}`,
    "verify:",
    ...optional("default", verify.default),
    ...optional("full", verify.full),
    `  timeoutSec: ${DEFAULT_CONFIG.verify.timeoutSec}`,
    "scope:",
    "  implicitTests: true",
    `  generated: ${list(options.generated)}`,
    "  autoApprove: tests-and-generated",
    "policy:",
    // A new project starts with the tests as contract (ADR 0014); a config without the key stays `recommended`.
    "  tests: contract",
    "retro:",
    "  mode: agent",
    "git:",
    "  branchPerChange: true",
    "",
  ].join("\n");
}

/** The brief interview of ARCHITECTURE §14: a section of PRODUCT.md and its question, per language. */
const PRODUCT_QUESTIONS: Readonly<Record<Lang, readonly (readonly [string, string])[]>> = {
  es: [
    ["Qué es", "¿Qué vas a construir? Una o dos frases."],
    ["Para quién", "¿Para quién es?"],
    ["Alcance del MVP", "¿Qué tiene que hacer la primera versión?"],
    ["Fuera de alcance", "¿Qué queda fuera, al menos por ahora?"],
    ["Stack", "¿Con qué lenguaje y herramientas? (o «recomiéndame»)"],
    ["Despliegue", "¿Dónde y cómo se va a usar o desplegar?"],
    ["Restricciones", "¿Alguna restricción? (plazos, presupuesto, normas, compatibilidad…)"],
  ],
  en: [
    ["What it is", "What are you building? One or two sentences."],
    ["Who it is for", "Who is it for?"],
    ["MVP scope", "What must the first version do?"],
    ["Out of scope", "What stays out, at least for now?"],
    ["Stack", 'Which language and tools? (or "recommend one")'],
    ["Deployment", "Where and how will it be used or deployed?"],
    ["Constraints", "Any constraints? (deadlines, budget, rules, compatibility…)"],
  ],
};

/** The interview's sections of PRODUCT.md, each with its question. */
export function productQuestions(lang: Lang): readonly (readonly [string, string])[] {
  return PRODUCT_QUESTIONS[lang];
}

/** PRODUCT.md of a new project: one section per answer, and the question as a comment where none. */
export function productTemplate(name: string, lang: Lang, answers: readonly string[]): string {
  const sections = PRODUCT_QUESTIONS[lang].map(([heading, question], index) => {
    const answer = answers[index] ?? "";
    return `## ${heading}\n\n${answer === "" ? `<!-- ${question} -->` : answer}\n`;
  });
  return [`# ${name}\n`, ...sections].join("\n");
}
