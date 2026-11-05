---
kind: epic
---

# Las épicas se construyen en paralelo con un subagente por feature

## Objetivo

Hoy una sesión construye una épica corte a corte, aunque su herramienta pueda lanzar subagentes: trabajar en paralelo exige que la persona abra una sesión por corte. Con esta épica, cuando la herramienta del agente tiene subagentes y Specty puede seguir sus acciones, la tarjeta de una épica aprobada pide un subagente por cada corte listo. Cada subagente construye su feature en su propia carpeta, con sus tareas en orden, y así la épica tarda menos. Una feature suelta, o una herramienta sin subagentes, siguen el flujo de hoy.

## Fuera de alcance

- Subagentes fuera de una épica: una feature suelta no los lanza (decisión de la persona, 2026-11-04).
- Repartir las tareas de una feature entre subagentes, también dentro de un corte: cada feature hace sus tareas en orden (decisión de la persona, 2026-11-04).
- Gemini CLI: sus hooks traen el `session_id` de la sesión principal sin distinguir al subagente (consultado el 2026-11-04), así que el guard no puede atar cada uno a la carpeta de su corte.
- Antigravity y Devin (Windsurf): tienen subagentes, pero sus hooks no documentan las acciones de estos (consultado el 2026-11-04). Quedan como pendiente en la memoria hasta que lo documenten.
- GitHub Copilot: Specty no tiene su guard.
- Que Specty lance los subagentes o elija su modelo: los lanza el agente, como le pide la tarjeta (la persona descartó que Specty orqueste modelos el 2026-11-03).
- Resolver solos los conflictos entre cortes: al cerrar siguen yendo al agente con `specty integrate`.
- Cambiar quién decide: aprobar, aceptar y cerrar cada corte siguen siendo de la persona (o del agente en modo delegado), aunque lleguen varias decisiones a la vez.

## Supuestos

- A1: Repartir los cortes es el comportamiento por defecto siempre que la herramienta lo admite, y `subagents: false` en `.specty/config.yaml` vuelve al flujo en orden. Esto revisa la conclusión de ARCHITECTURE §16, que no adoptó un subagente por cambio porque costaba unas 1,8 veces más en sesiones cortas: aquí se cambia coste por tiempo, y en una épica un contexto nuevo por corte puede costar menos que una sesión que no para de crecer.
  - impacto: alto
- A4: Lo que ven los hooks de cada herramienta en un subagente, según su documentación o su código (consultado el 2026-11-04). Claude Code: desde 2.1.69 traen `agent_id`. Codex: desde 0.134 traen `agent_id`, con el `session_id` del hilo principal. OpenCode: cada subagente es una sesión hija con su propio id. Cursor: cada subagente tiene su propio `conversation_id`. Cada corte de herramienta lo comprueba con la versión instalada antes de declararlo.
  - impacto: alto
- A5: En Claude Code, `agent_id` solo llega en los eventos de un subagente, no en los de la sesión principal; la documentación solo lo dice de `agent_type`. C1 lo comprueba con Claude Code real y el modelo guionizado antes de atar a nadie por él.
  - impacto: alto
- A6: Un subagente entra en la carpeta de su corte con `specty enter <id>`, también en Claude Code, cuya sesión principal sigue entrando con `EnterWorktree`. El `cd` de un subagente de Claude Code no dura entre comandos, así que trabaja con rutas absolutas de esa carpeta y empieza cada comando con `cd`; si no, el guard se lo bloquea con la ruta o el comando buenos, como hace hoy con las herramientas que no dejan reescribir sus acciones.
- A7: Se lanza un subagente por cada corte listo, aunque solo haya uno, porque así la sesión principal no carga con el contexto de todos los cortes.
- A9: Las decisiones de la persona de varios cortes pueden llegar a la vez. Cada subagente espera la suya con `specty wait`, y la UI y `specty status` ya las listan juntas.
- A10: Para medir (C10) bastan unas pocas ejecuciones reales con Claude Code de una épica pequeña en orden y con subagentes, como los experimentos de §16, que solo corren si se nombran.

## Criterios de aceptación

- AC1: CUANDO una épica aprobada tiene cortes listos, su herramienta reparte cortes y la configuración no lo apaga ENTONCES la tarjeta de la épica trae un encargo por cada corte listo, y su SIGUIENTE pide lanzar en paralelo un subagente por encargo y volver a ejecutar `specty next` en la épica cuando terminen.
- AC2: CUANDO un subagente recibe el encargo de un corte ENTONCES el encargo le dice cómo crear el cambio del corte, entrar en su carpeta, seguir `specty next` hasta cerrarlo con sus tareas en orden y sin lanzar otros subagentes, esperar a la persona con `specty wait` y responder en tres líneas.
- AC3: CUANDO la herramienta no tiene subagentes, no puede repartir cortes o la configuración tiene `subagents: false` ENTONCES la tarjeta de la épica es la de hoy.
- AC4: CUANDO un subagente entra con `specty enter` en la carpeta de un cambio ENTONCES el guard lo ata a ella sin mover a la sesión que lo lanzó ni a sus otros subagentes, juzga sus acciones con las reglas de ese cambio y le bloquea, con la ruta o el comando buenos, lo que escriba o ejecute fuera de ella.
- AC5: CUANDO un subagente atado a un cambio abierto intenta entrar en la carpeta de otro ENTONCES el guard se lo impide como a una sesión, y cuando su cambio se cierra queda libre.
- AC6: CUANDO un subagente crea el cambio de un corte con `specty new --epic --slice` ENTONCES la sesión que lo lanzó sigue atada a la épica, y su `specty next` le muestra la tarjeta de la épica.
- AC7: CUANDO se cierra un corte y deja listo otro, o un corte en curso se queda huérfano ENTONCES la tarjeta de la épica trae el encargo de empezar el nuevo o de continuar el huérfano, y los cortes que lleva un subagente salen en curso, sin encargo.
- AC16: CUANDO se muestra la tabla de capacidades de los agentes (ARCHITECTURE §10) ENTONCES cada herramienta dice si reparte los cortes de una épica entre subagentes, y por qué no cuando no es posible.
- AC17: CUANDO un subagente de Codex entra con `specty enter` en la carpeta de un cambio ENTONCES el guard lo ata por su `agent_id` y lleva allí sus comandos y parches, sin mover al hilo principal.
- AC18: CUANDO un subagente de OpenCode entra con `specty enter` en la carpeta de un cambio ENTONCES el guard lo ata por su sesión hija y lleva allí sus acciones, sin mover a la sesión principal.
- AC19: CUANDO un subagente de Cursor entra con `specty enter` en la carpeta de un cambio ENTONCES el guard lo ata por su `conversation_id` y lleva allí sus acciones, sin mover a la conversación principal.
- AC21: CUANDO se ejecutan los experimentos de una épica pequeña en orden y con subagentes ENTONCES el informe de las evals da de cada uno el tiempo, las rondas, el coste y si cumplió el flujo.
- AC22: CUANDO el cambio no es una épica (una feature suelta o el corte de una épica) ENTONCES ninguna tarjeta pide lanzar subagentes, y sus tareas van en orden como hoy.

## Diseño

- Decisiones de la persona (2026-11-04): solo una épica reparte su trabajo entre subagentes, uno por feature (corte); una feature suelta no los lanza, y cada feature hace sus tareas en orden.
- Capacidades: `AGENT_CAPABILITIES` gana la columna `subagentSlices`: el guard distingue a cada subagente y lo ata a la carpeta de su cambio. C1 la crea con Claude Code en «sí» y deja las demás herramientas sin ella hasta su corte. Gemini CLI, Antigravity y Devin quedan en «no posible», con su motivo.
- Configuración: `subagents` (`true` por defecto). Con `false`, la tarjeta de la épica no pide subagentes. La épica reparte cuando la herramienta detectada tiene la capacidad y esta clave no lo apaga.
- Identidad de un subagente: la conversación de un evento es su `session_id` (o `conversation_id`) más el `agent_id` del subagente cuando lo trae (Claude Code, Codex). OpenCode y Cursor ya dan un id propio a cada subagente. Cada uno tiene su enlace en `sessions/<conversación>.json`, con la regla «una conversación, un cambio abierto».
- Entrar: un subagente entra con `specty enter <id>` (A6). Desde ahí, el guard lo juzga con la sesión de esa carpeta, como a las herramientas que entran así. En Codex, Cursor y OpenCode le reescribe las acciones; en Claude Code se las bloquea con la ruta o el comando buenos. `specty new --epic --slice` ya no mueve a una conversación atada a su épica abierta: queda atada al corte cuando entra en él, con `EnterWorktree` o `specty enter`.
- Encargos: son textos de `core/src/cards`, en español e inglés, que la sesión pasa tal cual a cada subagente.
  - El de un corte: crear su cambio con `specty new "<título>" --epic <id> --slice <corte>`, entrar con `specty enter`, seguir `specty next` en su carpeta hasta cerrarlo, con sus tareas en orden y sin lanzar otros subagentes, esperar a la persona con `specty wait` y responder en tres líneas: el cambio, su fase y lo que falta.
  - El de un corte huérfano es el mismo desde `specty enter`.
- La sesión principal se queda en la épica: lanza los encargos en un solo mensaje, espera los informes y vuelve a ejecutar `specty next` allí para los cortes que queden listos.
- Documentos: cada corte actualiza lo que toca: ARCHITECTURE §4, §6, §7, §10, §11 y §16, formats §6 (`subagents`) y el glosario con «Encargo».

## Cortes

- C1: Cada subagente de Claude Code trabaja en la carpeta de su cambio
  - ac: AC4, AC5, AC6, AC16
- C2: La tarjeta de una épica reparte sus cortes listos entre subagentes
  - ac: AC1, AC2, AC3, AC7, AC22
  - depends: C1
- C6: Cada subagente de Codex trabaja en la carpeta de su cambio
  - ac: AC17
  - depends: C1
- C7: Cada subagente de OpenCode trabaja en la carpeta de su cambio
  - ac: AC18
  - depends: C1
- C8: Cada subagente de Cursor trabaja en la carpeta de su cambio
  - ac: AC19
  - depends: C1
- C10: Las evals miden el tiempo y el coste de una épica con subagentes
  - ac: AC21
  - depends: C2

## Riesgos

- R1: Más consumo: cada subagente empieza con un contexto nuevo (unos 0,12 USD por cambio en §16). Mitigación: `subagents: false`, y C10 mide tiempo y coste antes de dar el diseño por bueno.
- R2: Conflictos entre cortes que avanzan a la vez. Mitigación: `propose` ya avisa de los archivos que comparte con otros cambios abiertos, y al cerrar los conflictos van al agente con `specty integrate`.
- R4: Lo que ven los hooks de los subagentes está documentado a medias: el `session_id` de un subagente de Claude Code y si `agent_id` llega en la sesión principal (A5). Mitigación: cada corte lo comprueba con la herramienta instalada, con el modelo guionizado donde se puede, antes de declarar la capacidad.
- R5: Varios subagentes ejecutan `specty new` a la vez: worktrees, ramas y preparación de carpetas en paralelo. Mitigación: C2 lo prueba con cortes simultáneos. Si git choca con sus bloqueos, el encargo pide crear los cambios en orden.
- R6: Un subagente de Claude Code olvida el `cd` y su comando correría en la carpeta de la sesión principal. Mitigación: el guard lo bloquea con el comando bueno (A6), y el encargo lo avisa desde el principio.
- R7: La tarjeta de la épica crece con los encargos. Mitigación: el test de presupuesto del core, y encargos de pocas líneas que remiten a `specty next`.

## Cierre

### Resumen

- Una épica con cortes listos los reparte, uno por subagente, cuando su herramienta lo admite y `subagents: false` no lo apaga. Una feature suelta o el corte de una épica nunca lanza subagentes, y sus tareas van en orden.
- C1: Claude Code distingue a cada subagente por su `agent_id` (la conversación `<session_id>--<agent_id>`). El subagente entra con `specty enter <id>` y crea el cambio de su corte con `specty new --subagent`.
- C2: la tarjeta de la épica trae un encargo por cada corte listo o huérfano.
- C6, C7 y C8: Codex, OpenCode y Cursor pasan a «sí» en «Cortes en subagentes». Gemini CLI queda en «no posible»; Antigravity y Devin, sin documentar.
- C10: los experimentos `epic` y `epic-subagent` miden tiempo, rondas y coste.
- Fuera de los cortes, también cerrados:
  - P81: el guard bloquea el `EnterWorktree` de un subagente y el `new` sin `--subagent`.
  - P101: la sesión de Claude Code sale de la worktree de la épica antes de repartir, y `next` desde la carpeta principal trae la tarjeta de la épica.
  - Márgenes para los tests que fallaban por tiempo con la máquina cargada.

### Desviaciones (respecto al plan)

- Las oleadas de tareas en subagentes se quitaron por decisión del usuario: un subagente por feature, con sus tareas en orden. Los cortes C3–C5 y C9 se descartaron, y sus ids no se reutilizan.
- C1 salía demasiado grande, así que sus redes del guard pasaron a P81, un cambio aparte.
- La primera medición de C10 encontró P101: los subagentes de una sesión que está en la worktree de la épica no pueden escribir en sus cortes. Se arregló en un cambio aparte; la nueva medición queda pendiente (P107).
- Con varias sesiones a la vez, muchas verificaciones completas fallaron por carga, tiempo o tests inestables. La persona subió `verify.timeoutSec` a 2000, y los cierres se hicieron de uno en uno con la máquina libre.

### Decisiones

- Repartir es el comportamiento por defecto (A1): en una épica se cambia coste por tiempo, lo que revisa la conclusión de §16.
- A los subagentes de Claude Code el guard no les reescribe las acciones, porque `updatedInput` exige «allow» y saltaría los permisos de la persona: les bloquea lo que cae fuera, con la ruta o el `cd` buenos. A los de Codex sí se las reescribe.
- Antes de lanzar los encargos, la sesión de Claude Code sale de la worktree de la épica con `ExitWorktree` y `action: "keep"`. Lo eligió el usuario.

### Pendientes

- P107: repetir `epic` y `epic-subagent` (2 ejecuciones como mucho) y actualizar la tabla y la conclusión de §16.
- P106: al cerrar un corte, el SIGUIENTE debería nombrar la épica a la que volver.
- P82: los hooks de los subagentes de Antigravity y Devin, sin documentar.
- P89: el freno de duplicados de `specty new` salta por la petición común de los cortes.
- P92, P93 y P95: el fin de turno de OpenCode en sesiones hijas, OpenCode 2 fuera de beta, y la tarjeta cuando la verificación se corta por `verify.timeoutSec`.
