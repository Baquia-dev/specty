---
kind: standard
epic: 20261027-tests-como-contrato-y-vocabulario-del-dominio
slice: C5
---

# El vocabulario del dominio llega con las tarjetas que lo usan

## Objetivo

El agente inventa nombres para lo que el proyecto ya nombra. Con este corte, el proyecto tiene un glosario, un archivo con una línea por término, y cada tarjeta trae justo a tiempo la definición de los términos que aparecen en su texto: la del borrador, la de la fase de tests y la de la tarea. La del cierre pide añadir los términos que el cambio introdujo o renombró. Así AGENTS.md no crece.

Es el corte C5 de la épica «Tests como contrato y vocabulario del dominio».

## Fuera de alcance

- AC15 de la épica (`init` crea el glosario con pistas y `doctor` avisa mientras solo las tenga): va en un cambio de seguimiento, porque con él este corte pasaría de 15 archivos.
- Términos en las tarjetas de revisión, ajuste y aceptación.
- Sinónimos o variantes de un término más allá del plural con `s` o `es`.

## Supuestos

- A1: El glosario tiene una línea por término: `- **Término** (\`NombreEnElCódigo\`): definición.`, con el nombre en el código opcional. Las demás líneas y los comentarios HTML no cuentan.
  - impacto: alto
- A2: Un término aparece en un texto sin importar mayúsculas, como palabra entera y también en plural con `s` o `es`. Su nombre en el código aparece tal cual, como palabra entera. Las tildes cuentan como se escriben.
- A3: La ruta del glosario es la clave `glossary` de `.specty/config.yaml`. Sin ella, es `docs/dominio.md` en español y `docs/domain.md` en inglés. Si el archivo no existe, no hay glosario.
- A4: Una tarjeta trae como mucho 3 términos, en el orden del glosario, cada uno en una línea de 100 caracteres como máximo (la definición se recorta con «…»). Es lo que cabe en el margen de la tarjeta más grande del test de presupuesto: 1.411 de 1.500 tokens.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO el glosario define un término que aparece en el título o en los criterios de la tarea activa ENTONCES la tarjeta de la tarea trae su definición en «TÉRMINOS DEL DOMINIO», y no la de los términos que no aparecen.
- AC2: CUANDO un término aparece en el título o en la petición de un borrador, o en los criterios de la fase de tests ENTONCES esas tarjetas traen su definición.
- AC3: CUANDO un término aparece en plural, con otras mayúsculas o por su nombre en el código ENTONCES cuenta, y cuando solo es parte de otra palabra no cuenta.
- AC4: CUANDO aparecen más de 3 términos o una definición es larga ENTONCES la tarjeta trae los 3 primeros del glosario, en líneas de 100 caracteres como mucho, y la tarjeta más grande del test de presupuesto sigue por debajo de 1.500 tokens con ellos.
- AC5: CUANDO no hay glosario, o no define ningún término ENTONCES las tarjetas no cambian.
- AC6: CUANDO el cambio llega al cierre ENTONCES su tarjeta pide añadir al glosario, por su ruta, los términos que el cambio introdujo o renombró.
- AC7: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES describen la clave `glossary`, el formato del glosario y qué tarjetas traen sus términos.
  - test: manual

## Diseño

- `core/src/glossary.ts`: `parseGlossary(text)` da las entradas (`term`, `code?`, `definition`), y `termsIn(entries, texts)` da las que aparecen en algún texto, en el orden del glosario. Es puro, como el resto del core.
- `ResolvedConfig.glossary`: la ruta, con el valor por defecto según el idioma.
- `ChangeView.glossary?: { path, entries }`, que `flow/views.ts` llena si el archivo existe.
- `core/src/cards/glossary.ts`: la sección «TÉRMINOS DEL DOMINIO» / «DOMAIN TERMS» (los 3 primeros, en líneas de 100 caracteres) y la línea del cierre, en los dos idiomas. La usan `draftCard` (`next.ts`), `testingCard` (`testing.ts`), `taskCard` y `closingCard` (`work.ts`).
- El test de presupuesto añade a la tarjeta más grande 3 términos largos.

## Archivos

- crear packages/core/src/glossary.ts — leer el glosario y encontrar sus términos
- modificar packages/core/src/schema/config.ts — la clave `glossary`
- modificar packages/core/src/index.ts — exportarlo
- modificar packages/core/src/cards/view.ts — `ChangeView.glossary`
- crear packages/core/src/cards/glossary.ts — la sección de términos y la línea del cierre
- modificar packages/core/src/cards/next.ts — los términos en el borrador
- modificar packages/core/src/cards/testing.ts — los términos en la fase de tests
- modificar packages/core/src/cards/work.ts — los términos en la tarea y la línea del cierre
- modificar packages/cli/src/flow/views.ts — leer el glosario
- crear packages/cli/test/glossary.test.ts — de punta a punta
- modificar docs/formats.md — la clave `glossary` y el formato del glosario
- modificar docs/ARCHITECTURE.md — §7: los términos en las tarjetas

## Tareas

- [x] T1: El glosario se lee y sus términos se encuentran en un texto
  - files: packages/core/src/glossary.ts, packages/core/src/schema/config.ts, packages/core/src/index.ts
  - ac: AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/glossary.test.ts test/schema
  - notes: documenta la clave y el formato en docs/formats.md.
- [x] T2: Las tarjetas traen las definiciones de sus términos
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/glossary.ts, packages/core/src/cards/next.ts, packages/core/src/cards/testing.ts, packages/core/src/cards/work.ts
  - ac: AC1, AC2, AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
  - notes: documenta en ARCHITECTURE §7 qué tarjetas traen los términos y el límite.
- [ ] T3: Los comandos leen el glosario del proyecto
  - files: packages/cli/src/flow/views.ts, packages/cli/test/glossary.test.ts
  - ac: AC1, AC5, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/glossary.test.ts test/flow.test.ts

## Riesgos

- R1: Un término corto o común («pedido», «test») aparece en casi todo y ocupa los 3 huecos. Mitigación: la persona controla el glosario, y el orden del glosario decide cuáles van primero.
- R2: Los términos hacen crecer las tarjetas. Mitigación: como mucho 3, en líneas de 100 caracteres, y el test de presupuesto los incluye.
