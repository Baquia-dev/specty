---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C19
---

# Las reglas de riesgo propias se suman a las de Specty

## Objetivo

Hoy `specty task done` avisa de los riesgos del contenido solo con el catálogo fijo de Specty (`core/src/scope/risk.ts`): TLS desactivado, `eval`, secretos y los demás. Con este cambio, la persona añade sus propias reglas en `.specty/config.yaml` (`warnings.risks`), cada una con su patrón, el texto del aviso y, si quiere, su CWE y las extensiones que mira. Se suman a las de Specty, que siguen y no se quitan, y `task done`, la aceptación, la UI y las lecciones de la memoria las muestran con el texto de la persona. Es el corte C19 de la épica: lo que C7 dejó fuera de su AC21, con AC25 y AC26.

## Fuera de alcance

- Quitar, apagar o cambiar las reglas de Specty o sus textos: las de la persona solo se suman.
- Reglas sobre rutas o sobre el modo de los archivos, como las de rutas de pagos y de archivos ejecutables: las de la persona miran el contenido que añade una tarea, línea a línea.
- Opciones de la expresión regular, como no mirar mayúsculas: el patrón es una expresión regular de JavaScript sin opciones.
- Editar las reglas desde la UI: son objetos, y la página los muestra sin control, como `verify.units`.
- El texto de una regla en dos idiomas: el aviso lo dice tal como lo escribió la persona.
- Cambiar la página «Configuración»: pinta lo que dice el catálogo, y sus tests calculan desde él las listas de ajustes y de nuevos.
- Volver a analizar las tareas ya hechas cuando cambian las reglas.

## Supuestos

- A1: Las reglas son una lista en `warnings.risks`, vacía por defecto, en el módulo `schema/warnings.ts` de C7. Cada regla tiene `label`, el texto del aviso, y `pattern`, una expresión regular válida, los dos no vacíos. Puede tener `cwe`, con la forma `CWE-<número>`, y `extensions`, una lista de extensiones sin punto. Otra clave en una regla es un error de `config.yaml`. La validez del patrón la comprueba `isRegex` de `schema/checks.ts`, que pasa a exportarse.
  - impacto: medio
- A2: Una regla de la persona da un hallazgo con la regla `custom`, su texto (`label`) y su CWE, en la misma lista que los de Specty y ordenado igual, por archivo y línea. Como las de Specty, no mira los tests, y con `extensions` solo mira los archivos con esas extensiones, sin mirar mayúsculas. `task.completed` guarda el texto en cada hallazgo, así que la aceptación, la UI y la memoria lo muestran sin leer la configuración, y cambiar las reglas no cambia los avisos ya guardados.
  - impacto: alto
- A3: `riskLabel` recibe el texto de la persona como tercer argumento opcional y lo da en lugar del de la regla. Sin él, la regla `custom` tiene un texto genérico en los dos idiomas. Lo usan la tarjeta de aceptación, la nota de `accept`, las lecciones de la memoria y la vista de aceptación de la UI, y las lecciones de dos reglas de la persona en el mismo archivo no se juntan en una.
  - impacto: medio
- A4: El ajuste va en la sección «Avisos», detrás de las capas horizontales. Es una lista con la marca «Nuevo» y la de que solo se cambia en el archivo (`fileOnly`), y sus textos van en `cards/settings-warnings.ts`.
  - impacto: bajo
- A5: El corte sale L sin estrecharlo: 14 archivos de código y de tests, en core, CLI y UI. La documentación no cuenta para el tamaño.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `warnings.risks` tiene una regla y una tarea añade, en un archivo que no es test, una línea que cumple su patrón ENTONCES `task done` avisa con la ruta, la línea, el texto de la regla y su CWE, y `task.completed` guarda el hallazgo con ese texto. Las reglas de Specty siguen avisando en el mismo diff.
- AC2: CUANDO la regla tiene `extensions` ENTONCES solo avisa en los archivos con esas extensiones, sin mirar mayúsculas, y sin `extensions` avisa en todos. En los tests no avisa nunca.
- AC3: CUANDO el cambio llega a la aceptación con un aviso de una regla de la persona ENTONCES la tarjeta de aceptación y la nota de `specty accept` lo muestran con su texto. Al aceptar, la memoria anota una lección «Riesgo aceptado en …» del archivo con el texto de la regla y su CWE, una por archivo y regla.
- AC4: CUANDO la vista de aceptación de la UI lee de la auditoría un aviso de una regla de la persona ENTONCES lo muestra con su texto, igual en español y en inglés. Sin texto, dice en cada idioma que coincide con una regla de riesgo del proyecto.
- AC5: CUANDO un valor de `warnings.risks` no es válido ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`. No son válidos un texto o un patrón vacíos, un patrón que no es una expresión regular, un CWE sin la forma `CWE-<número>`, una extensión vacía o con punto, ni otra clave en la regla. Sin la clave, la configuración resuelta tiene una lista vacía y los avisos son los de hoy.
- AC6: CUANDO la persona abre «Configuración» ENTONCES ve `warnings.risks` en «Avisos», detrás de las capas horizontales, con la marca «Nuevo» y sin control, porque se cambia en el archivo. Tiene su nombre y su descripción en español y en inglés.
- AC7: CUANDO se lee `docs/formats.md` ENTONCES §6 documenta `warnings.risks`, con sus campos y sus límites, y dice que las reglas se suman a las de Specty, y el hallazgo de `task.completed` lleva `label`. `docs/ARCHITECTURE.md` y `docs/ui.md` dicen lo mismo donde hablan de los riesgos del contenido y de la sección «Avisos».
  - test: manual

## Diseño

- Core, `schema/warnings.ts`: `CustomRiskRule` (`label`, `pattern`, `cwe?`, `extensions?`), y `warnings.risks` en `WarningsConfig`, `DEFAULT_WARNINGS` (`[]`), `WARNINGS_SHAPE` y `resolveWarnings`. `schema/checks.ts` exporta `isRegex`.
- Core, `scope/risk.ts`: `RiskRule` suma `custom`, con su texto genérico en `LABELS`, y `RiskFinding` suma `label?`. `contentRisks(diff, custom = [])` compila cada patrón una vez y, en cada línea añadida de un archivo que no es test, da los hallazgos de Specty y después los de la persona (`{ path, line, rule: "custom", label, cwe? }`). `riskLabel(rule, lang, label?)` da `label` si lo hay.
- Core, `cards/acceptance.ts` (`riskWarnings`) y `cards/risk-lessons.ts` (`riskLessons`): pasan `risk.label` a `riskLabel`, y la clave que evita lecciones repetidas suma el texto.
- Core, `settings/catalog.ts`: `{ key: "warnings.risks", section: "warnings", kind: "list", fileOnly: true, new: true }`, detrás de `warnings.horizontalLayers`. `cards/settings-warnings.ts`: su nombre y su descripción.
- CLI, `flow/risk.ts`: `riskFindings` pasa `session.config.warnings.risks` a `contentRisks`. `flow/task-views.ts`: al leer `risks` de `task.completed`, conserva `label` si es un texto.
- UI, `data/warnings.ts`: pasa el `label` de la auditoría a `riskLabel` en los dos idiomas.
- Tests: `core/test/scope/risk.test.ts` (AC1, AC2, AC4) y `core/test/settings/catalog.test.ts` (AC5, AC6), que cambia también sus listas exactas de ajustes nuevos y de ajustes que solo se cambian en el archivo, y la comprobación de C7 que daba `warnings.risks` por clave desconocida. Además, `cli/test/risk.test.ts` (AC1, AC3) y `ui/src/data/warnings.test.ts` (AC4). Cada tarea tiene un solo ejecutor de tests en su verify (P190).

## Archivos

- modificar packages/core/src/schema/warnings.ts — la clave `warnings.risks`, con sus límites y una lista vacía por defecto
- modificar packages/core/src/schema/checks.ts — exporta `isRegex` para validar los patrones
- modificar packages/core/src/scope/risk.ts — las reglas de la persona, sumadas a las de Specty, y su texto
- modificar packages/core/src/cards/acceptance.ts — el aviso de la aceptación con el texto de la persona
- modificar packages/core/src/cards/risk-lessons.ts — la lección de la memoria con el texto de la persona, una por regla
- modificar packages/core/src/settings/catalog.ts — el ajuste `warnings.risks` en «Avisos», nuevo y solo en el archivo
- modificar packages/core/src/cards/settings-warnings.ts — su nombre y su descripción en español y en inglés
- modificar packages/core/test/scope/risk.test.ts — los hallazgos de las reglas de la persona y su texto
- modificar packages/core/test/settings/catalog.test.ts — los límites del schema, el valor por defecto, el ajuste, sus marcas y sus textos
- modificar packages/cli/src/flow/risk.ts — pasa las reglas de la configuración al análisis
- modificar packages/cli/src/flow/task-views.ts — conserva el texto de cada aviso al leer la auditoría
- modificar packages/cli/test/risk.test.ts — las reglas de la persona en `task done`, la aceptación y la memoria
- modificar packages/ui/src/data/warnings.ts — el aviso de una regla de la persona, con su texto
- modificar packages/ui/src/data/warnings.test.ts — ese aviso en los dos idiomas
- modificar docs/formats.md — §6: `warnings.risks`; `task.completed`: el `label` de cada hallazgo
- modificar docs/ARCHITECTURE.md — los riesgos del contenido suman las reglas de la persona
- modificar docs/ui.md — los avisos de la aceptación y la sección «Avisos» de «Configuración»

## Tareas

- [x] T1: Las reglas de riesgo de la persona en el schema, en el análisis del core, en sus textos y en el catálogo
  - files: packages/core/src/schema/warnings.ts, packages/core/src/schema/checks.ts, packages/core/src/scope/risk.ts, packages/core/src/cards/acceptance.ts, packages/core/src/cards/risk-lessons.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-warnings.ts, packages/core/test/scope/risk.test.ts, packages/core/test/settings/catalog.test.ts, docs/formats.md
  - ac: AC1, AC2, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/scope/risk.test.ts test/settings/catalog.test.ts
- [x] T2: `task done`, la aceptación y la memoria usan las reglas de la persona
  - files: packages/cli/src/flow/risk.ts, packages/cli/src/flow/task-views.ts, packages/cli/test/risk.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC3, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/risk.test.ts
- [ ] T3: La vista de aceptación de la UI muestra el texto de la persona
  - files: packages/ui/src/data/warnings.ts, packages/ui/src/data/warnings.test.ts, docs/ui.md
  - ac: AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/warnings.test.ts && pnpm typecheck

## Riesgos

- R1: Un patrón de la persona muy amplio llena de avisos cada tarea, y uno con mucho retroceso tarda en cada línea. Mitigación: son avisos y no bloquean, el aviso nombra la regla por su texto, quitarla de la lista lo apaga y las de Specty no cambian. Además, el patrón solo se prueba en las líneas que añade la tarea.
- R2: C13, C14, C15 y C18 tocan a la vez `catalog.ts` y `catalog.test.ts`, y su lista de ajustes nuevos. Mitigación: el conflicto al incorporar main se resuelve conservando lo de los dos.
