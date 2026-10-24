---
kind: standard
---

# El primer cambio de un proyecto nuevo es el esqueleto

## Objetivo

Segunda parte del flujo de proyecto nuevo de ARCHITECTURE §14: tras `init` y `PRODUCT.md`, «el primer cambio es `bootstrap`, de carril `standard`, así que el scaffolding también queda trazado». Hoy `specty next` en un proyecto vacío da la tarjeta de siempre (con la sugerencia de `--kind quick`), y la spec del primer cambio no ayuda a escribir un andamiaje. Ahora, en un proyecto nuevo:

- `next` dice que el primer cambio es el esqueleto, a partir de `PRODUCT.md`, y propone el comando sin `--kind quick`;
- `new` se niega a un cambio quick;
- la spec trae pistas propias para el esqueleto: el stack y los comandos como supuestos, globs para lo que genere una herramienta, y `verify` en cada tarea porque aún no hay `verify.default`;
- `change.created` anota `bootstrap: true`.

## Fuera de alcance

- Generar el andamiaje: lo escribe el agente en las tareas del cambio.
- Recomendar un stack concreto: es un supuesto de la spec, que la persona confirma al aprobar.
- Proyectos que ya tienen código: todo sigue igual.

## Supuestos

- A1: «Proyecto nuevo» es lo mismo que en `init` (`isNewProject`): la detección no encuentra ningún stack y no hay código gobernado salvo metadatos y archivos de los agentes. Se mira cada vez que `next` no tiene un cambio activo y cada vez que se ejecuta `new`, así que deja de serlo en cuanto el esqueleto llega a la rama.
  - impacto: alto
- A2: `new --kind quick` en un proyecto nuevo se rechaza con un SIGUIENTE sin `--kind`, como pide §14; `spike` sigue permitido, porque explorar antes de decidir el stack tiene sentido.
  - impacto: alto
- A3: Las pistas del esqueleto sustituyen solo las del Objetivo, los Supuestos, los Archivos y las Tareas; las demás secciones llevan las de siempre, y como todas son comentarios, `propose` las quita.

## Criterios de aceptación

- AC1: CUANDO no hay un cambio activo y el proyecto es nuevo ENTONCES `next` dice que el primer cambio es el esqueleto del proyecto, a partir de `PRODUCT.md`, y su SIGUIENTE propone `specty new "Esqueleto del proyecto" --request "…"` sin `--kind quick`.
- AC2: CUANDO se ejecuta `specty new --kind quick` en un proyecto nuevo ENTONCES se rechaza, explica que el esqueleto va en un cambio standard y propone el comando sin `--kind`.
- AC3: CUANDO se crea un cambio en un proyecto nuevo ENTONCES su spec trae las pistas del esqueleto y `change.created` lleva `bootstrap: true`.
- AC4: CUANDO el proyecto ya tiene código ENTONCES `next`, `new` y la plantilla siguen como hoy.

## Diseño

- Core: `NextView.fresh` y su tarjeta sin cambio activo (`cards/next.ts`); `TemplateOptions.bootstrap` y sus pistas (`templates.ts`).
- CLI: `freshProject(session)` en `install/product.ts` junta la detección y los archivos de git para `isNewProject`; `next.ts` lo pasa a `nextCard` cuando no hay cambio activo; `new.ts` rechaza `quick`, pasa `bootstrap` a la plantilla y lo anota en `change.created`.

## Archivos

- modificar packages/core/src/cards/next.ts — la tarjeta de un proyecto nuevo
- modificar packages/core/src/templates.ts — las pistas del esqueleto
- crear packages/core/test/cards/bootstrap.test.ts — tarjeta y plantilla
- modificar packages/cli/src/install/product.ts — `freshProject`
- modificar packages/cli/src/commands/next.ts — `fresh` sin cambio activo
- modificar packages/cli/src/commands/new.ts — sin quick, con las pistas y `bootstrap` en la auditoría
- crear packages/cli/test/bootstrap.test.ts — el primer cambio de un proyecto nuevo, de punta a punta
- modificar docs/ARCHITECTURE.md — el primer cambio (§14)
- modificar docs/formats.md — `bootstrap` en `change.created` (§4)

## Tareas

- [ ] T1: Core: la tarjeta y la plantilla del esqueleto
  - files: packages/core/src/cards/next.ts, packages/core/src/templates.ts, packages/core/test/cards/bootstrap.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: feat
- [ ] T2: La CLI lleva el primer cambio al esqueleto
  - files: packages/cli/src/install/product.ts, packages/cli/src/commands/next.ts, packages/cli/src/commands/new.ts, packages/cli/test/bootstrap.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check
  - type: feat

## Riesgos

- R1: Un repositorio con código en un lenguaje que la detección no reconoce tiene código gobernado, así que no cuenta como nuevo — A1 mira los archivos gobernados además del stack.
- R2: Rechazar `quick` frena a quien solo quiere un archivo de prueba — solo en un proyecto sin código, una vez, y el SIGUIENTE da el comando correcto.
