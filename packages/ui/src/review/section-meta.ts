// SPDX-License-Identifier: Apache-2.0
import {
  LucideCircleSlash,
  LucideFolderTree,
  type LucideIconInput,
  LucideLightbulb,
  LucideListChecks,
  LucideListTodo,
  LucideOctagonAlert,
  LucidePenTool,
  LucideTarget,
} from "@lucide/angular";
import type { Bilingual, ReviewSection, ReviewView } from "../data/records";

type Translate = (es: string, en: string) => string;

/** Each section's icon and what it asks of the reviewer. */
export const SECTION_META: Readonly<
  Record<ReviewSection, { readonly icon: LucideIconInput; readonly hint: Bilingual }>
> = {
  goal: {
    icon: LucideTarget,
    hint: {
      es: "Qué cambia para quien usa el producto.",
      en: "What changes for the people using the product.",
    },
  },
  outOfScope: {
    icon: LucideCircleSlash,
    hint: { es: "Lo que este cambio no hará.", en: "What this change will not do." },
  },
  assumptions: {
    icon: LucideLightbulb,
    hint: {
      es: "Confirma o rechaza los de alto impacto: aprobar espera por ellos.",
      en: "Confirm or reject the high-impact ones: approval waits for them.",
    },
  },
  criteria: {
    icon: LucideListChecks,
    hint: { es: "Cómo se sabrá que está hecho.", en: "How we will know it is done." },
  },
  files: {
    icon: LucideFolderTree,
    hint: { es: "Lo único que el agente podrá tocar.", en: "The only files the agent may touch." },
  },
  tasks: {
    icon: LucideListTodo,
    hint: { es: "El orden en que trabajará el agente.", en: "The order the agent will work in." },
  },
  risks: {
    icon: LucideOctagonAlert,
    hint: {
      es: "Qué puede salir mal y cómo se mitiga.",
      en: "What could go wrong and how it is mitigated.",
    },
  },
  design: {
    icon: LucidePenTool,
    hint: {
      es: "Decisiones técnicas; ábrelo si necesitas el detalle.",
      en: "Technical decisions; open it for the detail.",
    },
  },
};

/** A short progress line for a section, or "" when there is nothing to count. */
export function sectionProgress(key: ReviewSection, review: ReviewView, t: Translate): string {
  switch (key) {
    case "assumptions": {
      const high = review.assumptions.filter((item) => item.impact === "high");
      const decided = high.filter((item) => item.decision !== "pending").length;
      if (high.length === 0) return "";
      return t(
        `${decided} de ${high.length} de alto impacto decididos`,
        `${decided} of ${high.length} high-impact decided`,
      );
    }
    case "tasks": {
      const done = review.tasks.filter((task) => task.status === "done").length;
      return t(
        `${done} de ${review.tasks.length} hechas`,
        `${done} of ${review.tasks.length} done`,
      );
    }
    case "files": {
      const count = review.files.reduce((total, group) => total + group.files.length, 0);
      const modules = review.files.length;
      return t(`${count} archivos en ${modules} módulos`, `${count} files in ${modules} modules`);
    }
    case "criteria": {
      const warnings = review.criteria.reduce((total, item) => total + item.warnings.length, 0);
      return warnings === 0 ? "" : t(`${warnings} avisos`, `${warnings} warnings`);
    }
    default:
      return "";
  }
}
