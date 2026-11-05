---
kind: epic
---

# Lo temporal se borra cuando termina su propósito

## Objetivo

El 2026-11-05 el disco llegó a 156 MiB libres: en la carpeta temporal del sistema había 256.273 carpetas `specty-XXXXXX` y miles más de otros prefijos (`specty-evals`, `specty-bin`, `specty-repo`, `specty-bundle`, `claude-config`, `fake-pnpm`…), unos 130 GB. Son los repositorios y carpetas que crean los tests de Specty, que solo 10 de 55 archivos borran, y cada pasada de la suite de la CLI deja más de mil. Specty también deja restos de lo que ya no sirve: la carpeta de un cambio cancelado sigue hasta que alguien ejecuta `specty prune`, y un proceso que muere deja escrituras a medias (`runs/<cambio>.json.<pid>.tmp`). Con esta épica, los tests de todos los paquetes crean sus temporales en una carpeta propia de cada ejecución que se borra al terminar, `cancel` quita la carpeta del cambio cuando nada se pierde, y `prune` borra los restos de los procesos que murieron.

## Fuera de alcance

- Borrar lo que ya hay en la carpeta temporal del sistema: lo decide y lo hace la persona.
- Las carpetas temporales de `specty check` (`specty-diff-`, `specty-depcruise-`, `specty-rules-`, `specty-secrets-`, `specty-vulnerabilities-`, `specty-eslint-`): ya se borran en un `finally`.
- Borrar las ramas de los cambios cancelados, que guardan su trabajo, o lo que la persona dejó sin commit.

## Supuestos

- A1: Cada ejecución de tests de un paquete crea al empezar una carpeta propia en la carpeta temporal del sistema (`specty-tests-<pid>-…`) y la pone como `TMPDIR` de sus procesos, así que todo lo que los tests crean con `tmpdir()`, también en los procesos que lanzan, va dentro; al terminar la borra entera. Al empezar borra también las de ejecuciones anteriores cuyo proceso ya no existe, que murieron sin limpiar.
  - impacto: alto
- A2: Un único ayudante para todos los paquetes lo hace con el `globalSetup` de Vitest (también el de la UI, que corre Vitest con `runnerConfig`), sin tocar cada test.
  - impacto: alto
- A3: `specty cancel` quita la carpeta del cambio, como `close`, cuando no tiene nada sin commit y ninguna sesión de agente trabaja en ella; si no, la deja y dice por qué. La rama se queda, con su trabajo.
- A4: `specty prune` borra además, en la carpeta común de Specty, las escrituras a medias (`*.tmp`) y las ejecuciones en vivo (`runs/`) cuyo proceso ya no existe, y los índices temporales de git (`specty/index-*`) de más de una hora, y lo dice en su tarjeta.

## Criterios de aceptación

- AC1: CUANDO se ejecutan los tests de un paquete ENTONCES lo que crean en la carpeta temporal queda dentro de una carpeta de esa ejecución, que no existe al terminar, también si algún test falla.
- AC2: CUANDO al empezar una ejecución de tests hay carpetas de ejecuciones anteriores cuyo proceso ya no existe ENTONCES las borra, y no toca las de una ejecución que sigue en marcha.
- AC3: CUANDO la persona cancela un cambio sin nada sin commit en su carpeta ENTONCES la carpeta se quita y su rama se queda; con algo sin commit, la carpeta se queda y la tarjeta dice por qué.
- AC4: CUANDO se ejecuta `specty prune` y quedan escrituras a medias, ejecuciones en vivo de procesos que ya no existen o índices temporales viejos ENTONCES los borra y su tarjeta dice cuántos, sin tocar los de un proceso vivo.
- AC5: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Cortes

- C1: Los tests de la CLI, core y exporters borran sus temporales al terminar
  - ac: AC1, AC2
- C2: Los tests de vscode, la UI y evals borran sus temporales al terminar
  - ac: AC1
  - depends: C1
- C3: cancel quita la carpeta del cambio cuando nada se pierde
  - ac: AC3, AC5
- C4: prune borra los restos de los procesos que murieron
  - ac: AC4, AC5
  - depends: C3
