---
kind: standard
follows:
  - 20261026-un-test-en-la-raiz-de-su-carpeta-cuenta-por-su-n
---

# Los tests de los paquetes corren de uno en uno

## Objetivo

El primer CI en GitHub falló en `pnpm check` en los cuatro sistemas. Reproducido en un clon limpio: `pnpm -r test` prueba los cuatro paquetes a la vez, y con los tests de la CLI lanzando procesos de git, tres tests de la UI pasan de su límite de 5 segundos. Solos, ninguno llega a uno; los runners tienen 3 o 4 núcleos, frente a los 14 de la máquina local. `pnpm test` pasa a probar los paquetes de uno en uno, y cada uno sigue con sus propios hilos.

## Fuera de alcance

- Subir el límite de tiempo de los tests de la UI o hacerlos más rápidos.
- Cambiar el workflow de CI.

## Supuestos

- A1: La contención entre paquetes explica los tres fallos: con la UI sola, en el mismo clon y con un `HOME` vacío como el del runner, todos sus tests pasan y ninguno llega a un segundo.
  - impacto: alto
- A2: Probar los paquetes en serie alarga `pnpm check` en local, pero menos de lo que cuesta un CI que falla por tiempo.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `pnpm test` ENTONCES prueba core, exporters, ui y cli uno detrás de otro, y cada uno con su propio paralelismo.
- AC2: CUANDO el CI ejecuta `pnpm check` tras subir este cambio ENTONCES los trabajos de Linux y macOS pasan.

## Archivos

- modificar package.json — `pnpm test` con `--workspace-concurrency=1`

## Tareas

- [ ] T1: Los paquetes, de uno en uno
  - files: package.json
  - ac: AC1, AC2
  - verify: pnpm check
  - type: build
