---
kind: standard
follows:
  - 20261026-las-tarjetas-de-core-primera-parte-audit-doctor
---

# Un comando que vence su tiempo se corta entero, y los tests no dependen del idioma del sistema

## Objetivo

El CI de GitHub destapó dos fallos que en local no se veían. En Linux, un comando de verificación que vence su tiempo no se corta: Specty mata la shell, pero el proceso que lanzó sigue vivo con la salida abierta, y Specty espera a que termine. En macOS, dos tests dependen del idioma del sistema, porque `LC_ALL` del runner gana al `LANG` que fijan. Specty pasa a cortar el comando con todos sus procesos, y los tests fijan su idioma aunque el sistema defina otro.

## Fuera de alcance

- Cambiar cómo llega Ctrl+C a los comandos: el grupo de procesos no cambia.
- El trabajo de Windows del CI, que no bloquea.

## Supuestos

- A1: Al vencer el tiempo, basta con cortar el árbol de procesos del comando tal como está en ese momento: en Linux y macOS, leído con `ps -A -o pid=,ppid=`; en Windows, con `taskkill /T /F`.
  - impacto: alto
- A2: En macOS el fallo de Linux se reproduce con un comando compuesto (`a && b`), porque la shell no puede sustituirse por el comando.
  - impacto: alto
- A3: Los tests eligen su idioma con `LANG`, así que su entorno quita `LC_ALL` y `LC_MESSAGES` del sistema.

## Criterios de aceptación

- AC1: CUANDO un comando con un proceso hijo vence su tiempo ENTONCES Specty lo corta con su hijo y responde en poco más del tiempo límite, con `timedOut`.
- AC2: CUANDO los tests corren con `LC_ALL=en_US.UTF-8` ENTONCES pasan igual que sin él.
- AC3: CUANDO alguien lee `verify.timeoutSec` en formats.md ENTONCES sabe que al vencer se corta el comando con todos sus procesos.

## Archivos

- modificar packages/cli/src/io/exec.ts — cortar el árbol del comando al vencer el tiempo
- modificar packages/cli/test/exec.test.ts — su caso
- modificar packages/cli/test/support.ts — el entorno de los tests sin `LC_ALL` ni `LC_MESSAGES`
- modificar docs/formats.md — qué se corta al vencer el tiempo

## Tareas

- [x] T1: El comando entero, al vencer el tiempo
  - files: packages/cli/src/io/exec.ts, packages/cli/test/exec.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/exec.test.ts test/check-commands.test.ts
  - type: fix
- [x] T2: El idioma de los tests
  - files: packages/cli/test/support.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-language.test.ts test/commands.test.ts
  - type: test
- [x] T3: El tiempo límite en formats.md
  - files: docs/formats.md
  - ac: AC3
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

Un comando de verificación que vence su tiempo se corta con todos los procesos que lanzó, leídos con `ps` en ese momento (`taskkill /T` en Windows): antes, en Linux o con un comando compuesto, Specty mataba solo la shell y esperaba a que el proceso hijo terminara. Los tests ya no heredan `LC_ALL` ni `LC_MESSAGES` del sistema, que en el runner de macOS ganaban al `LANG` con que eligen su idioma. formats.md lo cuenta en `verify.timeoutSec`.

### Desviaciones

Ninguna.

### Decisiones

- Se corta el árbol solo al vencer el tiempo, sin cambiar el grupo de procesos del comando, para que Ctrl+C le siga llegando como hasta ahora.
- El fallo de Linux se reprodujo en macOS con `node slow.js && echo done`, que impide a la shell sustituirse por el comando.

### Pendientes

- Confirmar en el CI de GitHub que Linux y macOS pasan; Windows sigue sin bloquear.
