---
kind: epic
---

# Todos los agentes al nivel de Claude Code

## Objetivo

Hoy solo Claude Code tiene todo lo que Specty hace con un agente: el guard antes de cada acción, el aviso tras cada comando de shell, `specty check` al terminar el turno, la tarjeta de la tarea tras compactar, las reglas que dejan decidir a Specty, la exclusión de dependencias y código generado, y una prueba de extremo a extremo con la herramienta real. Esta épica lleva Codex, Cursor, OpenCode, Antigravity, Windsurf y Gemini CLI tan cerca de ese nivel como permiten sus hooks. Donde una herramienta no tiene el evento que usa Claude Code, Specty toma el camino indirecto más cercano (decisión de la persona); lo que no tenga ningún camino queda en la tabla de capacidades como «no posible», con su motivo.

## Fuera de alcance

- GitHub Copilot y las herramientas sin hooks (Aider, Zed, Cline, Continue…).
- Las worktrees que crean las propias herramientas para sus agentes en paralelo (Cursor, Windsurf, la app de Codex): Specty sigue con las suyas, en el mismo sitio.
- Probar con el modelo real de cada herramienta: las pruebas de extremo a extremo usan un modelo simulado.
- Escribir en la carpeta del usuario (ADR 0013): todo va al repositorio o a archivos locales que git excluye.
- Cambiar lo que Specty decide: los adaptadores solo traducen los eventos y las respuestas de cada herramienta.

## Supuestos

- A1: La documentación oficial, revisada el 2026-10-26, dice lo que permite cada herramienta: Codex tiene `SessionStart` con `source: compact`; Cursor, `preCompact` (que solo observa) y `additional_context` en `postToolUse`; OpenCode, `experimental.session.compacting` y el evento `session.idle`; Antigravity, en `.agents/hooks.json`, tiene `PreToolUse`, `PostToolUse` (sin respuesta al modelo), `PreInvocation` y `PostInvocation` con `injectSteps`, `Stop` con `decision: "continue"` y `SessionStart`, sin evento de compactación y sin códigos de salida (un `{}` deniega); Windsurf, ahora Devin Desktop, lee `.devin/hooks.json` (o `.windsurf/hooks.json` si aquel no existe) y solo responde al modelo desde un hook previo que sale con 2; Gemini CLI, en `.gemini/settings.json`, tiene `BeforeTool`, `AfterTool`, `AfterAgent`, `SessionStart` y `PreCompress` (solo informativo). Cada corte lo comprueba contra la versión instalada antes de escribir su adaptador.
  - impacto: alto
- A2: Los caminos indirectos entregan lo mismo que Claude Code recibe en su evento, en otro momento: en Antigravity, el aviso tras un comando llega en la siguiente llamada al modelo (`PreInvocation`) y la tarjeta, como mensaje efímero al empezar cada turno, porque no hay evento de compactación; en Cursor y Gemini CLI, la tarjeta tras compactar llega con el siguiente resultado de una herramienta; en Windsurf, el aviso tras un comando llega bloqueando una vez su siguiente acción con el motivo, y esa acción pasa al repetirla.
  - impacto: alto
- A3: En Windsurf no hay ningún camino para el fin de turno ni para la tarjeta tras compactar, porque sus hooks posteriores no responden al modelo y no tiene eventos de sesión ni de compactación: quedan como «no posible», y `task done` sigue siendo la puerta.
- A4: Ninguna otra herramienta tiene `EnterWorktree`, así que «worktree por nombre» no aplica fuera de Claude Code; su equivalente es que el SIGUIENTE de `specty new` diga cómo abrir esa herramienta en la carpeta del cambio.
- A5: Las pruebas de extremo a extremo con un modelo simulado son posibles en Codex, OpenCode y Gemini CLI, que dejan apuntar a otro servidor de modelo; Cursor y Antigravity van siempre por su servidor y Windsurf no tiene CLI, así que sus pruebas usan eventos con la forma que documentan, como hoy la de Cursor.
  - impacto: alto
- A6: Antigravity y Windsurf leen `AGENTS.md` por sí mismos; Gemini CLI lee `GEMINI.md`, así que `init` crea uno que importa `@AGENTS.md`, como hace con `CLAUDE.md`.
- A7: Antigravity lee `.antigravityignore`, con la sintaxis de `.gitignore`; OpenCode no tiene un archivo de exclusión propio, pero su plugin puede rechazar las lecturas; Codex lee por la shell y no tiene ninguno de los dos caminos, así que su exclusión queda como «no posible».
- A8: Solo Codex tiene nombres de esfuerzo propios por sesión (`low`, `medium`, `high`, `xhigh`); las demás eligen el razonamiento con el modelo, y sus tarjetas siguen con los niveles neutros.
- A9: Una terminal del agente de Windsurf o de Antigravity se reconoce por su entorno, como la de Codex; si alguna no deja marca, el guard sigue bloqueando los comandos de la persona antes de que se ejecuten.
- A10: Specty no puede dar por la persona la confianza que cada herramienta pide para los hooks del proyecto (Codex con `/hooks`, Gemini CLI cuando cambia el comando, el espacio de trabajo de confianza de Cursor y Antigravity, el modo restringido de Windsurf): `init` y `doctor` dicen cómo darla.
- A11: El sandbox de Cursor deja escribir solo en su espacio de trabajo, y en la carpeta de un cambio la carpeta común de git queda fuera, así que veta los commits de `task done`; Windsurf y Gemini CLI piden confirmación a la persona o ejecutan, según su modo, sin vetar los comandos de Specty, y OpenCode no tiene sandbox ni clasificador.

## Criterios de aceptación

- AC1: CUANDO se ejecutan las pruebas actuales del guard, de `init`, de `check --install`, de `doctor` y de `uninstall` con cada agente en su propio módulo ENTONCES pasan sin cambiar lo que comprueban.
- AC2: CUANDO el agente de Antigravity, Windsurf o Gemini CLI va a escribir o borrar fuera del alcance de la tarea, o a ejecutar `git commit` o un comando de la persona sin modo delegado ENTONCES el guard lo bloquea antes de que ocurra y el agente recibe el motivo y el SIGUIENTE.
- AC3: CUANDO un comando de shell del agente cambia archivos que no podía cambiar ENTONCES el aviso llega al modelo también en Gemini CLI, tras el comando; en Antigravity, en la siguiente llamada al modelo; y en Windsurf, en su siguiente acción.
- AC4: CUANDO el agente termina su turno y `specty check --changed` falla ENTONCES sigue trabajando con el informe también en OpenCode, Antigravity y Gemini CLI, y un turno que ya volvió por eso puede terminar.
- AC5: CUANDO la herramienta compacta la conversación ENTONCES la tarjeta de `specty next` vuelve al contexto del agente en Codex, Cursor, OpenCode y Gemini CLI; en Antigravity, está al empezar cada turno.
- AC6: CUANDO `specty check --install` corre en un repositorio que usa OpenCode o Antigravity ENTONCES su agente deja de leer las rutas de `checks.exclude` y `scope.generated`.
- AC7: CUANDO el control de permisos de una herramienta veta un comando de Specty que Specty permite, como el commit de `task done` en la carpeta de un cambio ENTONCES `init` escribe en el proyecto la regla que deja la decisión a Specty; si la herramienta solo la admite en la carpeta del usuario, `doctor` le dice a la persona cómo añadirla.
- AC8: CUANDO `specty init` corre en un repositorio que usa Antigravity, Windsurf o Gemini CLI ENTONCES instala sus hooks en el proyecto (o en un archivo local que git excluye, si el comando lleva una ruta de la máquina), `doctor` avisa si faltan y `uninstall` los quita.
- AC9: CUANDO Gemini CLI abre un repositorio con Specty ENTONCES lee el flujo de `AGENTS.md` a través del `GEMINI.md` que crea `init`, sin copiarlo.
- AC10: CUANDO se ejecuta `pnpm check` en una máquina con Codex, OpenCode o Gemini CLI ENTONCES una prueba hace que la herramienta siga un guion con un modelo simulado y comprueba el guard, el aviso tras cada comando y el fin de turno; sin la herramienta, la prueba se salta.
- AC11: CUANDO la tarjeta recomienda un esfuerzo y el agente es Codex ENTONCES lo nombra con los niveles de Codex.
- AC12: CUANDO `specty new` crea la carpeta de un cambio desde un agente que no es Claude Code ENTONCES su SIGUIENTE dice cómo abrir esa herramienta en la carpeta.
- AC13: CUANDO el agente de Windsurf o de Antigravity ejecuta en su terminal un comando de la persona sin modo delegado ENTONCES Specty no lo ejecuta como si fuera de la persona.
- AC14: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES cada herramienta muestra en cada capacidad «sí», «indirecto» o «no posible», con el motivo de cada «no posible», y no queda ninguna «pendiente».

## Diseño

- Cada agente vive en un módulo de la CLI con todo su protocolo: cómo leer sus eventos, cómo responder (bloquear, permitir, avisar, seguir tras el turno, devolver la tarjeta), qué archivos instala y cómo los reconocen `doctor` y `uninstall`. El guard, `agent-stop`, `check --install`, `doctor` y `uninstall` llaman al módulo en vez de preguntar por cada herramienta. Así cada corte de una herramienta toca su módulo, sus pruebas y su fila de la documentación.
- La tabla `AGENT_CAPABILITIES` pasa de sí y no a cuatro estados: «sí», «indirecto», «no posible» (con su motivo) y «pendiente». Suma las columnas de fin de turno, exclusión, permisos y prueba de extremo a extremo. C2 la deja con la verdad de hoy, cada corte cambia las celdas de su herramienta, y C13 quita el estado «pendiente» del tipo, para que no pueda volver.
- Los caminos indirectos que necesitan recordar algo entre dos eventos (el aviso de Antigravity y de Windsurf, la tarjeta de Cursor y de Gemini CLI) lo guardan en la carpeta de Specty dentro de git, junto a las fotos de `shell/`, y lo entregan una sola vez.
- Donde la herramienta no lleva la cuenta de las vueltas tras el fin de turno (OpenCode, Antigravity, Gemini CLI), la lleva Specty por sesión, con la misma regla que `stop_hook_active`.
- Antigravity responde siempre con JSON y `decision`, también para permitir; Windsurf y Gemini CLI bloquean con salida 2 y el motivo por stderr, como Claude Code.
- Las pruebas de extremo a extremo siguen la de Claude Code: un servidor local hace de modelo con un guion, la herramienta corre sin la configuración de la persona, y la prueba se salta si la herramienta no está instalada.
- Tras C1 y C2, los cortes de cada herramienta no dependen entre sí: pueden ir en paralelo, una sesión por corte.

## Cortes

- C1: Cada agente en su módulo
  - ac: AC1
- C2: La tabla de capacidades dice qué es directo, indirecto o no posible
  - ac: AC14
  - depends: C1
- C3: Codex trae la tarjeta tras compactar y nombra su esfuerzo
  - ac: AC5, AC11
  - depends: C2
- C4: Codex sigue un guion con un modelo simulado
  - ac: AC10
  - depends: C3
- C5: Cursor trae la tarjeta tras compactar y deja hacer commits a Specty en su sandbox
  - ac: AC5, AC7
  - depends: C2
- C6: OpenCode comprueba el fin de turno, trae la tarjeta tras compactar y no lee lo excluido
  - ac: AC4, AC5, AC6
  - depends: C2
- C7: OpenCode sigue un guion con un modelo simulado
  - ac: AC10
  - depends: C6
- C8: El guard de Antigravity
  - ac: AC2, AC3, AC8, AC13
  - depends: C2
- C9: Antigravity comprueba el fin de turno, trae la tarjeta en cada turno y no lee lo excluido
  - ac: AC4, AC5, AC6, AC7
  - depends: C8
- C10: El guard de Windsurf
  - ac: AC2, AC3, AC8, AC13
  - depends: C2
- C11: El guard de Gemini CLI y su GEMINI.md
  - ac: AC2, AC3, AC8, AC9
  - depends: C2
- C12: Gemini CLI comprueba el fin de turno, trae la tarjeta tras compactar y sigue un guion con un modelo simulado
  - ac: AC4, AC5, AC10
  - depends: C11
- C13: Cada herramienta sabe seguir en la carpeta del cambio, y la tabla queda sin pendientes
  - ac: AC12, AC14
  - depends: C3, C4, C5, C6, C7, C8, C9, C10, C11, C12

## Riesgos

- R1: Las herramientas cambian sus hooks entre versiones: Antigravity ignora en silencio un evento mal escrito, y Windsurf cambió este año de nombre y de carpeta. Mitigación: cada corte anota en ARCHITECTURE §10 la versión que comprobó, y su prueba usa la forma de los eventos que documenta la herramienta.
- R2: En Antigravity, un hook que falla o responde `{}` deniega la acción, así que un error del guard bloquearía de más. Mitigación: su adaptador responde siempre un `allow` explícito cuando permite y ante sus propios errores, igual que hoy el guard falla abierto.
- R3: Codex quizá solo admita su API de respuestas en streaming, más trabajo de simular que la de Claude Code. Mitigación: su prueba va en su propio corte (C4), y si no deja apuntar a otro servidor, su celda queda «no posible» con el motivo.
- R4: Codex también usa la carpeta `.agents` (sus skills), así que `init` podría instalar los hooks de Antigravity en un repositorio que no lo usa. Mitigación: C8 detecta Antigravity por sus archivos (`.agents/hooks.json`, `.agents/rules`, `.antigravityignore`) y no solo por la carpeta.
- R5: Windsurf solo lee `.windsurf/hooks.json` si `.devin/hooks.json` no existe o no tiene hooks, así que crear este último dejaría sin efecto los hooks de la persona. Mitigación: C10 escribe en `.devin/hooks.json` solo si ya existe y, si no, en `.windsurf/hooks.json`, que leen las versiones nuevas y las antiguas.
- R6: Con una ruta de la máquina en el comando, el hook iría a un archivo que la persona puede tener versionado con otros ajustes (`.gemini/settings.json`, `.agents/hooks.json`). Mitigación: el corte de esa herramienta lo detecta y, en ese caso, pide tener `specty` en el PATH en vez de escribir la ruta.
- R7: La tarjeta al empezar cada turno en Antigravity gasta contexto en todos los turnos. Mitigación: solo se inyecta con un cambio activo en la carpeta, y como mensaje efímero, que no se acumula.
- R8: Varios cortes en paralelo editan las mismas secciones de ARCHITECTURE §10 y de formats.md. Mitigación: cada corte edita solo las filas y los párrafos de su herramienta, y los conflictos se resuelven al incorporar (`specty integrate`).

## Cierre

### Resumen

Los seis agentes quedan al nivel de Claude Code en todo lo que sus hooks permiten. La tabla de capacidades de ARCHITECTURE §10 ya no tiene ninguna celda «pendiente», y el tipo `Support` ya no admite ese estado:
- Cada agente vive en su módulo (`agents/`), y `AGENT_CAPABILITIES` dice qué es «sí», «indirecto» (y cómo) o «no posible» (y por qué).
- Codex tiene la tarjeta tras compactar, sus nombres de esfuerzo y una prueba con Codex 0.164.0 y un modelo simulado.
- Cursor tiene la tarjeta tras compactar (indirecta), y su sandbox deja hacer commits a Specty.
- OpenCode tiene el fin de turno, la tarjeta, la exclusión y una prueba con OpenCode 1.19.4.
- Antigravity tiene:
  - el guard;
  - el aviso tras cada comando y la tarjeta, los dos indirectos;
  - el fin de turno, la exclusión y los permisos con cada acción;
  - el reconocimiento de la terminal de Antigravity CLI.
- Gemini CLI tiene el guard, `GEMINI.md`, el fin de turno, la tarjeta (indirecta), su sandbox y una prueba con Gemini CLI 0.65.0.
- Devin (Windsurf) tiene el guard, el aviso, el fin de turno, la tarjeta (indirecta) y los permisos, con los hooks de Devin CLI que comparte Devin Desktop.
- `specty new` dice cómo abrir cada herramienta reconocida en la carpeta del cambio.

### Desviaciones

- C10: Devin Desktop retiró Cascade en la 3.9.19. Con el visto bueno de la persona, el corte cubrió los hooks de Devin CLI (`.devin/hooks.v1.json`) en lugar de los de Cascade, así que R5 dejó de aplicar, y la fila pasó a llamarse «Devin (Windsurf)».
- El reconocimiento de la terminal de Antigravity CLI pasó de C9 a C10, para que C9 no pasara del tamaño L.
- Frente a R7, la tarjeta de Antigravity llega al empezar cada turno también sin un cambio activo; entonces dice cómo empezar uno.
- R6 no se hizo como se planeó: con una ruta de la máquina, el hook va a un archivo local excluido de git. Si la persona ya versiona ese archivo, la ruta queda en él, como con los demás agentes.
- La tarjeta de Gemini CLI va en cada turno (`BeforeAgent`), porque su `PreCompress` salta antes de cada llamada al modelo, compacte o no.
- C4 necesitó que la persona autorizara dos opciones de Codex, solo en repositorios desechables y con un modelo falso.

### Decisiones

- Lo que un camino indirecto deja para otro evento se guarda por conversación en `.git/specty/pending/`: la tarjeta, el aviso y el turno devuelto, con caducidad de un día.
- Las pruebas de extremo a extremo buscan la herramienta en una variable de entorno o en las carpetas del PATH, sin ejecutarla, y se saltan sin ella.

### Pendientes

- Cursor, Antigravity y Devin no se pueden probar con la herramienta de verdad, porque su modelo va por su servidor.
- Un cambio aparte arregla lo que quedó suelto:
  - `uninstall` no quita el hook de fin de turno;
  - Devin carga los hooks de Claude Code;
  - `hook agent-stop` no responde fuera de Specty;
  - `.agents/` cuenta como código en un proyecto nuevo.
