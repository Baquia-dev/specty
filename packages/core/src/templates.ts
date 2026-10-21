// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "./i18n";
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
    criteria: 'Resultados observables: "- AC1: CUANDO … ENTONCES …".',
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
    criteria: 'Observable outcomes: "- AC1: WHEN … THEN …".',
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
  const sections = keys.map((key) => {
    const prefilled =
      key === "files" && options.files !== undefined && options.files.length > 0
        ? options.files.map((entry) => fileLine(entry, lang)).join("\n")
        : `<!-- ${HINTS[lang][key]} -->`;
    return `## ${SECTION_TITLES[lang][key]}\n\n${prefilled}`;
  });
  return `${[header, ...sections].join("\n\n")}\n`;
}
