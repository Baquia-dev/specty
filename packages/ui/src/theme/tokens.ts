// SPDX-License-Identifier: Apache-2.0
import { type Lang, PHASES, type Phase } from "@baquia-dev/specty-core";

/** Inventory of the design tokens. Their values live only in `styles.css`. */
export type TokenGroup = "color" | "phase" | "type" | "space" | "radius" | "shadow" | "motion";

export interface Token {
  readonly name: `--${string}`;
  readonly group: TokenGroup;
  readonly es: string;
  readonly en: string;
}

const token = (name: `--${string}`, group: TokenGroup, es: string, en: string): Token => ({
  name,
  group,
  es,
  en,
});

export const PHASE_LABELS: Readonly<Record<Phase, Readonly<Record<Lang, string>>>> = {
  draft: { es: "Borrador", en: "Draft" },
  review: { es: "Revisión", en: "Review" },
  implementing: { es: "Implementación", en: "Implementing" },
  adjusting: { es: "Ajustes", en: "Adjusting" },
  acceptance: { es: "Aceptación", en: "Acceptance" },
  closing: { es: "Cierre", en: "Closing" },
  done: { es: "Terminado", en: "Done" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
};

const COLORS: readonly Token[] = [
  token("--color-bg", "color", "Fondo de la página", "Page background"),
  token("--color-surface", "color", "Tarjetas y paneles", "Cards and panels"),
  token("--color-border", "color", "Bordes y separadores", "Borders and dividers"),
  token("--color-text", "color", "Texto principal", "Primary text"),
  token("--color-text-muted", "color", "Texto secundario", "Secondary text"),
  token("--color-accent", "color", "Acción primaria", "Primary action"),
  token("--color-on-accent", "color", "Texto sobre el acento", "Text on the accent"),
  token(
    "--color-focus",
    "color",
    "Foco, sobre el borde del componente",
    "Focus, over the component's border",
  ),
  token(
    "--color-focus-on-accent",
    "color",
    "Foco sobre el acento (botón primario)",
    "Focus on the accent (primary button)",
  ),
];

const DIFF_COLORS: readonly Token[] = [
  token("--color-diff-added", "color", "Diff: línea añadida", "Diff: added line"),
  token("--color-diff-added-word", "color", "Diff: palabras añadidas", "Diff: added words"),
  token(
    "--color-diff-added-text",
    "color",
    "Diff: signo y cuenta de lo añadido",
    "Diff: sign and count of what was added",
  ),
  token("--color-diff-removed", "color", "Diff: línea quitada", "Diff: removed line"),
  token("--color-diff-removed-word", "color", "Diff: palabras quitadas", "Diff: removed words"),
  token(
    "--color-diff-removed-text",
    "color",
    "Diff: signo y cuenta de lo quitado",
    "Diff: sign and count of what was removed",
  ),
];

/** The colors of highlighted code; plain text and punctuation keep `--color-text`. */
const CODE_KINDS = ["keyword", "string", "comment", "function", "constant"] as const;

const CODE_LABELS: Readonly<Record<(typeof CODE_KINDS)[number], Readonly<Record<Lang, string>>>> = {
  keyword: { es: "Código: palabras clave", en: "Code: keywords" },
  string: { es: "Código: cadenas", en: "Code: strings" },
  comment: { es: "Código: comentarios, en cursiva", en: "Code: comments, in italics" },
  function: { es: "Código: funciones y tipos", en: "Code: functions and types" },
  constant: { es: "Código: constantes y números", en: "Code: constants and numbers" },
};

const CODE_COLORS: readonly Token[] = CODE_KINDS.map((kind) =>
  token(`--color-code-${kind}`, "color", CODE_LABELS[kind].es, CODE_LABELS[kind].en),
);

const PHASE_COLORS: readonly Token[] = PHASES.flatMap((phase) => [
  token(
    `--color-phase-${phase}`,
    "phase",
    `${PHASE_LABELS[phase].es}: icono y texto`,
    `${PHASE_LABELS[phase].en}: icon and text`,
  ),
  token(
    `--color-phase-${phase}-bg`,
    "phase",
    `${PHASE_LABELS[phase].es}: fondo`,
    `${PHASE_LABELS[phase].en}: background`,
  ),
]);

const TYPE_SIZES = ["xs", "sm", "base", "md", "lg", "xl", "2xl"] as const;

const TYPOGRAPHY: readonly Token[] = [
  token("--font-sans", "type", "Interfaz: Geist", "Interface: Geist"),
  token(
    "--font-mono",
    "type",
    "Rutas, comandos y código: Geist Mono",
    "Paths, commands and code: Geist Mono",
  ),
  ...TYPE_SIZES.map((size) => token(`--text-${size}`, "type", `Tamaño ${size}`, `Size ${size}`)),
];

const FOUNDATIONS: readonly Token[] = [
  token(
    "--spacing",
    "space",
    "Unidad de espaciado: todo es múltiplo de 4 px",
    "Spacing unit: everything is a multiple of 4 px",
  ),
  token("--radius-sm", "radius", "Insignias y Kbd", "Badges and Kbd"),
  token("--radius-md", "radius", "Campos y chips", "Fields and chips"),
  token("--radius-lg", "radius", "Botones", "Buttons"),
  token("--radius-xl", "radius", "Tarjetas", "Cards"),
  token("--shadow-sm", "shadow", "Elevación mínima", "Minimal elevation"),
  token("--shadow-md", "shadow", "Menús y diálogos", "Menus and dialogs"),
  token(
    "--duration-fast",
    "motion",
    "Respuesta inmediata (hover, foco)",
    "Immediate feedback (hover, focus)",
  ),
  token("--duration-base", "motion", "Transiciones; máximo 200 ms", "Transitions; 200 ms at most"),
  token(
    "--ease-standard",
    "motion",
    "Curva de todas las transiciones",
    "Curve of every transition",
  ),
];

export const TOKENS: readonly Token[] = [
  ...COLORS,
  ...DIFF_COLORS,
  ...CODE_COLORS,
  ...PHASE_COLORS,
  ...TYPOGRAPHY,
  ...FOUNDATIONS,
];

export function tokensOf(group: TokenGroup): readonly Token[] {
  return TOKENS.filter((item) => item.group === group);
}

/** Text/background pairs that must stay legible (WCAG 2.2 AA), with the minimum ratio. */
export interface ContrastPair {
  readonly fg: `--${string}`;
  readonly bg: `--${string}`;
  readonly min: number;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...(["--color-bg", "--color-surface"] as const).flatMap((bg) => [
    { fg: "--color-text", bg, min: 4.5 } as const,
    { fg: "--color-text-muted", bg, min: 4.5 } as const,
    { fg: "--color-focus", bg, min: 3 } as const,
  ]),
  { fg: "--color-on-accent", bg: "--color-accent", min: 4.5 },
  // Focus is drawn over the border, so it must stand out from it; inverted on the accent.
  { fg: "--color-focus", bg: "--color-border", min: 3 },
  { fg: "--color-focus-on-accent", bg: "--color-accent", min: 3 },
  ...PHASES.map((phase) => ({
    fg: `--color-phase-${phase}` as const,
    bg: `--color-phase-${phase}-bg` as const,
    min: 4.5,
  })),
  // Diff lines carry the text, the line numbers and the sign; the words that changed, the text.
  ...(["added", "removed"] as const).flatMap((side) => [
    { fg: "--color-text", bg: `--color-diff-${side}`, min: 4.5 } as const,
    { fg: "--color-text", bg: `--color-diff-${side}-word`, min: 4.5 } as const,
    { fg: "--color-text-muted", bg: `--color-diff-${side}`, min: 4.5 } as const,
    ...(["--color-bg", "--color-surface", `--color-diff-${side}`] as const).map(
      (bg) => ({ fg: `--color-diff-${side}-text`, bg, min: 4.5 }) as const,
    ),
  ]),
  // Highlighted code sits on the surface, on the changed lines and on the changed words.
  ...CODE_KINDS.flatMap((kind) =>
    (
      [
        "--color-surface",
        "--color-diff-added",
        "--color-diff-added-word",
        "--color-diff-removed",
        "--color-diff-removed-word",
      ] as const
    ).map((bg) => ({ fg: `--color-code-${kind}`, bg, min: 4.5 }) as const),
  ),
];

/** WCAG contrast ratio between two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match?.[1] === undefined) throw new Error(`Not a #rrggbb color: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  const [r, g, b] = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
