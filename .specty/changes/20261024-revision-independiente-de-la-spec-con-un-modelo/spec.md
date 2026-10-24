---
kind: standard
---

# Revisión independiente de la spec con un modelo más fuerte

## Objetivo

Antes de aprobar una spec grande o sensible, Specty puede pedir una segunda opinión a un modelo más fuerte que elige la persona. `specty review` pasa la spec a un comando de revisión configurado (por ejemplo, Claude Code headless con Opus y sin herramientas), guarda su respuesta en el cambio y se la enseña al agente, que corrige lo que sea un error real o se lo cuenta al usuario. `propose` la recomienda en su SIGUIENTE una vez por cambio cuando el tamaño es L o XL o la spec toca rutas sensibles. Specty no puede saber qué modelo ni qué esfuerzo usó el agente, así que no puede exigir uno más fuerte; sí puede ofrecer esta revisión. Cambia ADR 0001 («Specty nunca llama a modelos»), con un ADR nuevo.

## Fuera de alcance

- Revisar el resultado (el diff del cambio) antes de aceptar: irá en el cambio siguiente, con el mismo comando.
- Que el modelo recomiende el esfuerzo de implementación y de revisión: irá en otro cambio.
- Ejecutar la revisión desde la UI o al proponer, sin que el agente la pida.
- Gestionar claves o proveedores: se usa la CLI que la persona ya tiene.

## Supuestos

- A1: La revisión es opcional y la activa solo la persona: sin `review.command` en `.specty/config.yaml`, Specty no la recomienda ni la ejecuta, y el agente no puede añadir la clave porque ese archivo está protegido.
  - impacto: alto
- A2: La lanza el agente con `specty review` cuando el SIGUIENTE lo pide; consume la cuenta de la persona, que por eso decide si la configura. La revisión es información: no aprueba, no rechaza y no bloquea.
  - impacto: alto
- A3: El comando recibe un texto por la entrada estándar (las instrucciones y la spec) y responde por la salida estándar; Specty lo ejecuta con la shell en la carpeta del cambio, con `review.timeoutSec` o, sin él, el de `verify`.
- A4: La respuesta se guarda en `.specty/changes/<id>/reviews/spec-r<revisión>.md`, que el guard protege como las revisiones de la spec, y `review.completed` la anota en la auditoría.
- A5: La recomendación sale una sola vez por cambio, para no encadenar revisiones: después de la primera, `propose` vuelve a pedir la aprobación directamente.

## Criterios de aceptación

- AC1: CUANDO `review.command` está configurado y `propose` acepta una spec L o XL, o con rutas sensibles, sin revisión previa en el cambio ENTONCES su SIGUIENTE pide `specty review` antes de la aprobación; sin la clave, o tras una revisión, el SIGUIENTE es el de siempre.
- AC2: CUANDO el agente ejecuta `specty review` con la spec en revisión ENTONCES el comando recibe por la entrada estándar las instrucciones y la spec, su respuesta queda en `reviews/spec-r<n>.md` y en la salida, `review.completed` queda en la auditoría, y el SIGUIENTE pide corregir lo que sea real o pedir la aprobación (aprobar él mismo en modo delegado).
- AC3: CUANDO no hay `review.command`, la spec no está en revisión o el comando falla ENTONCES `specty review` lo explica sin cambiar la fase, y su SIGUIENTE sigue el flujo.
- AC4: CUANDO el agente intenta escribir en `reviews/` ENTONCES el guard lo bloquea.
- AC5: CUANDO alguien lee los ADR, ARCHITECTURE y formats.md ENTONCES encuentra la decisión (ADR 0011, que modifica la 0001), el comando, la clave `review` y el evento `review.completed`.

## Diseño

- Core: `review` (`command`, `timeoutSec`) en la configuración; `cards/review.ts` con el texto que recibe el revisor (es y en) y la tarjeta de la respuesta; `ProposedView.review` cambia el SIGUIENTE de `proposedCard`; el guard protege `.specty/changes/*/reviews/**`.
- CLI: `commands/review.ts` ejecuta el comando con `execute` (entrada estándar, shell, tiempo límite), guarda la respuesta y anota la auditoría; `propose` calcula la recomendación con la auditoría (`readAudit`); `program.ts` añade el comando.
- Ejemplo para Claude Code: `claude -p --model opus --tools "" --setting-sources "" --strict-mcp-config`.

## Archivos

- crear docs/decisions/0011-revision-independiente.md — la decisión
- modificar docs/decisions/0001-sin-llm.md — modificada por la 0011
- modificar packages/core/src/schema/config.ts — la clave `review`
- crear packages/core/src/cards/review.ts — el texto para el revisor y la tarjeta de la respuesta
- modificar packages/core/src/cards/flow.ts — `propose` recomienda la revisión
- modificar packages/core/src/index.ts — exportar lo nuevo
- modificar packages/core/src/guard/decide.ts — proteger `reviews/`
- crear packages/core/test/cards/review.test.ts — textos, tarjeta y recomendación
- crear packages/cli/src/commands/review.ts — `specty review`
- modificar packages/cli/src/program.ts — el comando
- modificar packages/cli/src/commands/propose.ts — cuándo se recomienda
- crear packages/cli/test/review.test.ts — de punta a punta con un revisor falso
- modificar docs/ARCHITECTURE.md — el comando y la revisión
- modificar docs/formats.md — la clave `review`, `reviews/` y `review.completed`

## Tareas

- [x] T1: La revisión en core
  - files: packages/core/src/schema/config.ts, packages/core/src/cards/review.ts, packages/core/src/cards/flow.ts, packages/core/src/index.ts, packages/core/src/guard/decide.ts, packages/core/test/cards/review.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards test/guard test/schema
- [ ] T2: specty review y la recomendación de propose
  - files: packages/cli/src/commands/review.ts, packages/cli/src/program.ts, packages/cli/src/commands/propose.ts, packages/cli/test/review.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/review.test.ts test/commands-named.test.ts
- [ ] T3: El ADR y la documentación
  - files: docs/decisions/0011-revision-independiente.md, docs/decisions/0001-sin-llm.md, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
