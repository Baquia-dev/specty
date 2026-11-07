// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

// What the page «Configuración» says of the settings of sections «Avisos» and «Consumo y
// sesiones» (`settings/catalog.ts`): the warnings of the spec and of the sessions. `settings.ts`
// gathers them with the rest.

/** Each setting's `[name, description]` in each language, by its key. */
export const WARNINGS_TEXTS: Readonly<
  Record<string, Readonly<Record<Lang, readonly [string, string]>>>
> = {
  "warnings.vagueTerms": {
    es: [
      "Términos vagos",
      "Palabras o frases que un criterio no debe usar, sumadas a las de Specty: la spec avisa del criterio que tenga una, sin mirar acentos ni mayúsculas.",
    ],
    en: [
      "Vague terms",
      "Words or phrases a criterion should not use, added to Specty's: the spec warns about a criterion that has one, ignoring accents and capitals.",
    ],
  },
  "warnings.horizontalLayers": {
    es: [
      "Capas horizontales",
      "Palabras o frases que hacen de un corte una capa técnica, sumadas a las de Specty: una épica con un corte que tenga una en su título no se aprueba.",
    ],
    en: [
      "Horizontal layers",
      "Words or phrases that make a slice a technical layer, added to Specty's: an epic with a slice that has one in its title is not approved.",
    ],
  },
  "usage.freshSessionTokens": {
    es: [
      "Umbral de sesión nueva",
      "Con más tokens de contexto en la sesión del agente, el cierre aconseja una sesión nueva para el siguiente cambio.",
    ],
    en: [
      "Fresh session threshold",
      "Above these tokens of context in the agent's session, the closing advises a fresh session for the next change.",
    ],
  },
  "usage.ccusage.timeoutSec": {
    es: [
      "Espera a ccusage",
      "Cuánto espera Specty cada informe de ccusage, de 1 a 600 s; si no llega, el cierre sigue sin el consumo.",
    ],
    en: [
      "ccusage's wait",
      "How long Specty waits for each report of ccusage, from 1 to 600 s; if it does not come, the closing goes on without the consumption.",
    ],
  },
  "usage.ccusage.version": {
    es: [
      "Versión de ccusage",
      "La que specty doctor dice que instales cuando falta ccusage; Specty usa la que haya instalada.",
    ],
    en: [
      "ccusage version",
      "The one specty doctor says to install when ccusage is missing; Specty uses whichever is installed.",
    ],
  },
};
