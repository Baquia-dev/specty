---
kind: standard
---

# Los comandos de Specty salen del sandbox de Antigravity

## Objetivo

En el sandbox de terminal de Antigravity CLI (`agy` 1.5.1, `--sandbox`), nada puede escribir en `.git` y un `specty` global de nvm no arranca, así que el agente no puede ejecutar `specty enter`, `next` ni `task done` (P157). Los `permissionOverrides` que da el guard no cambian ese sandbox, y las reglas de `permissions.allow` de `~/.gemini/antigravity-cli/settings.json` sí (P167). Con este cambio, por la excepción D4 a ADR 0013, `specty init --tools antigravity` añade `command(specty)` a esa lista cuando la persona usa el CLI. `doctor` comprueba que la regla esté, y `uninstall` dice que se queda allí. Para la app, cuyos permisos no están en ningún archivo legible, `init` avisa de la regla que añadir. La documentación recoge además lo comprobado con Antigravity real para P158 y P152 (P168).

## Fuera de alcance

- Pedirle al modelo de Antigravity `BypassSandbox: true`, o cambiar cualquier tarjeta o texto que ve el modelo. En la app, con el sandbox apagado, el modelo no tenía ese parámetro y tomó la instrucción como un intento de eludir el sandbox (comprobado el 2026-11-05). Queda como límite en ARCHITECTURE.
- Los `permissionOverrides` del guard (`write_file(<carpeta común de git>)`) se quedan como están: en la app no se pudo ver si cuentan, porque su sandbox estaba apagado, y según la documentación el CLI los ignora.
- Reglas de rutas (`read_file(...)`, `write_file(...)`) en los permisos de Antigravity, y escribir en los ajustes de la app.
- Quitar la regla en `uninstall`.
- Código para P152: el turno sin `specty check --changed` de `agy -p` se documenta como límite.
- `docs/formats.md`: no cambia ningún formato de Specty.

## Supuestos

- A1: La carpeta del CLI de Antigravity es `~/.gemini/antigravity-cli/`, y sus permisos van en `permissions.allow` de su `settings.json`: una lista de cadenas como `command(specty)` que vale en todos los proyectos de la persona (P167, `agy` 1.5.1).
  - impacto: alto
- A2: Con `command(specty)` en esa lista, los comandos de Specty (también tras un `cd x &&`) corren sin preguntar. Con el sandbox apagado corren como cualquier comando. Con el sandbox encendido, solo salen de él si el propio modelo pone `BypassSandbox: true`, que `agy` sugiere en algunos errores del sandbox, y Specty no se lo pide (ver Fuera de alcance). Un compuesto como `specty … && git add -A` se sigue denegando, como en Codex.
- A3: Las cuentas business o enterprise usan `unsandboxed(specty)` en lugar de `command(specty)` (documentación de Antigravity). Si la lista ya tiene cualquiera de las dos, `init` no añade nada y `doctor` la da por buena.
- A4: La app de Antigravity no guarda sus permisos en un archivo legible: `~/.gemini/antigravity/user_settings.pb` está vacío y no hay nada en Application Support (P168). Por eso, para la app, Specty solo avisa.
- A5: Por D4, Specty solo escribe esa regla. `init` no escribe reglas de rutas, porque llevan rutas de la máquina de cada repositorio y un `write_file(.git)` relativo rompe el sandbox entero (P167). Tampoco crea la carpeta del CLI si la persona no lo usa. El resto de ADR 0013 sigue igual.
- A6: La regla nombra el `COMMAND` de `packages/cli/src/session.ts` (`specty`), como la de Codex en `agents/codex.ts`, aunque el guard del proyecto lleve una ruta de la máquina: el agente ejecuta los comandos de Specty como `specty …`.
- A7: Aislamiento de las pruebas. La carpeta del CLI es `$SPECTY_ANTIGRAVITY_CLI_DIR` cuando la variable tiene valor y, si no, `<HOME>/.gemini/antigravity-cli`, con `env.HOME ?? homedir()` como `codexHooksFile`. `testEnv()` de `packages/cli/test/support.ts` la apunta a una carpeta temporal por proceso que nunca se crea, como ya hace con `CODEX_HOME` y `XDG_CONFIG_HOME`. Así ningún test que pase por `cli()` o `testEnv()` lee ni escribe el `settings.json` real de la persona, tampoco los que ya ejecutan `init --tools antigravity` (`antigravity.test.ts`, `doctor-enter.test.ts`, `antigravity-e2e.test.ts`…). Los nuevos crean su propia carpeta temporal y la pasan con `env`. Se descarta un `HOME` temporal en `testEnv`, porque lo heredan herramientas que los tests lanzan y que lo necesitan real: Go, Cargo y rustup en `check-examples-native.test.ts`, y `agy` con su sesión en el E2E. Se descarta también `ANTIGRAVITY_GEMINI_DIR`: aparece en el binario de `agy` 1.5.1, pero su efecto no se puede comprobar sin ejecutarlo. `agy` no conoce la variable de Specty, así que el E2E sigue usando la configuración real de la persona. La variable solo cambia dónde escribe Specty esa regla y no concede ningún permiso del flujo.
  - impacto: alto
- A8: `uninstall` deja la regla, porque la comparten todos los proyectos de la persona y otro que use Specty la seguiría necesitando. Entre lo que queda, dice dónde está y cómo quitarla, como con el guard de una instalación anterior (`globalGuardStaysLine`).
- A9: `settings.json` se lee como JSON con comentarios (jsonc-parser), y `init` inserta la entrada en la lista sin rehacer el resto del archivo, así que conserva las demás claves, entradas y formato. Un texto que no se analiza no se toca, ni un `permissions` que no es un objeto o un `allow` que no es una lista. La escritura pasa por `install/files.ts`, así que `init --dry-run` la muestra sin escribir, y `init` guarda antes una copia del archivo, como con los del proyecto.
- A10: P158 queda resuelto con lo comprobado en la app (P168), sin código: cada subagente de `invoke_subagent` llega con su propio `conversationId` y `lastUserInput` vacío. Tras un `Stop` respondido con `continue`, el siguiente `Stop` trae el texto de la persona. El modelo lanzó dos `invoke_subagent` en un mismo mensaje. P152 también se resuelve sin código: en la app llegan después otra llamada al modelo y un `Stop` con `fullyIdle: true`, así que el turno sin check solo pasa con `agy -p`.

## Criterios de aceptación

- AC1: CUANDO `specty init --tools antigravity` corre y existe la carpeta del CLI de Antigravity ENTONCES añade `command(specty)` a `permissions.allow` de su `settings.json` y crea el archivo, `permissions` o la lista si faltan. Conserva las demás claves y entradas y da una línea de lo hecho que nombra el archivo.
- AC2: CUANDO `permissions.allow` ya tiene `command(specty)` o `unsandboxed(specty)` ENTONCES `init` deja el archivo igual, sin duplicar la regla, y da la misma línea de lo hecho.
- AC3: CUANDO la carpeta del CLI de Antigravity no existe ENTONCES `init` no la crea, no escribe nada en ella y no da esa línea.
- AC4: CUANDO `settings.json` no es JSON válido, su `permissions` no es un objeto o su `allow` no es una lista ENTONCES `init` no lo toca y avisa con la ruta del archivo y la regla que añadir a `permissions.allow`.
- AC5: CUANDO `specty init --tools antigravity` termina ENTONCES avisa, en español y en inglés, de que la app de Antigravity no guarda sus permisos en un archivo que Specty pueda editar, y de que la persona añada `command(specty)` a sus reglas de permisos (`unsandboxed(specty)` con una cuenta de empresa).
- AC6: CUANDO el proyecto tiene el guard de Antigravity y existe la carpeta de su CLI ENTONCES `specty doctor` da una línea buena si `permissions.allow` tiene `command(specty)` o `unsandboxed(specty)`. Si no la tiene, o si el archivo falta o no se analiza, da un problema que pide `specty init --tools antigravity` y sale con 1, en español y en inglés. Sin esa carpeta, no dice nada de ella.
- AC7: CUANDO `specty uninstall` corre y el `settings.json` del CLI tiene `command(specty)` ENTONCES no lo toca. Entre lo que queda, dice que la regla sigue en ese archivo, que sirve a todos los proyectos de la persona y que la quite de `permissions.allow` si ya no usa Specty, en español y en inglés.
- AC8: CUANDO `SPECTY_ANTIGRAVITY_CLI_DIR` nombra una carpeta ENTONCES `init` usa esa como carpeta del CLI de Antigravity. Vacía o sin definir, usa `<HOME>/.gemini/antigravity-cli`. `testEnv()` la apunta a una carpeta temporal que no existe y que no está dentro de la carpeta del usuario.

## Diseño

- `packages/cli/src/install/antigravity-cli.ts` (nuevo, como `install/opencode.ts`) es lo que Specty hace en los ajustes del CLI de Antigravity:
  - la ruta de su `settings.json` a partir de `env` (A7);
  - añadir la regla a través de `InstallFiles`, con un resultado `added`, `present`, `invalid` o `absent` (sin carpeta);
  - leer si la regla está, para `doctor` y `uninstall`.
- `agents/adapter.ts`: `InstallContext` gana `env`, y `doctor` recibe `env` como tercer argumento. `install/hooks.ts` y `commands/doctor.ts` se los pasan desde `environment.env`.
- `agents/antigravity.ts`:
  - `install` da la línea de la regla (`added` o `present`) o el aviso de archivo inválido, y siempre el aviso de la app, junto al de confianza.
  - `doctor` suma `antigravity-cli-rule` o `no-antigravity-cli-rule` solo cuando existe la carpeta.
  - El archivo de usuario no entra en `written`, lo que va al commit de `init`.
- `commands/uninstall.ts`: `remaining` añade la línea de la regla que se queda cuando el archivo la tiene.
- Core (textos en español y en inglés):
  - en `cards/install.ts`, la línea de la regla, el aviso del archivo inválido y el de la app;
  - en `cards/doctor.ts` y `cards/doctor-agents.ts`, las líneas `antigravity-cli-rule` y `no-antigravity-cli-rule`, con `file`;
  - en `cards/uninstall.ts`, la línea de la regla que se queda;
  - en `cards/index.ts`, sus exportaciones.
- Documentación:
  - ADR 0013 gana una sección de excepción con D4: la fecha, la cita y su alcance.
  - En `docs/ARCHITECTURE.md`:
    - el punto de Antigravity de «Permisos de la herramienta» recoge P167, la regla de `init`, la variable y el límite de `BypassSandbox`;
    - el párrafo «Subagentes» (Antigravity) dice que lo del editor ya está comprobado (P168);
    - la fila de Antigravity de la tabla de fin de turno recoge el límite de `agy -p` (P152);
    - la fila de Antigravity de la tabla de herramientas dice lo que `init` escribe en la carpeta del CLI.

## Archivos

- crear packages/cli/src/install/antigravity-cli.ts — ruta, lectura y escritura de la regla en los ajustes del CLI de Antigravity
- modificar packages/cli/src/agents/antigravity.ts — `install` añade la regla y avisa de la app; `doctor` la comprueba
- modificar packages/cli/src/agents/adapter.ts — `env` en `InstallContext` y en `doctor`
- modificar packages/cli/src/install/hooks.ts — pasa `env` a cada `install`
- modificar packages/cli/src/commands/doctor.ts — pasa `env` a cada `doctor`
- modificar packages/cli/src/commands/uninstall.ts — dice que la regla se queda
- modificar packages/core/src/cards/install.ts — línea de la regla, aviso de archivo inválido y aviso de la app
- modificar packages/core/src/cards/doctor.ts — las líneas `antigravity-cli-rule` y `no-antigravity-cli-rule`
- modificar packages/core/src/cards/doctor-agents.ts — su texto en español y en inglés
- modificar packages/core/src/cards/uninstall.ts — la línea de la regla que se queda
- modificar packages/core/src/cards/index.ts — exporta los textos nuevos
- modificar packages/cli/test/support.ts — `testEnv()` apunta `SPECTY_ANTIGRAVITY_CLI_DIR` a una carpeta temporal que no existe
- crear packages/cli/test/antigravity-cli-rule.test.ts — `init`, `doctor` y `uninstall` con la carpeta del CLI en una carpeta temporal
- crear packages/core/test/cards/antigravity-cli-rule.test.ts — los textos nuevos en español y en inglés
- modificar docs/decisions/0013-specty-no-escribe-en-la-carpeta-del-usuario.md — la excepción D4
- modificar docs/ARCHITECTURE.md — permisos, subagentes y fin de turno de Antigravity

## Tareas

- [ ] T1: Los textos de la regla del CLI y del aviso de la app de Antigravity, en español y en inglés
  - files: packages/core/test/cards/antigravity-cli-rule.test.ts, packages/core/src/cards/install.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/src/cards/uninstall.ts, packages/core/src/cards/index.ts
  - ac: AC1, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/antigravity-cli-rule.test.ts && pnpm lint
  - type: feat
- [ ] T2: `init --tools antigravity` añade `command(specty)` a los permisos del CLI y avisa de la app
  - files: packages/cli/test/support.ts, packages/cli/test/antigravity-cli-rule.test.ts, packages/cli/src/install/antigravity-cli.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/install/hooks.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-cli-rule.test.ts -t "AC1|AC2|AC3|AC4|AC5|AC8" && pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/codex.test.ts test/opencode-install.test.ts && pnpm lint
  - type: feat
- [ ] T3: `doctor` comprueba la regla y `uninstall` dice que se queda
  - files: packages/cli/test/antigravity-cli-rule.test.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/commands/uninstall.ts, packages/cli/src/install/antigravity-cli.ts
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-cli-rule.test.ts test/antigravity.test.ts test/doctor-enter.test.ts test/uninstall.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T4: La documentación
  - files: docs/decisions/0013-specty-no-escribe-en-la-carpeta-del-usuario.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Otra versión de `agy` mueve sus ajustes o cambia la forma de la regla. Mitigación: `doctor` solo mira ese archivo y la regla es una entrada más que la persona puede quitar; si se puede, la persona lo comprueba con `agy` real antes de aceptar.
- R2: Un test que construya su entorno sin `testEnv()` tocaría la carpeta real. Mitigación: los que ejecutan `init` pasan por `cli()` o llaman a `installHooks` con `testEnv()` (`codex.test.ts`, `opencode-install.test.ts`), y la variable de `testEnv()` cubre a todos. AC8 lo comprueba.
- R3: Escribir en la carpeta del usuario falla por permisos. Mitigación: la escritura va por `install/files.ts`, como la de cualquier archivo de `init`, que da el error; la persona puede añadir la regla a mano, como dice el aviso de archivo inválido.
