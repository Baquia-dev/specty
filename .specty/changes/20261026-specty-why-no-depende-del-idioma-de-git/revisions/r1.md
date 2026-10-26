---
kind: standard
follows:
  - 20261026-un-comando-que-vence-su-tiempo-se-corta-entero-y
---

# specty why no depende del idioma de git

## Objetivo

`specty why <ruta>:<línea>` distingue una línea que no existe de un archivo sin historia buscando en la salida de error de `git blame` el mensaje inglés «has only N lines». Con un git traducido, como el de Homebrew con el sistema en español, no lo encuentra y dice que el archivo no tiene historia. Lo destapó el CI de macOS. `why` pasa a decidirlo por la historia del archivo, sin leer mensajes de git.

## Fuera de alcance

- Forzar el idioma de git en el resto de comandos: ninguno más interpreta sus mensajes.

## Supuestos

- A1: Si `git blame` de una línea falla y el archivo tiene algún commit, la línea no existe; si no tiene ninguno, el archivo no tiene historia.
  - impacto: alto
- A2: Un git falso al principio del PATH, que traduce el error de `blame` y delega lo demás en el git real, reproduce el fallo sin depender de los catálogos de idioma de la máquina; no corre en Windows.

## Criterios de aceptación

- AC1: CUANDO git da sus errores en otro idioma y se pide una línea que no existe de un archivo con historia ENTONCES `why` dice que el archivo no tiene esa línea.
- AC2: CUANDO el archivo no tiene historia ENTONCES `why` lo dice, con la línea o sin ella.

## Archivos

- modificar packages/cli/src/commands/why.ts — la línea que falta, por la historia del archivo
- modificar packages/cli/test/why.test.ts — su caso con un git en español

## Tareas

- [ ] T1: La línea que falta, sin leer mensajes de git
  - files: packages/cli/src/commands/why.ts, packages/cli/test/why.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/why.test.ts
  - type: fix
