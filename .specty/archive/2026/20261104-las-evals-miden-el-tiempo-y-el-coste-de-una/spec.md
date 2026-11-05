---
kind: standard
epic: 20261104-epicas-y-features-con-subagentes
slice: C10
---

# Las evals miden el tiempo y el coste de una épica con subagentes

## Objetivo

Hoy las evals miden el coste de tres cambios seguidos, pero no el de una épica ni su tiempo de reloj, así que nadie sabe si repartir los cortes entre subagentes compensa lo que cuesta. Con este corte, dos experimentos construyen la misma épica aprobada de tres cortes triviales, uno en orden (`subagents: false`) y otro con un subagente por corte, y el informe da de cada uno el tiempo, las rondas, el coste y si cumplió el flujo. Con unas pocas ejecuciones reales de Claude Code, ARCHITECTURE §16 apunta lo que se midió.

## Fuera de alcance

- Medir con Codex, OpenCode o Cursor: todavía no reparten los cortes (C6, C7 y C8 de la épica), y la suite solo lee el coste de Claude Code.
- Cambiar la tarjeta de la épica o el valor por defecto de `subagents` según el resultado: si la medida lo aconseja, va en otro cambio.
- Una medida estable: con dos ejecuciones por experimento, §16 da cifras orientativas y no cierra el criterio de salida de la fase 3 (§18).
- Guardar la transcripción de cada ejecución: Claude Code ya la guarda en su carpeta de proyectos.

## Supuestos

- A1: Bastan dos ejecuciones reales de cada experimento con Claude Code, como dice A10 de la épica: consumen la cuota de la persona y solo corren si `SPECTY_EVALS_SCENARIOS` los nombra.
- A2: El tiempo es el de reloj que mide la suite alrededor del agente, para cualquier agente, y no el `duration_ms` del `stream-json`. Así cuenta también una ejecución cortada por su límite, que no trae su resultado, y lo que tarden los subagentes que sigan tras él.
- A3: El agente empieza en la carpeta principal, como la sesión de una persona, y entra en la épica con `EnterWorktree`. Así las carpetas de los cortes, dentro de `.worktrees/`, quedan dentro de su carpeta de trabajo, y Claude Code deja escribir en ellas sin preguntar. La preparación deja la épica sin conversación, con su estado escrito hace dos horas, para que `specty next` en la carpeta principal diga cómo retomarla.
  - impacto: alto
- A4: Una épica de tres cortes independientes, cada uno con una constante en su archivo, basta para comparar los dos flujos. Cada corte es un cambio standard con una tarea, y la verificación pasa siempre (`verify.default: "true"`), así que el tiempo y el coste son los del flujo y no los del trabajo.
- A5: 200 turnos y 45 minutos bastan para los tres cortes en orden: unos 25 turnos por corte, más los de la épica.

## Criterios de aceptación

- AC1: CUANDO la suite termina sus ejecuciones ENTONCES el informe da, por agente y escenario o experimento, el tiempo medio de reloj de sus ejecuciones junto a las que cumplieron y sus rondas, y el coste medio en «Consumo».
- AC2: CUANDO se prepara el experimento `epic` o `epic-subagent` ENTONCES el repositorio tiene en `.worktrees/` una épica aprobada de tres cortes independientes, uno por archivo, en modo delegado y sin conversación que la retenga, que `specty next` en la carpeta principal ofrece retomar; `epic` lleva `subagents: false` y `epic-subagent` no lleva la clave, y los dos tienen el mismo encargo, que no nombra los subagentes.
- AC3: CUANDO se juzga un experimento de la épica ENTONCES cumple con los tres archivos arreglados en la carpeta principal y sus tres cortes cerrados; un archivo cambiado que ningún corte cerrado nombra es código sin un cambio de Specty, una violación, y lo demás queda sin avance.
- AC4: CUANDO `SPECTY_EVALS_SCENARIOS` nombra los experimentos de la épica ENTONCES corren, con más turnos y minutos que los de los tres cambios; sin nombrarlos, no corren.
- AC5: CUANDO se ejecuta dos veces cada experimento de la épica con Claude Code ENTONCES ARCHITECTURE §16 da de cada uno el tiempo, las rondas, el coste y si cumplió, con la conclusión que permiten tan pocas ejecuciones.
  - test: manual

## Diseño

- Tiempo: `runOnce` (`run/compliance.eval.ts`) mide los segundos de reloj de cada ejecución, desde que lanza el agente hasta que termina o lo corta su límite, y `Run` gana `seconds`. `summarize` da su media entera por agente y escenario, y la tabla del informe gana la columna «Tiempo (s)». El coste sigue en «Consumo».
- Experimentos `epic` y `epic-subagent` (`src/experiments.ts`):
  - Preparación: el repositorio de los otros experimentos (Specty para la herramienta y `delegate on` de la persona simulada), con worktrees y `git.setup: false`. Crea con `specty new --kind epic` la épica «Constantes nuevas», de tres cortes sin `depends`: C1 deja `a` en 2, C2 `b` en 3 y C3 `c` en 4. La propone y la aprueba la persona, y atrasa dos horas la fecha de su `state.json`.
  - `epic` añade `subagents: false`; `epic-subagent` deja la configuración por defecto. El encargo es el mismo: construir la épica de `.worktrees/` corte a corte con `specty next`, en modo delegado, hasta cerrar todos sus cortes y sin pasar la épica a aceptación. Repartir o no lo decide la tarjeta.
  - Juicio, sobre la carpeta principal, donde cada cierre incorpora su corte: cumple con los tres archivos arreglados y tres cortes archivados (specs con `slice:`). Un archivo cambiado que ninguna de esas specs nombra es una violación.
  - 200 turnos y 45 minutos, porque el flujo en orden hace tres cambios standard.
- Ejecución real: `SPECTY_EVALS_AGENTS=claude-code SPECTY_EVALS_SCENARIOS=epic,epic-subagent SPECTY_EVALS_RUNS=<n> pnpm evals`, con el Claude Code del PATH. Las rondas incluyen las de los subagentes cuando el `stream-json` las trae; se comprueba en las transcripciones de Claude Code.
- Documentos: ARCHITECTURE §16, con el tiempo en el informe, los experimentos de la épica y la tabla con sus resultados y su conclusión, en lugar de «están por medir».

## Archivos

- modificar evals/src/report.ts — el tiempo medio de reloj de cada agente y escenario en el informe
- modificar evals/run/compliance.eval.ts — mide el tiempo de reloj de cada ejecución
- modificar evals/test/report.test.ts — el tiempo en la tabla del informe
- modificar evals/test/consumption.test.ts — las ejecuciones de su informe llevan su tiempo
- modificar evals/src/experiments.ts — los experimentos `epic` y `epic-subagent`
- modificar evals/test/experiments.test.ts — la preparación, el juicio y los límites de los experimentos de la épica
- modificar docs/ARCHITECTURE.md — los experimentos de la épica y sus resultados (§16)

## Tareas

- [x] T1: El informe da el tiempo de reloj de cada escenario y experimento
  - files: evals/src/report.ts, evals/run/compliance.eval.ts, evals/test/report.test.ts, evals/test/consumption.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/report.test.ts test/consumption.test.ts && pnpm lint
- [x] T2: Los experimentos construyen una épica en orden y con un subagente por corte
  - files: evals/src/experiments.ts, evals/test/experiments.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/experiments.test.ts && pnpm typecheck && pnpm lint && pnpm knip
- [x] T3: ARCHITECTURE §16 da el tiempo y el coste medidos de la épica
  - files: docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run && pnpm typecheck
  - type: docs

## Riesgos

- R1: Las ejecuciones reales consumen la cuota de la persona. Mitigación: solo corren si se nombran, y bastan dos de cada experimento.
- R2: Pocas ejecuciones no dan una medida estable, porque el modelo varía de una a otra. Mitigación: §16 da las cifras de cada experimento y una conclusión prudente.
- R3: En orden, Claude Code cambia de carpeta con `EnterWorktree` entre la épica y cada corte; si sin interfaz no lo consigue, el experimento queda sin avance. Mitigación: el informe lo cuenta así, y §16 lo apunta como hallazgo con su pendiente.
- R4: Sin interfaz (`claude -p`), los subagentes pueden correr en segundo plano y no aparecer en el `stream-json`, o morir al terminar el turno principal. Mitigación: la primera ejecución se revisa en las transcripciones de Claude Code antes de repetirla, y §16 dice qué cuentan las rondas.

## Cierre

### Resumen

- El informe de las evals da, por agente y escenario o experimento, el tiempo medio de reloj en la columna «Tiempo (s)», junto a las ejecuciones que cumplieron y sus rondas. El ejecutor lo mide desde que lanza el agente hasta que termina o lo corta su límite (`Run.seconds`). El coste sigue en «Consumo».
- Experimentos `epic` (con `subagents: false`) y `epic-subagent` (configuración por defecto). Los dos preparan la misma épica aprobada de tres cortes independientes en `.worktrees/`, en modo delegado y sin conversación que la retenga, y tienen el mismo encargo. Se juzgan en la carpeta principal por los cortes archivados que nombran cada archivo, con 200 turnos y 45 minutos.
- Dos ejecuciones reales de cada uno con Claude Code 2.1.318 y Opus 5.5, por 5,56 USD en total:
  - en orden: cumplió 2 de 2, en 228 y 298 s, con 64 y 59 rondas y 1,06 y 1,08 USD;
  - con un subagente por corte: cumplió 1 de 2, en 411 y 144 s, con 109 y 47 rondas y 2,19 y 1,23 USD. La segunda quedó sin avance.
- La causa: el reparto no llegó a trabajar en paralelo. La sesión principal entra en la épica con `EnterWorktree`, como le pide Specty, y Claude Code aísla a sus subagentes en esa worktree. En la carpeta de su corte les rechaza Write, Edit y los Bash complejos, y sin interfaz les deniega `EnterWorktree`.
  - En la primera ejecución, un subagente cerró su corte escribiendo con `printf`, y la sesión principal rehízo en orden los otros dos.
  - En la segunda, los tres se rindieron.
- ARCHITECTURE §16 describe los dos experimentos y el tiempo del informe, y da la tabla con las dos ejecuciones y la conclusión.

### Desviaciones (respecto al plan)

- La primera ejecución de cada experimento se hizo antes de completar T2, para probar el arnés mientras su código aún podía ajustarse. No hizo falta tocarlo, así que cuenta como una de las dos.
- La tabla de §16 da las dos cifras de cada experimento y no su media, porque con subagentes la media mezclaría una ejecución que cumplió con otra sin avance.

### Decisiones

- El tiempo lo mide el ejecutor con el reloj, y no lo toma del `duration_ms` del `stream-json`: así vale para cualquier agente y para una ejecución cortada por su límite.
- Las rondas suman las de la sesión principal y las de sus subagentes. Se comprobó en las transcripciones de Claude Code que el `stream-json` las trae aunque los subagentes corran en segundo plano (53 más 56 en la primera ejecución con subagentes).
- Sin tercera ejecución: las dos de `epic-subagent` fallaron por la misma causa, y otra no habría medido el reparto. La medida del ahorro queda para cuando se arregle (P101).

### Pendientes

- P101: con Claude Code, los subagentes de una épica no pueden escribir en la carpeta de su corte cuando la sesión principal entró en la épica con `EnterWorktree`. Arreglo a decidir (salir de la worktree antes de lanzar los encargos, o que el encargo lo resuelva), y después repetir `epic-subagent`.
- P102: en orden, `EnterWorktree` con `name` no entra en un corte desde la worktree de la épica hasta salir con `ExitWorktree keep`. El agente se recuperó solo, pero gasta rondas en cada corte; las tarjetas de `new` y `close` podrían pedirlo primero.
