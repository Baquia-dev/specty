---
kind: standard
follows:
  - 20261103-memoria-entradas-c2
---

# La tarjeta de inicio muestra los pendientes y recordatorios de la memoria

## Objetivo

Las entradas de la memoria de Specty ya se anotan y se listan, pero nadie las ve si no ejecuta `specty memory`. Con este cambio llegan solas a cada sesión. La tarjeta de inicio y la de `specty next` sin cambio activo dicen cuántos pendientes hay, muestran los tres primeros libres y los recordatorios, y explican cómo tomar uno. Además, el bloque de AGENTS.md pide anotar lo pendiente en la memoria. Así se completa el AC4 de la épica.

## Fuera de alcance

- Tomar una entrada con `specty new --resolves`, cerrarla con su cambio y descartarla: van en el corte C3. Hasta entonces, la tarjeta explica cómo tomar una citando su id en la petición de `specty new`.
- Las decisiones en la tarjeta de inicio: son constancia, y su lugar es la tarjeta del borrador, por ruta, después de la épica.
- La tarjeta al empezar una sesión en agentes distintos de Claude Code: el `SessionStart` de Codex con `startup` está sin comprobar, y queda anotado en la memoria.
- «TE TOCA» en `specty status`, con los recordatorios, y el traslado de la tarjeta de `status` a su propio archivo: van en el cambio que sigue a este, porque juntos llevaban este a tamaño XL.
- Actualizar el AGENTS.md de este repositorio: su bloque de flujo ya es de una versión anterior, y lo rehace `specty init`.

## Supuestos

- A1: La tarjeta cuenta los pendientes y las mejoras abiertas, es decir, ni hechas ni descartadas. Libres son las que están en estado `open`: nadie las tomó ni se propusieron para descartar. Los recordatorios van aparte, y las decisiones no salen.
  - impacto: alto
- A2: Claude Code manda `SessionStart` con `source: startup` al empezar una sesión nueva. El matcher no gana `resume`, porque una conversación reanudada ya trae sus tarjetas.
- A3: Sin pendientes, mejoras ni recordatorios abiertos, la tarjeta de `next` sin cambio sigue exactamente igual que hoy.
- A4: Las secciones de la memoria van detrás del texto de la tarjeta sin cambio, sea cual sea la tarjeta: la de reposo, la de cambios sin spec o la del esqueleto. Su SIGUIENTE no cambia.
- A5: El aviso de anotar lo pendiente se suma a la regla del reporte final, sin añadir otra línea, para que el bloque de flujo siga en 15 líneas como mucho.
- A6: `doctor` reconoce una instalación anterior porque el `SessionStart` de Specty no se dispara al empezar: su matcher, leído como lo lee Claude Code (una expresión regular sobre `source`), no admite `startup`. Vacío, `*` o sin matcher se dispara siempre.

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty next` sin cambio activo y la memoria tiene pendientes o mejoras abiertas ENTONCES la tarjeta dice cuántas hay y muestra las tres primeras libres por fecha, con su id, su tipo y su texto. Explica también cómo tomar una y cómo verlas todas.
- AC2: CUANDO la memoria tiene recordatorios abiertos ENTONCES la tarjeta de `specty next` sin cambio los muestra todos y dice cómo marcarlos hechos.
- AC3: CUANDO la memoria no tiene pendientes, mejoras ni recordatorios abiertos ENTONCES la tarjeta de `specty next` sin cambio es la de antes de este cambio.
- AC4: CUANDO Claude Code empieza una sesión nueva (`SessionStart` con `source: startup`) ENTONCES `init` instala el hook que lleva ese evento al guard, y el guard responde con la salida de `specty next`, con las entradas de la memoria. Además, `doctor` avisa de un hook de Specty que no se dispara al empezar y pide ejecutar `specty init`.
- AC5: CUANDO `init` escribe el bloque de flujo de AGENTS.md ENTONCES la regla del reporte final pide anotar cada pendiente con `specty memory add`, para que no se quede solo en el chat.

## Diseño

- Core:
  - `cards/memory.ts` construye las secciones de la memoria para la tarjeta sin cambio. Reutiliza el orden por fecha y el formato de `specty memory`, sin el origen.
  - `NextView` gana `memory`, con las entradas leídas.
- La tarjeta sin cambio, cuando hay algo abierto, añade estas secciones:
  - «MEMORIA DE SPECTY»: la cuenta de pendientes y mejoras abiertas, hasta tres libres (`P1 · pendiente · <texto>`) y una línea final. Esa línea pide no empezarlas sin que el usuario lo pida, explica cómo tomar una (`specty new` citando su id en la petición) y remite a `specty memory` para verlas todas.
  - «RECORDATORIOS»: cada recordatorio abierto, y cómo marcarlo hecho con `specty memory done <id>`.
- CLI: `next` lee la memoria solo cuando no hay cambio activo, con `readMemory`, que lee la rama con tres procesos de git haya las entradas que haya.
- Claude Code:
  - El matcher de `SessionStart` pasa a `startup|clear|compact`. El guard ya trata cualquier `SessionStart` como la tarjeta.
  - `runsAtSessionStart(matcher)`, exportada para su test, dice si un `SessionStart` con ese matcher se dispara al empezar. `doctor` da el código nuevo `claude-startup` cuando el hook de Specty está y no se dispara.

## Archivos

- modificar packages/core/src/cards/memory.ts — las secciones de la memoria para la tarjeta sin cambio
- modificar packages/core/src/cards/next.ts — `NextView.memory` y las secciones en la tarjeta sin cambio
- modificar packages/core/src/cards/doctor.ts — el código `claude-startup`
- modificar packages/core/src/cards/doctor-agents.ts — el texto del código `claude-startup`
- modificar packages/core/src/agents-md.ts — la regla del reporte final pide anotar lo pendiente
- modificar packages/cli/src/commands/next.ts — lee la memoria cuando no hay cambio activo
- modificar packages/cli/src/agents/claude-code.ts — `startup` en el matcher de `SessionStart`, `runsAtSessionStart` y el aviso de `doctor`
- crear packages/cli/src/agents/claude-code.test.ts — qué matchers se disparan al empezar, y `doctor` ante cada uno
- crear packages/core/test/cards/memory-start.test.ts — las secciones de la memoria en la tarjeta sin cambio
- modificar packages/core/test/cards.test.ts — las líneas fijadas del bloque de flujo
- crear packages/cli/test/memory-start.test.ts — `next` sin cambio con la memoria real
- modificar packages/cli/test/setup.test.ts — el matcher nuevo, la tarjeta al empezar una sesión y el aviso de `doctor`
- modificar docs/ARCHITECTURE.md — la tarjeta también al empezar una sesión de Claude Code
- modificar docs/formats.md — la regla del reporte final del bloque de flujo

## Tareas

- [x] T1: Las secciones de la memoria en la tarjeta sin cambio
  - files: packages/core/src/cards/memory.ts, packages/core/src/cards/next.ts, packages/core/test/cards/memory-start.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/memory-start.test.ts && pnpm lint
- [x] T2: `next` sin cambio lee la memoria
  - files: packages/cli/src/commands/next.ts, packages/cli/test/memory-start.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-start.test.ts && pnpm lint
- [ ] T3: La tarjeta al empezar una sesión de Claude Code, y el aviso de doctor
  - files: packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/claude-code.test.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/cli/test/setup.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/setup.test.ts src/agents/claude-code.test.ts && pnpm typecheck && pnpm lint
- [ ] T4: La regla del reporte final pide anotar lo pendiente, y la documentación
  - files: packages/core/src/agents-md.ts, packages/core/test/cards.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts test/agents-md.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: La tarjeta de inicio se alarga en cada sesión, y en Gemini CLI y Antigravity en cada turno, porque la reciben al empezar cada uno — solo salen tres pendientes, sin su origen, y nada si la memoria no tiene entradas abiertas.
- R2: Leer la rama frena `next`, que también ejecuta el guard — son tres procesos de git, y solo sin cambio activo.
- R3: Un agente empieza un pendiente por su cuenta al verlo en la tarjeta — la tarjeta pide no empezarlos sin que el usuario lo pida.
- R4: Un matcher que no es una expresión regular válida rompería la lectura de `doctor` — `runsAtSessionStart` lo compara entonces como texto.
