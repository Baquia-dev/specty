---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C21
---

# Las tareas de un quick y la revisión independiente pasan a ser ajustes

## Objetivo

Hoy un cambio `quick` admite una sola tarea y la revisión independiente se recomienda desde el tamaño L, las dos cosas fijas en el código. Con este corte, la persona las elige con dos claves nuevas de `.specty/config.yaml`, `lanes.quick.maxTasks` y `flow.reviewFrom`, que `propose`, su tarjeta y la aceptación aplican. La página «Configuración» las muestra con la marca «Nuevo», y sin ellas todo sigue como hoy.

## Fuera de alcance

- Las verificaciones que ejecuta `task done` además de la de alcance, de AC19 de la épica, que van en C22.
- Las otras razones para recomendar la revisión, que no cambian: las rutas sensibles, el esfuerzo de revisión `max` que sube el modelo y las tareas que quitan aserciones o añaden riesgos.
- Las tareas que un ajuste añade a un `quick` ya aprobado, que siguen sin límite, como hoy.
- La guía para redactar la spec de un `quick`, que sigue diciendo «una sola tarea», y las frases del modo básico de la vista Flujo, que no nombran estas claves.
- La pieza «Revisión independiente» de la vista Flujo, que sigue con `review.command` y `review.timeoutSec`: `flow.reviewFrom` se ajusta en la vista General.
- Guardar ajustes desde la UI (C2 y C10) y la pieza «Fase de cierre» (C20).

## Supuestos

- A1: `lanes` pasa de `schema/config.ts` a `schema/flow.ts`, el módulo de las reglas del flujo que creó C5, con su forma, su valor por defecto y su resolución, y `config.ts` lo reúne con el spread de `flow` que ya tiene. Así `config.ts` no crece (P351), y las rutas de las claves y lo que devuelve `resolveConfig` no cambian.
  - impacto: medio
- A2: `lanes.quick.maxTasks` es un entero positivo que vale 1 sin la clave: cuántas tareas admite la primera propuesta de un `quick`. Va junto a `lanes.quick.maxFiles`, en la sección «Tamaño y cortes», y no lleva la marca de afectar permisos, como `maxFiles`, porque el carril rápido no deja hacer nada sin la persona.
  - impacto: medio
- A3: `flow.reviewFrom` es `S`, `M`, `L` o `XL` y vale `L` sin la clave: el tamaño desde el que `propose` recomienda revisar la spec y la aceptación revisar el resultado. Va en `flow` y no dentro de `review`, porque `review` exige `command` y quitar la pieza de la revisión dejaría inválido un `review` sin él. Solo cuenta con `review.command`: sin `review`, Specty sigue sin recomendar ni ejecutar revisiones. La página lo muestra en la sección «Revisión independiente».
  - impacto: alto
- A4: El aviso `quick-limits` dice el máximo configurado: con 1, el texto de hoy («2 tareas; quick admite una»); con más, el número («3 tareas; quick admite 2»).
  - impacto: bajo
- A5: Los textos nuevos van con los de su sección: `flow.reviewFrom` en `cards/settings.ts`, que crece solo en esa entrada, y `lanes.quick.maxTasks` en `cards/settings-size.ts`. Las opciones de `flow.reviewFrom` se muestran tal cual, S, M, L y XL.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` no tiene `lanes.quick.maxTasks` ENTONCES un `quick` con dos tareas en su primera propuesta da el error `quick-limits` con «2 tareas; quick admite una», como hoy.
- AC2: CUANDO `lanes.quick.maxTasks` es 2 ENTONCES un `quick` con dos tareas no da `quick-limits`, y uno con tres lo da con «3 tareas; quick admite 2», en inglés «3 tasks; quick allows 2».
- AC3: CUANDO `lanes.quick.maxTasks` no es un entero positivo, o `flow.reviewFrom` no es S, M, L ni XL ENTONCES el validador del core da un error con su clave. Sin las claves, los valores efectivos son 1 y `L`, y `lanes.quick.maxFiles` sigue valiendo 3.
- AC4: CUANDO hay `review.command` sin `flow.reviewFrom` ENTONCES `propose` recomienda revisar la spec solo si es L o XL, toca rutas sensibles o su esfuerzo de revisión es `max`, y la aceptación recomienda revisar el resultado solo si el cambio es L o XL o alguna tarea tiene avisos, como hoy.
- AC5: CUANDO `flow.reviewFrom` es `S` ENTONCES el `SIGUIENTE` de `propose` de una spec S sin rutas sensibles pide `specty review` antes de la aprobación. Además, el `SIGUIENTE` de ese cambio en aceptación, tras su última tarea sin avisos, pide `specty review` antes de la aceptación.
- AC6: CUANDO la persona abre «Configuración» ENTONCES ve `lanes.quick.maxTasks` en «Tamaño y cortes», tras `lanes.quick.maxFiles`, como número, y `flow.reviewFrom` en «Revisión independiente», tras `review.timeoutSec`, como elección entre S, M, L y XL. Los dos llevan la marca «Nuevo» y ninguna otra, con su nombre y su descripción en español y en inglés.
- AC7: CUANDO se lee la documentación ENTONCES `docs/formats.md` §6 documenta las dos claves con sus valores por defecto, y `docs/ARCHITECTURE.md` dice que la revisión se recomienda desde `flow.reviewFrom`.
  - test: manual

## Diseño

- Core, `schema/flow.ts`: `FlowConfig` gana `flow.reviewFrom` (`SizeLevel`) y `lanes.quick` (`maxFiles` y `maxTasks`). `DEFAULT_FLOW` vale `{ flow: { closing: true, reviewFrom: "L" }, lanes: { quick: { maxFiles: 3, maxTasks: 1 } } }`. `FLOW_SHAPE` suma `reviewFrom: z.enum(["S", "M", "L", "XL"]).optional()` a `flow` y el bloque `lanes`, con `maxTasks` entero positivo, y `resolveFlow` los resuelve. `config.ts` quita `lanes` de `ResolvedConfig`, de `DEFAULT_CONFIG`, de `ConfigSchema` y de `limitsOf`.
- Core, `validate/limits.ts`: el problema `tasks` de `QuickProblem` lleva `max`, y `formatQuickProblem` dice «una» con 1 y el número con más. `validate/structure.ts`: `checkQuickLane` compara con `ctx.config.lanes.quick.maxTasks`.
- Core, `settings/catalog.ts`: `{ key: "flow.reviewFrom", section: "review", kind: "choice", options: ["S", "M", "L", "XL"], new: true }` tras `review.timeoutSec`, con la lista literal porque `sizing/size.ts` no es ligero, y `{ key: "lanes.quick.maxTasks", section: "size", kind: "number", new: true }` tras `lanes.quick.maxFiles`.
- CLI, `commands/propose.ts` (`reviewRecommended`) y `flow/acceptance.ts` (`resultReview`): «grande» pasa de L o XL a un nivel que alcanza `session.config.flow.reviewFrom` en `SIZE_LEVELS`.
- Tests: `core/test/settings/quick-and-review.test.ts` (AC3, AC6), la lista exacta de la marca «Nuevo» y el valor por defecto de `flow` en `core/test/settings/catalog.test.ts`, `core/test/validate/structure.test.ts` (AC1, AC2), `core/test/spec/messages.test.ts` (AC2) y `cli/test/review.test.ts` (AC4, AC5).

## Archivos

- modificar packages/core/src/schema/flow.ts — las claves `flow.reviewFrom` y `lanes.quick.maxTasks`, y el bloque `lanes` que viene de `config.ts`
- modificar packages/core/src/schema/config.ts — deja `lanes` a `schema/flow.ts`
- modificar packages/core/src/settings/catalog.ts — los ajustes `flow.reviewFrom` y `lanes.quick.maxTasks`, con la marca `new`
- modificar packages/core/src/cards/settings.ts — el nombre y la descripción de `flow.reviewFrom` en español y en inglés
- modificar packages/core/src/cards/settings-size.ts — el nombre y la descripción de `lanes.quick.maxTasks` en español y en inglés
- modificar packages/core/src/validate/limits.ts — el máximo de tareas en el aviso del carril rápido
- modificar packages/core/src/validate/structure.ts — el carril rápido admite `lanes.quick.maxTasks` tareas
- modificar packages/cli/src/commands/propose.ts — la revisión de la spec se recomienda desde `flow.reviewFrom`
- modificar packages/cli/src/flow/acceptance.ts — la revisión del resultado se recomienda desde `flow.reviewFrom`
- crear packages/core/test/settings/quick-and-review.test.ts — el schema de las dos claves, sus ajustes, sus marcas y sus textos
- modificar packages/core/test/settings/catalog.test.ts — la lista exacta de la marca «Nuevo» y el valor por defecto de `flow`
- modificar packages/core/test/validate/structure.test.ts — el carril rápido con `lanes.quick.maxTasks`
- modificar packages/core/test/spec/messages.test.ts — el aviso del carril rápido con su máximo, en los dos idiomas
- modificar packages/cli/test/review.test.ts — la revisión recomendada para una spec S con `flow.reviewFrom: S`, antes de aprobar y de aceptar
- modificar docs/formats.md — §6: `lanes.quick.maxTasks` y `flow.reviewFrom`
- modificar docs/ARCHITECTURE.md — `specty review`: la aceptación pide la revisión desde `flow.reviewFrom`

## Tareas

- [x] T1: Las claves `lanes.quick.maxTasks` y `flow.reviewFrom` en el schema y en el catálogo, con sus textos
  - files: packages/core/src/schema/flow.ts, packages/core/src/schema/config.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings.ts, packages/core/src/cards/settings-size.ts, packages/core/test/settings/quick-and-review.test.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC3, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/quick-and-review.test.ts test/settings/catalog.test.ts
- [ ] T2: El carril rápido admite las tareas de `lanes.quick.maxTasks` y su aviso dice el máximo
  - files: packages/core/src/validate/limits.ts, packages/core/src/validate/structure.ts, packages/core/test/validate/structure.test.ts, packages/core/test/spec/messages.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/structure.test.ts test/spec/messages.test.ts
- [ ] T3: `propose` y la aceptación recomiendan la revisión desde `flow.reviewFrom`, y la documentación lo dice
  - files: packages/cli/src/commands/propose.ts, packages/cli/src/flow/acceptance.ts, packages/cli/test/review.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4, AC5, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/review.test.ts && pnpm typecheck

## Riesgos

- R1: Bajar `flow.reviewFrom` a S o M recomienda revisiones en casi todos los cambios, y cada una cuesta tokens. Mitigación: lo decide la persona en su `config.yaml`, el valor por defecto es el de hoy y la revisión sigue recomendándose una sola vez por spec y por resultado.
- R2: Subir `lanes.quick.maxTasks` deja pasar por el carril rápido cambios con más trabajo, que se cierran al aceptarlos y sin retro. Mitigación: los archivos de código y las rutas sensibles siguen limitados, y la persona sigue aprobando la spec y aceptando el resultado.
- R3: C22 también toca `schema/flow.ts`, el catálogo, sus textos, sus tests y `docs/formats.md` §6. Mitigación: cada clave va en su línea, y al incorporar main se conservan las dos partes.
