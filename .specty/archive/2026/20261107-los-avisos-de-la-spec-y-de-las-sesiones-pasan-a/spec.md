---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C7
---

# Los avisos de la spec y de las sesiones pasan a ser ajustes

## Objetivo

Hoy el umbral del aviso de sesión nueva, el tiempo que Specty espera a ccusage, la versión de ccusage que recomienda y los términos vagos y capas horizontales que busca en la spec están fijos en el código. Con este cambio son claves opcionales de `.specty/config.yaml` (`usage` y `warnings`), con los valores de hoy por defecto, y los términos y capas de la persona se suman a los de Specty. La página «Configuración» los muestra en sus secciones con la marca «Nuevo». Es el corte C7 de la épica, estrechado (R4 de la épica): cubre sus AC21, AC25 y AC26 salvo las reglas de riesgo propias.

## Fuera de alcance

- Las reglas de riesgo propias (`warnings.risks`), que se suman a las de Specty en la aceptación: pasan a un corte nuevo de la épica, que se ajusta para recogerlas. Tocan el catálogo de riesgos del core (`scope/risk.ts`), las tarjetas de aceptación y de lecciones, `flow/risk.ts` y `flow/task-views.ts` de la CLI y `data/warnings.ts` de la UI.
- Quitar o cambiar los términos vagos y las capas horizontales de Specty: la persona solo añade los suyos. El error de capa horizontal impide aprobar una épica, y esos errores son una garantía.
- Expresiones regulares propias para términos o capas: son palabras o frases.
- El tiempo que `init` espera al gestor de paquetes al añadir ccusage (5 min): `init` solo lo ofrece al crear `.specty/config.yaml`, cuando aún no hay clave que leer.
- Que Specty instale o actualice ccusage por su cuenta al cambiar la versión.
- Guardar los ajustes desde la UI (C2 y C10).

## Supuestos

- A1: El corte completo sale XL: con las reglas de riesgo propias son unos 25 archivos de core, CLI y UI, cada uno con su test. Por eso este cambio se estrecha a los avisos de la spec (términos vagos y capas horizontales) y a los de las sesiones (umbral de sesión nueva, tiempo y versión de ccusage). Las reglas de riesgo propias van a un corte nuevo de la épica.
  - impacto: alto
- A2: Las claves y sus valores por defecto son los de hoy. `usage.freshSessionTokens` vale 150000 y es un entero positivo. `usage.ccusage.timeoutSec` vale 60 y es un entero entre 1 y 600, para que el cierre nunca espere más de 10 minutos. `usage.ccusage.version` vale `20.0.45` y tiene la forma `x.y.z`, con una etiqueta opcional (`-beta.1`), porque va dentro del comando que se copia en la shell. `warnings.vagueTerms` y `warnings.horizontalLayers` son listas de textos no vacíos, vacías por defecto.
  - impacto: medio
- A3: Las claves van en un módulo de schema propio, `schema/warnings.ts`, como `internal-run.ts` de C9. Exporta la forma de los bloques `usage` y `warnings` (`WARNINGS_SHAPE`), sus valores por defecto y su `resolve`, y `config.ts` los reúne con spread en el schema, en `DEFAULT_CONFIG` y en `withDefaults`. `ResolvedConfig` siempre trae los valores resueltos, y la CLI los lee de `session.config`. Sus textos van en un módulo propio, `cards/settings-warnings.ts`, porque `cards/settings.ts` ya pasa de 300 líneas.
  - impacto: medio
- A4: Los términos y las capas de la persona son palabras o frases y se suman a los de Specty, que siguen. Se comparan como los de Specty, sin acentos ni mayúsculas y como palabras enteras. El aviso o el error nombra el término tal como lo escribió la persona.
  - impacto: medio
- A5: La versión de ccusage solo la lee el aviso de `specty doctor` cuando no encuentra ccusage. `init` ofrece la de por defecto, porque solo añade ccusage al crear la configuración. Specty sigue ejecutando el ccusage de `node_modules/.bin` o del PATH, sea cual sea su versión.
  - impacto: bajo
- A6: El tiempo de ccusage vale para cada informe que Specty le pide: el consumo del cierre y lo que gastó cada sesión en la página de sesiones de la UI (`sessionTotals`).
  - impacto: bajo
- A7: La página tiene dos secciones nuevas. «Avisos» (`warnings`) va detrás de «Verificaciones de calidad», y «Consumo y sesiones» (`usage`) detrás de «Memoria». Los cinco ajustes llevan la marca «Nuevo». La UI no cambia, porque pinta lo que dice el catálogo.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `usage.freshSessionTokens` y la última sesión de Claude Code que nombra la auditoría lleva más contexto que ese número ENTONCES el cierre aconseja una sesión nueva, y con ese número o menos no lo aconseja. Sin la clave, el umbral es 150.000 tokens, como hoy.
- AC2: CUANDO `.specty/config.yaml` tiene `usage.ccusage.timeoutSec` y ccusage tarda más que ese tiempo ENTONCES Specty deja de esperarlo y el cierre sigue como cuando ccusage no responde, sin consumo en la auditoría. Sin la clave, lo espera 60 s, como hoy.
- AC3: CUANDO `.specty/config.yaml` tiene `usage.ccusage.version` y el proyecto no tiene ccusage ENTONCES el aviso de `specty doctor` da el comando que instala esa versión. Sin la clave da la 20.0.45, que es también la que ofrece `init`.
- AC4: CUANDO `warnings.vagueTerms` lista términos y un criterio de la spec contiene uno, con o sin acentos y mayúsculas ENTONCES la validación avisa de término vago y nombra ese término. Los términos de Specty siguen avisando.
- AC5: CUANDO `warnings.horizontalLayers` lista términos y el título de un corte de una épica contiene uno ENTONCES la validación da el error de capa horizontal con ese término. Las capas de Specty siguen dándolo.
- AC6: CUANDO un valor de estas claves no es válido ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`. No son válidos un umbral que no sea un entero positivo, un tiempo fuera de 1 a 600 s, una versión sin la forma `x.y.z`, un término vacío o una clave que no existe en `usage`, `usage.ccusage` o `warnings`. Sin las claves, la configuración resuelta tiene 150000, 60, `20.0.45` y dos listas vacías.
- AC7: CUANDO la persona abre «Configuración» ENTONCES ve los cinco ajustes en las secciones «Avisos» y «Consumo y sesiones», con la marca «Nuevo», su clave y su valor. Con la UI en inglés, las secciones, los nombres y las descripciones salen en inglés, y cada ajuste tiene su nombre y su descripción en los dos idiomas.
- AC8: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta las cinco claves con sus valores por defecto y sus límites, y dice que los términos y las capas se suman a los de Specty. `docs/ARCHITECTURE.md` §13 y `docs/ui.md` dicen lo mismo donde hablan del aviso de sesión nueva, de ccusage y de la página.
  - test: manual

## Diseño

- Core, `schema/warnings.ts`: `WarningsConfig` (`usage: { freshSessionTokens, ccusage: { timeoutSec, version } }` y `warnings: { vagueTerms, horizontalLayers }`), `DEFAULT_WARNINGS`, `WARNINGS_SHAPE` (los `strictObject` opcionales de `usage`, `usage.ccusage` y `warnings`) y `resolveWarnings(input)`. `config.ts` hace que `ResolvedConfig` extienda `WarningsConfig` y añade `...WARNINGS_SHAPE` al schema, `...DEFAULT_WARNINGS` a `DEFAULT_CONFIG` y `...resolveWarnings(input)` a `withDefaults`.
- Core, `validate/quality.ts`: `checkCriteria` busca los términos de Specty y los de `ctx.config.warnings.vagueTerms`, y `checkVerticalSlices` las capas de Specty y las de `ctx.config.warnings.horizontalLayers`. Los de la persona se normalizan como el texto que se compara, con `fold` y sin signos, y se buscan como palabras enteras.
- Core, `settings/catalog.ts`: las secciones `warnings` (detrás de `checks`) y `usage` (detrás de `memory`). En ellas, `warnings.vagueTerms` y `warnings.horizontalLayers` (`list`), `usage.freshSessionTokens` y `usage.ccusage.timeoutSec` (`number`, el segundo en segundos) y `usage.ccusage.version` (`text`), todos con `new: true`.
- Core, `cards/settings-warnings.ts`: los nombres y las descripciones de los cinco ajustes en español y en inglés, que `cards/settings.ts` reúne con spread, como los de «Interno». `cards/settings.ts` añade los nombres de las dos secciones.
- CLI, `flow/usage.ts`: el aviso compara el contexto con `session.config.usage.freshSessionTokens`, y cada informe de ccusage espera `usage.ccusage.timeoutSec`. `install/usage.ts`: el comando lleva la versión que recibe. `init` usa la de `DEFAULT_CONFIG`, y `commands/doctor.ts` pasa a `usageDoctor` la de `session.config`, así que la constante deja de estar repetida en la CLI.
- Tests: `core/test/settings/catalog.test.ts` (AC6, AC7), `core/test/validate/quality.test.ts` (AC4, AC5), `ui/src/settings/settings-page.test.ts` (AC7), `cli/test/fresh-session.test.ts` (AC1), `cli/test/usage.test.ts` (AC2) y `cli/test/init-usage.test.ts` (AC3). Cada tarea tiene un solo ejecutor de tests en su verify (P190).

## Archivos

- crear packages/core/src/schema/warnings.ts — las claves `usage` y `warnings`, con sus límites y los valores de hoy
- modificar packages/core/src/schema/config.ts — reúne esos bloques en el schema, en `ResolvedConfig` y en `DEFAULT_CONFIG`
- modificar packages/core/src/validate/quality.ts — los términos vagos y las capas de la persona, sumados a los de Specty
- modificar packages/core/src/settings/catalog.ts — las secciones «Avisos» y «Consumo y sesiones», con los cinco ajustes nuevos
- crear packages/core/src/cards/settings-warnings.ts — los nombres y las descripciones de los cinco ajustes en español y en inglés
- modificar packages/core/src/cards/settings.ts — los nombres de las dos secciones y los textos del módulo nuevo
- modificar packages/core/test/settings/catalog.test.ts — los límites del schema, los valores por defecto, las secciones, las marcas y los textos
- modificar packages/core/test/validate/quality.test.ts — los términos vagos y las capas de la persona
- modificar packages/ui/src/settings/settings-page.test.ts — las dos secciones y sus ajustes con «Nuevo», en los dos idiomas
- modificar packages/cli/src/flow/usage.ts — el umbral de sesión nueva y el tiempo de ccusage, de la configuración
- modificar packages/cli/src/install/usage.ts — la versión de ccusage que recibe el comando
- modificar packages/cli/src/commands/doctor.ts — pasa la versión de la configuración al aviso de ccusage
- modificar packages/cli/test/fresh-session.test.ts — el umbral configurado
- modificar packages/cli/test/usage.test.ts — el tiempo de ccusage configurado
- modificar packages/cli/test/init-usage.test.ts — la versión configurada en el aviso de `doctor`
- modificar docs/formats.md — §6: las claves `usage` y `warnings`
- modificar docs/ARCHITECTURE.md — §13: el umbral de sesión nueva y el tiempo y la versión de ccusage salen de la configuración
- modificar docs/ui.md — las secciones «Avisos» y «Consumo y sesiones» de «Configuración»

## Tareas

- [x] T1: Las claves `usage` y `warnings` en el schema, los avisos de la spec que las usan y sus ajustes en el catálogo, con sus textos
  - files: packages/core/src/schema/warnings.ts, packages/core/src/schema/config.ts, packages/core/src/validate/quality.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-warnings.ts, packages/core/src/cards/settings.ts, packages/core/test/settings/catalog.test.ts, packages/core/test/validate/quality.test.ts, docs/formats.md
  - ac: AC4, AC5, AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/catalog.test.ts test/validate/quality.test.ts
- [x] T2: La página «Configuración» muestra las secciones «Avisos» y «Consumo y sesiones»
  - files: packages/ui/src/settings/settings-page.test.ts, docs/ui.md
  - ac: AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-page.test.ts
- [x] T3: El aviso de sesión nueva y ccusage usan el umbral, el tiempo y la versión de la configuración
  - files: packages/cli/src/flow/usage.ts, packages/cli/src/install/usage.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/fresh-session.test.ts, packages/cli/test/usage.test.ts, packages/cli/test/init-usage.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/fresh-session.test.ts test/usage.test.ts test/init-usage.test.ts && pnpm typecheck

## Riesgos

- R1: Un término propio muy común, como «datos», llena de avisos los criterios o bloquea las épicas cuyos cortes lo nombran. Mitigación: el aviso o el error nombra el término, quitarlo de la lista lo apaga y los de Specty no cambian.
- R2: Un tiempo de ccusage corto deja el cierre sin consumo en la auditoría. Mitigación: es el mismo camino de hoy cuando ccusage no responde, el cierre no se detiene y quitar la clave lo devuelve a 60 s.
- R3: C5, C6 y este corte añaden secciones y ajustes a la vez a `catalog.ts`, `cards/settings.ts`, `config.ts` y sus tests. Mitigación: cada corte tiene su módulo de schema, de textos y su bloque en el catálogo, los tests nuevos comprueban cada ajuste por su clave, y el conflicto al incorporar main se resuelve conservando lo de los dos.

## Cierre

### Resumen

- Core: `schema/warnings.ts` define `usage.freshSessionTokens` (150000, un entero positivo), `usage.ccusage.timeoutSec` (60, entre 1 y 600), `usage.ccusage.version` (`20.0.45`, `x.y.z` con etiqueta opcional) y `warnings.vagueTerms` y `warnings.horizontalLayers` (listas de textos no vacíos, vacías por defecto), con `WARNINGS_SHAPE`, `DEFAULT_WARNINGS` y `resolveWarnings`; `config.ts` los reúne con spread y `ResolvedConfig` extiende `WarningsConfig`.
- Validación: `quality.ts` busca los términos vagos y las capas de la persona además de los de Specty, como palabras enteras y sin acentos, mayúsculas ni signos, y el aviso o el error los nombra como los escribió la persona.
- Catálogo: las secciones «Avisos» (detrás de «Verificaciones de calidad») y «Consumo y sesiones» (detrás de «Memoria»), con los cinco ajustes marcados «Nuevo» y sus textos en español y en inglés en `cards/settings-warnings.ts`.
- CLI: el aviso de sesión nueva compara con `usage.freshSessionTokens`, cada informe de ccusage (cierre y sesiones de la UI) espera `usage.ccusage.timeoutSec` y el aviso de `doctor` da la versión de `usage.ccusage.version`; `init` sigue ofreciendo la de por defecto, ahora leída de `DEFAULT_CONFIG`.
- Documentación: formats.md §6, ui.md y ARCHITECTURE §13 y §14.

### Desviaciones

- El test aprobado de C8 «AC6: opens «Interno» by itself while a search or a filter shows its settings» esperaba que el filtro «Nuevos» mostrara solo las cinco claves de `internal`. Con los cinco ajustes nuevos de este corte ya no coincidía, así que se pidió su desbloqueo (S1, con parche y evidencia) y la persona lo aprobó: ahora compara solo las claves `internal.*`, en el mismo orden, y sigue comprobando que «Interno» se abre solo.
- Un término de la persona hecho solo de signos no encuentra nada, para que no avise en todos los criterios; lo dice formats.md §6.
- El comentario de `ResolvedConfig` en `config.ts`, que estaba sobre `LineLimits`, pasó a su sitio.

### Decisiones

- Si el título de un corte nombra a la vez una capa de Specty y una de la persona, el error da la de Specty, como hasta ahora; si solo nombra de la persona, la primera de su lista.
- Las reglas de riesgo propias se quedaron fuera para que el corte no saliera XL (A1): tocan el catálogo de riesgos, las tarjetas de aceptación y de lecciones, dos módulos de la CLI y uno de la UI.

### Pendientes

- Las reglas de riesgo propias (`warnings.risks`), que se suman a las de Specty en la aceptación, quedan para un corte nuevo de la épica 20261107-flujo-configurable-en-la-ui; el módulo `schema/warnings.ts` y la sección «Avisos» ya están para recibirlas.
- `packages/core/src/cards/settings.ts` tiene 389 líneas de código: llevar los textos de «Interno» a un módulo propio, como `cards/settings-warnings.ts` (P273).
- AC8 se comprueba a mano: formats.md §6, ARCHITECTURE §13 y §14 y ui.md.
