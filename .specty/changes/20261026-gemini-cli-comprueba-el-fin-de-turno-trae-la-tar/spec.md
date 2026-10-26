---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C12
---

# Gemini CLI comprueba el fin de turno, trae la tarjeta tras compactar y sigue un guion con un modelo simulado

## Objetivo

Con el guard de C11, a Gemini CLI aún le falta lo demás que tiene Claude Code:
- Fin de turno: `check --install` pone `AfterAgent`, y cuando `specty check --changed` falla el agente sigue con el informe.
- Tarjeta: `PreCompress` salta antes de cada intento de compactar, compacte o no, así que no sirve para saber cuándo compacta. La tarjeta llega al empezar cada turno, con `BeforeAgent`.
- Permisos: con su sandbox activado, sus comandos solo escriben en el proyecto. `init` le añade la carpeta común de git y la de las worktrees.
- Prueba: Gemini CLI sigue un guion contra un servidor que imita la API de Gemini, como la prueba de OpenCode.

## Fuera de alcance

- Que la tarjeta vuelva solo tras una compactación de verdad: Gemini CLI no dice cuándo compacta (ver A2).
- Aprobar sin preguntar los comandos de Specty: el modo de aprobación que eligió la persona sigue mandando.
- Que Google retirara Gemini CLI para las cuentas personales: sigue para empresas y claves de API.

## Supuestos

- A1: Comprobado con Gemini CLI 0.65.0 y un modelo simulado el 2026-10-26: `AfterAgent` recibe `stop_hook_active`, y con `{"decision":"deny","reason":…}` el agente sigue con la razón como un mensaje nuevo, y en esa vuelta `stop_hook_active` es `true`. Un hook sin salida no es un error.
  - impacto: alto
- A2: Comprobado igual: Gemini CLI dispara `PreCompress` (`trigger: "auto"`) al empezar cada intento de compactar, antes de mirar el umbral, así que salta antes de cada llamada al modelo. `BeforeAgent` añade su `additionalContext` al mensaje del turno, y queda en el historial.
  - impacto: alto
- A3: Con `GOOGLE_GEMINI_BASE_URL`, `security.auth.selectedType: "gemini-api-key"` y una clave cualquiera, Gemini CLI habla con un servidor local que imita `streamGenerateContent`. `GEMINI_CLI_TRUST_WORKSPACE` confía en la carpeta para esa sesión, y `tools.allowed` deja ejecutar las herramientas sin preguntar; ninguno salta un control de Specty.
- A4: En macOS, el sandbox de Gemini CLI (seatbelt), apagado por defecto, solo deja escribir en el proyecto, en las carpetas temporales y de caché y en las de `tools.sandboxAllowedPaths`.

## Criterios de aceptación

- AC1: CUANDO el agente de Gemini CLI termina su turno y `specty check --changed` falla ENTONCES `AfterAgent` responde `{"decision":"deny","reason":…}` con el informe, y con `stop_hook_active: true` deja terminar.
- AC2: CUANDO `specty check --install` corre en un repositorio con el guard de Gemini CLI ENTONCES añade `AfterAgent` a `.gemini/settings.json` una sola vez, con su límite de tiempo en milisegundos.
- AC3: CUANDO empieza un turno de Gemini CLI (`BeforeAgent`) en un repositorio con Specty ENTONCES el guard añade la tarjeta de `specty next` como `additionalContext`; fuera de Specty no añade nada.
- AC4: CUANDO `specty init` instala el guard de Gemini CLI en un `.gemini/settings.json` que git no sigue ENTONCES añade la carpeta común de git y la de las worktrees a `tools.sandboxAllowedPaths`, sin quitar las de la persona, y `uninstall` las quita. Si el archivo va en git, no le añade rutas de la máquina y dice cuáles añadir.
- AC5: CUANDO se ejecuta `pnpm check` en una máquina con Gemini CLI ENTONCES una prueba hace que siga un guion con un modelo simulado y comprueba el guard, el aviso tras un comando, la tarjeta al empezar el turno y el fin de turno; sin Gemini CLI, la prueba se salta.
- AC6: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES Gemini CLI tiene el fin de turno, los permisos y la prueba de extremo a extremo en «sí», y la tarjeta tras compactar en «indirecto», con cómo llega.

## Diseño

- Fin de turno de Gemini CLI: comprueba mientras `stop_hook_active` no sea `true` y responde `{"decision":"deny","reason":…}`. `check --install` lo pone en `hooks.AfterAgent` junto al guard, con `jsonStop`, y el límite de `verify.timeoutSec` pasa a milisegundos.
- `BeforeAgent`, sin matcher, se suma a los eventos del guard y es el evento `turn` (C9). El guard responde con la tarjeta de `next`, y `inject` la da como `hookSpecificOutput.additionalContext`.
- Sandbox: si `.gemini/settings.json` es local y git no lo sigue, `install` añade `sharedFolders` a `tools.sandboxAllowedPaths` y `remove` las quita. Si git lo sigue, `init` avisa con las dos carpetas.
- Prueba: `test/fake-gemini.ts` imita `streamGenerateContent` con un guion de llamadas a herramientas y guarda cada petición. `test/gemini-e2e.test.ts` busca Gemini CLI en `SPECTY_E2E_GEMINI` o recorriendo las carpetas del PATH, sin ejecutar nada para encontrarlo (así knip no lo toma por una dependencia que falta), y lo ejecuta con un HOME aislado.

## Archivos

- modificar packages/cli/src/agents/gemini-cli.ts — el fin de turno, `BeforeAgent` y las carpetas del sandbox
- modificar packages/core/src/cards/install.ts — las líneas del sandbox de Gemini CLI
- modificar packages/core/src/cards/index.ts — las exporta
- modificar packages/core/src/capabilities.ts — las celdas de Gemini CLI
- crear packages/cli/test/fake-gemini.ts — el servidor que imita la API de Gemini
- crear packages/cli/test/gemini-e2e.test.ts — Gemini CLI con un modelo simulado (AC5)
- modificar packages/cli/test/gemini-cli.test.ts — el fin de turno, la tarjeta y el sandbox (AC1 a AC4)
- modificar packages/cli/test/agents.test.ts — `BeforeAgent` y su respuesta
- modificar packages/core/test/capabilities.test.ts — la fila de Gemini CLI (AC6)
- modificar docs/ARCHITECTURE.md — su fin de turno, su tarjeta y sus permisos (§10), su prueba (§16) y la tabla
- modificar docs/formats.md — `AfterAgent` en `check --install`

## Tareas

- [x] T1: Gemini CLI comprueba el fin de turno y trae la tarjeta al empezar cada turno
  - files: packages/cli/src/agents/gemini-cli.ts, packages/cli/test/gemini-cli.test.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-cli.test.ts test/agents.test.ts test/check-agent-stop.test.ts
- [x] T2: El sandbox de Gemini CLI deja a Specty sus carpetas
  - files: packages/cli/src/agents/gemini-cli.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/gemini-cli.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-cli.test.ts test/uninstall.test.ts
- [x] T3: Gemini CLI sigue un guion con un modelo simulado
  - files: packages/cli/test/fake-gemini.ts, packages/cli/test/gemini-e2e.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-e2e.test.ts
- [ ] T4: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: La tarjeta en cada turno queda en el historial y gasta contexto en una sesión larga. Mitigación: es la misma tarjeta que da `next`, y la compactación de Gemini CLI resume las antiguas.
- R2: La prueba depende de la forma de la API de Gemini que lee Gemini CLI 0.65. Mitigación: se salta sin Gemini CLI, y ARCHITECTURE §16 dice con qué versión se comprobó.
- R3: Un `.gemini/settings.json` local con rutas de la máquina en `tools.sandboxAllowedPaths` no sirve en otra máquina. Mitigación: va excluido de git, como el resto de ese archivo local, y `new` lo copia a cada worktree.
