---
kind: standard
epic: 20261104-epicas-y-features-con-subagentes
slice: C7
---

# Cada subagente de OpenCode trabaja en la carpeta de su cambio

## Objetivo

Para repartir los cortes de una épica entre subagentes, el guard tiene que atar cada subagente a la carpeta de su corte sin mover a la sesión que lo lanzó. En OpenCode, cada subagente es una sesión hija con su propio id, y el plugin de Specty ya se lo envía al guard. Este corte lo comprueba con OpenCode real y con los eventos que envía OpenCode 1.19.5, y la tabla de capacidades pasa a decir que OpenCode reparte los cortes entre subagentes (AC18 de la épica).

## Fuera de alcance

- La tarjeta de la épica que reparte los cortes (C2), y los subagentes de Codex y Cursor (C6 y C8).
- Probar OpenCode 2 (beta) de extremo a extremo con su herramienta `subagent`: solo el test del plugin le envía eventos de una sesión hija.
- El fin de turno de un subagente. Con `check --install`, el plugin también revisa el final de cada sesión hija (`session.idle`): con `specty check --changed` en rojo, le devuelve el turno aunque `task` ya respondió a la sesión principal, y Specty no hace eso con los subagentes de Claude Code. Va como pendiente en la memoria.
- Cambiar el guard o el plugin: el comportamiento ya existe, y este corte lo fija con tests.

## Supuestos

- A1: En OpenCode 1.19.5, la última versión estable (consultada el 2026-11-04), `task` crea para cada subagente una sesión hija con su propio `sessionID`, con la sesión que lo lanzó en su `parentID`. OpenCode llama a `tool.execute.before` con el `sessionID` de la sesión que ejecuta la herramienta, así que en las herramientas del subagente llega el de la sesión hija. Se vio en el código de 1.19.5 y en una prueba previa con OpenCode real; AC3 lo comprueba.
  - impacto: alto
- A2: El subagente arranca en la carpeta en la que trabaja OpenCode (el `directory` del plugin), sin el enlace de la sesión que lo lanzó: cada sesión tiene el suyo. Por eso entra con `specty enter <id>` en la carpeta de su cambio.
- A3: En OpenCode 2 (beta), el subagente de su herramienta `subagent` también es una sesión hija, y `execute.before` trae su `sessionID`. No se comprueba con la beta, que no cambia desde agosto de 2026.
- A4: En OpenCode, `specty new` no ata a ninguna conversación, con `--subagent` o sin él: sus comandos no dicen qué sesión los ejecuta (solo Claude Code da `CLAUDE_CODE_SESSION_ID`).

## Criterios de aceptación

- AC1: CUANDO un subagente de OpenCode ejecuta `specty enter <id>` de un cambio con carpeta, en su sesión hija, ENTONCES el guard ata esa sesión hija a la carpeta del cambio, y la sesión que lo lanzó sigue atada a la suya.
- AC2: CUANDO un subagente atado a la carpeta de un cambio escribe, busca o ejecuta un comando ENTONCES el plugin de Specty lleva esa acción a la carpeta del cambio, juzgada con las reglas de ese cambio, en OpenCode 1 y 2. Las acciones de la sesión principal van a la carpeta de esta, y las de un subagente que aún no entró en ninguna, a la del proyecto.
- AC3: CUANDO OpenCode real lanza un subagente con `task` contra el modelo guionizado ENTONCES el subagente entra en la carpeta de un cambio y escribe y ejecuta allí, con su sesión hija atada a ella, mientras la sesión principal sigue en la carpeta del cambio en el que había entrado.
- AC4: CUANDO se muestra la tabla de capacidades (ARCHITECTURE §10) ENTONCES OpenCode dice «sí» en «Cortes en subagentes».

## Diseño

- Ni el guard ni el plugin cambian. El plugin envía como `session_id` el `sessionID` de cada evento, así que cada sesión hija es una conversación propia: su enlace en `sessions/`, sus pasos para `status` y la regla «una conversación, un cambio abierto». `specty enter` ata esa conversación, y `redirect` de `agents/opencode.ts` lleva allí sus herramientas, como con cualquier sesión que entró.
- `AGENT_CAPABILITIES.opencode.subagentSlices` pasa a `yes`, con un comentario que dice por qué y con qué versión se comprobó.
- `fakeChat` acepta, como `fakeModel` en C1, un guion por subagente. Lo elige por una marca en su encargo (su primer mensaje de usuario), le responde por su cuenta y da sus resultados con `subagentResults(marca)`. `results()` sigue dando los de la conversación principal.
- Pruebas:
  - `opencode.test.ts` carga el plugin real y llama a sus hooks como OpenCode 1.19.5 (`tool.execute.before` con `{tool, sessionID, callID}` y `{args}`) y OpenCode 2 (`execute.before` con `{tool, sessionID, id, input}`), con una sesión principal y una hija.
  - `opencode-e2e.test.ts` lanza OpenCode real: la sesión principal entra en un cambio y lanza un subagente con `task`, que entra en otro.
- La verificación ejecuta primero los tests del CLI con `--reporter=verbose`. Prueban un comportamiento que ya existe y pasan desde el principio; solo la tabla de core falla hasta este cambio. Con ese reporter, la salida roja nombra también los tests que pasan.
- Documentos: ARCHITECTURE §10 (los subagentes de OpenCode y la tabla regenerada con `capabilityTable("es")`) y el glosario (`docs/dominio.md`).

## Archivos

- modificar packages/core/src/capabilities.ts — OpenCode reparte los cortes entre subagentes
- modificar packages/core/test/capabilities.test.ts — la fila de OpenCode con «sí» en «Cortes en subagentes»
- modificar packages/cli/test/opencode.test.ts — el plugin ata cada sesión hija y lleva allí sus herramientas
- modificar packages/cli/test/opencode-e2e.test.ts — OpenCode real lanza un subagente con `task`
- modificar packages/cli/test/fake-chat.ts — un guion por subagente
- modificar docs/ARCHITECTURE.md — §10: los subagentes de OpenCode y la tabla
- modificar docs/dominio.md — el subagente de OpenCode en el glosario

## Tareas

- [ ] T1: Cada subagente de OpenCode trabaja en la carpeta de su cambio, y la tabla lo dice
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, packages/cli/test/opencode.test.ts, packages/cli/test/opencode-e2e.test.ts, packages/cli/test/fake-chat.ts, docs/ARCHITECTURE.md, docs/dominio.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run --reporter=verbose test/opencode.test.ts test/opencode-e2e.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts && pnpm lint && pnpm typecheck && pnpm knip

## Riesgos

- R1: OpenCode 2 sale de beta con otra forma para sus subagentes. Mitigación: el test del plugin fija lo que espera de OpenCode 2 (la sesión hija en `execute.before`), y la memoria ya pide volver a comprobar OpenCode 2 cuando salga de beta.
- R2: C6 y C8 tocan las mismas líneas de la tabla, de su test y de §10. Mitigación: al incorporar main, el conflicto se resuelve regenerando la tabla con `capabilityTable("es")`.
- R3: Sin OpenCode instalado, el E2E se salta, como los demás, así que en la CI solo corre el test del plugin. Mitigación: ese test usa la forma de los eventos de OpenCode 1.19.5, y el E2E se ejecuta aquí con 1.19.5 (`SPECTY_E2E_OPENCODE`).
