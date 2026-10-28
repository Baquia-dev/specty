---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C6
---

# `specty import` trae un cambio de OpenSpec como borrador

## Objetivo

Hoy Specty exporta a OpenSpec, pero quien ya trabaja con OpenSpec no puede traer sus cambios en curso. `specty import <carpeta>` lee un cambio de OpenSpec (`proposal.md`, `tasks.md`, `design.md` y `specs/`) y crea con él un cambio de Specty en borrador, como `new`, con la spec ya empezada. El agente la completa y la propone, y la persona la aprueba como cualquier otra. Sin carpeta, lista los cambios de OpenSpec que se pueden importar.

## Fuera de alcance

- Importar de Spec Kit o de Kiro, los cambios archivados (`openspec/changes/archive/`) o las specs vivas (`openspec/specs/`).
- Migrar una instalación del legacy (corte C7).
- Cambiar, mover o borrar la carpeta de origen.
- Rellenar Supuestos o Archivos, que OpenSpec no tiene.

## Supuestos

- A1: El formato es el de OpenSpec 1.x: `proposal.md` con un título `#` y las secciones «Why», «What Changes» e «Impact»; `tasks.md` con casillas `- [ ]` o `- [x]`, numeradas o no; `design.md`; y `specs/<capacidad>/spec.md` con secciones «ADDED», «MODIFIED» o «REMOVED Requirements», requisitos `### Requirement:` y escenarios `#### Scenario:` con líneas `- **GIVEN**`, `- **WHEN**`, `- **THEN**` y `- **AND**`.
  - impacto: alto
- A2: Cada escenario con WHEN y THEN da un criterio («DADO … CUANDO … ENTONCES …», o en inglés «GIVEN … WHEN … THEN …»). Lo que no encaja va tal cual al Diseño, para que nada se pierda: un escenario incompleto, un requisito sin escenarios, un requisito quitado, las secciones de la propuesta que no tienen sitio y `design.md`.
  - impacto: medio
- A3: Las tareas ya marcadas no se importan como tareas, porque su código ya existe: el Diseño las lista como hechas antes de importar. Las pendientes son tareas sin `files`, que añade el agente.
  - impacto: medio
- A4: El título de la spec es el `#` de `proposal.md` sin un prefijo «Change:» o «Proposal:», y sin él, el nombre de la carpeta. La petición literal del cambio es «Importado de OpenSpec: <carpeta>».
- A5: La importación es una función pura de `packages/exporters`, la inversa del exportador de OpenSpec, que da los cuerpos de las secciones en el formato de Specty. La plantilla de core los pone en lugar de las pistas, así que las secciones que faltan conservan la suya.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty import <carpeta>` sobre un cambio de OpenSpec ENTONCES crea un cambio en borrador, como `new`, titulado como su `proposal.md`, cuya spec trae el objetivo (Why y What Changes), un criterio por escenario completo de `specs/`, el diseño y una tarea por tarea pendiente, y cuya petición literal nombra la carpeta.
- AC2: CUANDO el cambio importado está en borrador ENTONCES la carpeta de origen no ha cambiado, lo que no encajaba en un criterio, en el objetivo o en las tareas está en el Diseño, y las secciones que OpenSpec no tiene conservan su pista.
- AC3: CUANDO la carpeta no existe o no tiene `proposal.md` ENTONCES `specty import` no crea nada y dice qué falta.
- AC4: CUANDO se ejecuta `specty import` sin carpeta ENTONCES lista los cambios de `openspec/changes/` que tienen `proposal.md`, sin `archive/`, y su SIGUIENTE da el comando para importar uno; si no hay ninguno, lo dice.

## Diseño

- `packages/exporters/src/import-openspec.ts`: `importOpenSpec(files, lang)` recibe el texto de cada archivo y da el título y los cuerpos de Objetivo, Fuera de alcance (la sección «Out of Scope» que escribe el exportador), Criterios, Diseño y Tareas.
- `core/src/templates.ts`: `specTemplate` acepta `prefilled`, el cuerpo de las secciones que trae, en lugar de su pista.
- `cli/src/commands/import.ts`:
  - lee la carpeta y llama al importador;
  - crea el cambio con `newChange`, que acepta las secciones y las pasa a la plantilla;
  - sin carpeta, lista las importables.
- Los textos van en `core/src/cards/import.ts`: la lista, los rechazos y la línea que encabeza la tarjeta de `new`.

## Archivos

- crear packages/exporters/src/import-openspec.ts — de los archivos de un cambio de OpenSpec a las secciones de una spec
- modificar packages/exporters/src/index.ts — exportar el importador
- crear packages/exporters/test/import-openspec.test.ts — la importación con un cambio completo y con uno mínimo
- modificar packages/core/src/templates.ts — secciones ya rellenas en la plantilla
- crear packages/core/src/cards/import.ts — la lista, los rechazos y la línea de la importación
- modificar packages/core/src/cards/index.ts — exportar los textos
- crear packages/core/test/cards/import.test.ts — los textos y la plantilla rellena
- crear packages/cli/src/commands/import.ts — el comando
- modificar packages/cli/src/commands/new.ts — las secciones importadas en la plantilla
- modificar packages/cli/src/commands/agent-commands.ts — registrar `import`
- crear packages/cli/test/import.test.ts — `specty import` en un repositorio con OpenSpec
- modificar docs/ARCHITECTURE.md — §6: el comando
- modificar docs/formats.md — §10: la importación

## Tareas

- [x] T1: El importador de OpenSpec
  - files: packages/exporters/src/import-openspec.ts, packages/exporters/src/index.ts, packages/exporters/test/import-openspec.test.ts, packages/core/src/cards/import.ts, packages/core/src/cards/index.ts
  - ac: AC1, AC2
  - verify: pnpm lint && pnpm --filter @baquia-dev/specty-exporters typecheck && pnpm --filter @baquia-dev/specty-exporters exec vitest run test/import-openspec.test.ts
- [x] T2: La plantilla rellena y los textos de la importación
  - files: packages/core/src/templates.ts, packages/core/src/cards/import.ts, packages/core/src/cards/index.ts, packages/core/test/cards/import.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm lint && pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/import.test.ts
- [x] T3: El comando `specty import`
  - files: packages/cli/src/commands/import.ts, packages/cli/src/commands/new.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/import.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm lint && pnpm --filter @baquia-dev/specty typecheck && pnpm knip && pnpm --filter @baquia-dev/specty exec vitest run test/import.test.ts test/epic.test.ts
- [ ] T4: Documentar la importación
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/import.test.ts
  - type: docs

## Riesgos

- R1: Una propuesta escrita a mano no sigue la plantilla de OpenSpec. Mitigación: lo que no se reconoce va tal cual al Diseño, y `propose` valida la spec antes de que la vea la persona.
- R2: Un cambio de OpenSpec con decenas de escenarios daría una spec que supera los umbrales de división. Mitigación: `propose` lo dice, como con cualquier spec, y el agente la divide.
