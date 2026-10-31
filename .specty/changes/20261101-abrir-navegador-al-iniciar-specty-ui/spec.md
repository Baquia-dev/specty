---
kind: standard
---

# Abrir navegador automáticamente al iniciar specty ui

## Objetivo

Abrir automáticamente la URL del servidor local de Specty en el navegador predeterminado del usuario al ejecutar `specty ui` en una terminal interactiva.
Ofrecer la opción `--no-open` para permitir iniciar el servidor sin abrir el navegador.

## Fuera de alcance

- Abrir el navegador cuando el servidor es iniciado por un agente o en entornos no interactivos (sin TTY).
- Forzar un navegador específico distinto al configurado por omisión en el sistema operativo.

## Supuestos

- A1: En macOS el comando del sistema para abrir URLs es `open`, en Windows es `cmd.exe /c start ""` y en Linux/otros entornos Unix es `xdg-open`.
- A2: La opción `--no-open` sigue la convención estándar de Commander para flags booleanos negados con valor por defecto `true`.

## Criterios de aceptación

- AC1: CUANDO el usuario ejecuta `specty ui` desde una terminal interactiva ENTONCES el comando inicia el servidor y abre inmediatamente el enlace con el token en el navegador predeterminado del sistema.
- AC2: CUANDO se ejecuta `specty ui --no-open` ENTONCES el comando inicia el servidor sin invocar el navegador.
- AC3: CUANDO `specty ui` se ejecuta en un entorno no interactivo (como agentes o procesos en segundo plano) ENTONCES el navegador no se abre automáticamente.
- AC4: CUANDO se invoca `browserCommand(url, platform)` ENTONCES devuelve el comando y argumentos correctos para `darwin`, `win32` y `linux`.

## Diseño

1. Módulo `packages/cli/src/io/browser.ts`:
   - `browserCommand(url: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): [string, string[]]`
   - `openInBrowser(url: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): void` (con salvaguarda para no lanzar procesos reales durante la ejecución de tests `VITEST`/`test`).
2. Comando `packages/cli/src/commands/ui.ts`:
   - Interfaz `UiOptions`: `{ readonly port?: string; readonly open?: boolean }`.
   - Admite `options?: UiOptions | string`, `stop?: Promise<void>` y `openUrl?: (url: string) => void`.
   - Abre la URL si `(options.open ?? true) && session.environment.terminal.interactive`.
3. CLI `packages/cli/src/program.ts`:
   - Agrega `.option("--no-open", "do not open the browser automatically")` al comando `ui`.
4. Documentación:
   - Actualiza `docs/ARCHITECTURE.md` para reflejar la opción `--no-open` y la apertura automática.

## Archivos

- crear packages/cli/src/io/browser.ts — funciones browserCommand y openInBrowser
- crear packages/cli/test/browser.test.ts — pruebas unitarias de browserCommand y openInBrowser
- modificar packages/cli/src/commands/ui.ts — incorporar UiOptions y llamada a openUrl
- modificar packages/cli/src/program.ts — registrar opción --no-open en comando ui
- modificar packages/cli/test/server.test.ts — pruebas de apertura automática y opción --no-open
- modificar docs/ARCHITECTURE.md — documentar apertura en navegador y opción --no-open

## Tareas

- [ ] T1: Módulo de apertura de navegador y sus pruebas unitarias
  - files: packages/cli/src/io/browser.ts, packages/cli/test/browser.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty test test/browser.test.ts
- [ ] T2: Integrar apertura automática y opción --no-open en comando ui y program
  - files: packages/cli/src/commands/ui.ts, packages/cli/src/program.ts, packages/cli/test/server.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty test test/server.test.ts
