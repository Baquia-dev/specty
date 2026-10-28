---
kind: epic
---

# Fase 3: auditoría y ecosistema

## Objetivo

Completar la fase 3 del plan (ARCHITECTURE §18) con lo que aún falta: `why`, `audit`, los exportadores y los adaptadores con hooks ya están. Esta épica añade, en este orden:

- `retro --into`, para documentar como ampliación del cambio activo el código preparado fuera de su alcance;
- `specty ci` y una GitHub Action, la capa 4 de cumplimiento, que el agente no puede saltarse;
- un servidor MCP con los comandos del agente;
- el importador de OpenSpec y la migración desde el legacy;
- la suite de cumplimiento con agentes reales, que es el criterio de salida de la fase.

## Fuera de alcance

- Leer los comandos de la CI del proyecto en la detección (ARCHITECTURE §17 lo apunta a la fase 3): va en un cambio aparte.
- Importar de Spec Kit o de Kiro, y los cambios archivados o las specs vivas de OpenSpec.
- Comentarios en el pull request, como hacía `specty gate` del legacy.
- Actions para otras plataformas de CI (GitLab, Bitbucket, Azure): `specty ci` corre en cualquiera, pero la Action es solo de GitHub.
- El modo equipo, la revisión de PR, WebAuthn y las MCP Apps (fase 4).
- `next --wait`.
- Recursos y prompts en el servidor MCP: solo herramientas.
- Ejecutar la suite de cumplimiento en `pnpm check` o en la CI.

## Supuestos

- A1: `retro --into <id>` solo vale en `implementing`, con una tarea activa y con `<id>` como cambio activo de la carpeta, porque una ampliación es siempre de una tarea; en otra fase, la salida pide `specty retro`.
  - impacto: alto
- A2: La solicitud que crea `retro --into` nunca se aprueba sola, aunque `scope.autoApprove` cubra sus archivos, porque ese código no pasó por el guard; la decide la persona, o el agente en modo delegado, como cualquier otra ampliación.
  - impacto: alto
- A3: `specty ci` no puede comprobar los recibos, que viven en `.git` de cada clon, así que un trailer copiado a mano pasa la CI; la garantía con identidad llega con el modo equipo (fase 4), y la documentación lo dice.
- A4: `specty ci` revisa solo los commits del rango del evento (los del pull request o los del push) y no los de merge, que solo traen commits que se revisan uno a uno; los merges de la incorporación de Specty ya llevan `Specty-Change`.
- A5: La Action es una action compuesta en `action.yml`, en la raíz de este repositorio, que ejecuta `npx -y @baquia-dev/specty@<versión> ci` con la versión exacta; publicar la etiqueta que la nombra es parte del release, que hace la persona.
- A6: El servidor MCP habla JSON-RPC por stdio sin el SDK de MCP, como el del legacy, porque la CLI se empaqueta en un solo archivo y solo necesita `initialize`, `tools/list`, `tools/call` y `ping`.
  - impacto: medio
- A7: Cada herramienta MCP acepta un `folder` opcional con la carpeta del cambio, porque el servidor arranca en la carpeta del agente y no la sigue cuando la sesión cambia de worktree; sin él actúa en la carpeta del servidor, y la tarjeta de `specty_new` dice qué carpeta pasar.
  - impacto: alto
- A8: El servidor MCP no expone las acciones de la persona (aprobar, rechazar, aceptar, cerrar, cancelar, delegar) ni siquiera en modo delegado, en el que el agente sigue usando la CLI, para que el servidor no tenga que distinguir quién llama.
  - impacto: alto
- A9: Registrar el servidor MCP en los agentes es opcional (`specty init --mcp`), porque cada herramienta MCP ocupa contexto en cada turno y la CLI ya hace lo mismo; se registra solo en la configuración de proyecto de cada agente (ADR 0013), y donde un agente solo la admite en la carpeta del usuario, `doctor` dice cómo añadirlo.
  - impacto: alto
- A10: El importador lee el formato de OpenSpec 1.x: `proposal.md` con «Why» y «What Changes», `tasks.md` con casillas, `design.md` y `specs/<capacidad>/spec.md` con requisitos y escenarios WHEN/THEN; el motor builtin del legacy guarda sus cambios con el mismo formato.
- A11: Las tareas ya marcadas en `tasks.md` no se importan como tareas, porque su código ya existe: quedan en el Diseño como hechas antes de importar, y la sección Archivos la completa el agente.
  - impacto: medio
- A12: Un cambio importado es un cambio nuevo en borrador, con su worktree como el de `new`, y sigue el flujo completo: el agente completa la spec, la propone y la persona la aprueba.
- A13: La migración del legacy la hace `specty init`, porque reescribe `.specty/config.yaml`, que el agente no puede editar, y quita hooks y bloques de AGENTS.md; mueve los archivos del legacy a `.specty/legacy/` en vez de borrarlos, para poder recuperarlos e importar sus cambios activos.
  - impacto: alto
- A14: La suite de cumplimiento usa la sesión que la persona ya tiene en cada agente, y gasta su cuota, en repositorios temporales fuera del suyo; ningún agente corre con las opciones que saltan su sandbox o sus permisos.
  - impacto: alto
- A15: Hoy solo Claude Code tiene sesión en esta máquina; instalar y conectar los demás agentes es de la persona, así que la épica puede cerrar con la suite lista y el informe de los agentes que se pudieron ejecutar, y la fase 3 se marca como hecha solo cuando la suite es estable con al menos cuatro.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO hay código gobernado preparado fuera del alcance de la tarea activa y el agente ejecuta `specty retro --into <id> --reason "<motivo>"` ENTONCES Specty crea una solicitud de ampliación con esos archivos y el motivo, y no deja pasar el commit hasta que se apruebe.
- AC2: CUANDO se aprueba esa solicitud y lo preparado no cambió ENTONCES sus archivos entran en el alcance de la tarea, la auditoría registra `retro.confirmed` en el cambio activo y el commit que se repite pasa con `Specty-Change: <id>` y `Specty-Retro: true`; si lo preparado cambió, el commit sigue bloqueado y la salida pide repetir `retro --into`.
- AC3: CUANDO se ejecuta `specty retro --into <id>` sin código preparado fuera del alcance, con un id que no es el cambio activo de la carpeta o sin una tarea activa ENTONCES no crea nada y la salida da el paso válido.
- AC4: CUANDO `specty ci` revisa un rango con un commit que no es de merge, toca rutas gobernadas y no lleva `Specty-Change` ni `Specty-Init: true` ENTONCES sale con 1 y nombra el commit y sus archivos gobernados.
- AC5: CUANDO un commit de tarea del rango nombra un cambio que no existe, o su `Specty-Spec` no coincide con una aprobación válida de la spec de su cambio en ese commit ENTONCES `specty ci` sale con 1 y lo nombra.
- AC6: CUANDO el rango contiene un commit con `Specty-Kind: spike`, o la rama del pull request es de un spike, y el destino es la rama destino del repositorio ENTONCES `specty ci` sale con 1 y lo nombra.
- AC7: CUANDO todos los commits del rango son trazables ENTONCES `specty ci` sale con 0 y lo resume en una línea, y con `--json` da el resultado con la misma estructura que espera la CI.
- AC8: CUANDO un workflow usa la Action de Specty en un pull request o en un push ENTONCES ejecuta `specty ci` sobre los commits del evento con la versión exacta del CLI, y el job falla si falla `specty ci`.
- AC9: CUANDO la persona ejecuta `specty check --install` ENTONCES la plantilla de GitHub Actions ejecuta también `specty ci` en los pull requests.
- AC10: CUANDO un cliente MCP arranca `specty mcp` ENTONCES responde a la inicialización por stdio y lista como herramientas los comandos del agente (`specty_next`, `specty_new`, `specty_propose`, `specty_review`, `specty_check`, `specty_task_done`, `specty_scope_add`, `specty_adjust`, `specty_integrate` y `specty_retro`), cada una con el esquema de sus argumentos.
- AC11: CUANDO el agente llama a una herramienta del servidor MCP ENTONCES recibe la misma tarjeta que daría el comando de la CLI en esa carpeta, con el mismo bloqueo del cambio, y la respuesta se marca como error si el comando saldría con 1 o con 2.
- AC12: CUANDO un cliente pide la lista de herramientas del servidor MCP, en cualquier modo ENTONCES ninguna aprueba, rechaza, acepta, cierra o cancela un cambio, ni cambia el modo delegado.
- AC13: CUANDO la persona ejecuta `specty init --mcp` en un repositorio que usa un agente con configuración MCP de proyecto ENTONCES registra `specty mcp` en ella, `doctor` avisa si falta o apunta a otro comando, y `uninstall` lo quita.
- AC14: CUANDO se ejecuta `specty import <carpeta>` sobre un cambio de OpenSpec ENTONCES crea un cambio en borrador, como `new`, cuya spec trae el objetivo, un criterio por escenario (WHEN/THEN como CUANDO/ENTONCES), el diseño y las tareas pendientes; la petición literal dice de dónde viene, y la carpeta de origen no cambia.
- AC15: CUANDO la carpeta no es un cambio de OpenSpec o le falta `proposal.md` ENTONCES `specty import` no crea nada y dice qué falta; sin carpeta, lista los cambios importables de `openspec/changes/`.
- AC16: CUANDO `specty init` corre en un repositorio con una instalación del legacy ENTONCES traduce su configuración (idioma, rutas gobernadas y exentas, verificación) a la nueva, mueve sus archivos a `.specty/legacy/` y quita sus hooks de git y sus bloques de AGENTS.md, mostrando la diferencia de cada archivo y preguntando antes de cada paso; sus cambios activos aparecen en la lista de `specty import`.
- AC17: CUANDO se ejecuta `pnpm evals` ENTONCES cada agente instalado y con sesión (Claude Code, Codex, Gemini CLI, OpenCode y Cursor CLI) recorre en un repositorio desechable los escenarios «pide código sin spec», «la tarea necesita otro archivo», «el usuario dice apruébalo tú» y «ajuste fuera de alcance», y el informe da por agente y escenario las violaciones, los bloqueos y las rondas; un agente sin instalar o sin sesión aparece como omitido, con el motivo.
- AC18: CUANDO se ejecuta `pnpm check` ENTONCES no corre ningún agente ni modelo real, y la forma en que la suite juzga cada escenario se prueba con transcripciones grabadas.
- AC19: CUANDO se leen ARCHITECTURE §16 y §18 ENTONCES muestran el resultado de la suite con cada agente que se pudo ejecutar (versión, ejecuciones y tasas), y la fase 3 aparece como hecha solo si la suite fue estable con al menos cuatro agentes; si no, dice qué falta.
  - test: manual

## Diseño

- **`retro --into`.** Reutiliza las solicitudes de ampliación (`pending.scopeRequests`), con el hash de lo preparado en la solicitud. Al aprobarla, Specty emite un recibo `retro` del cambio activo para ese índice, y el hook `prepare-commit-msg` ya añade `Specty-Retro: true`.
- **`specty ci [--base <ref>] [--head-ref <rama>] [--json]`.** Por defecto, el rango empieza en el merge-base con la rama destino, como `check --changed`. Lee los trailers de cada commit con git y busca el cambio abierto o archivado en ese commit, como `why`. Sus textos van en `core/src/cards/`, y sale con 0 o 1 como `specty check`. La CI lo usa sin modelos ni red.
- **La Action** solo traduce el evento: `--base` sale de la base del pull request o del `before` del push, y `--head-ref`, de la rama del pull request. La plantilla de `check/ci.ts` añade un paso de `specty ci` en los pull requests.
- **`specty mcp`.** El servidor vive en la CLI (ARCHITECTURE §2). Cada herramienta llama a la misma función que su comando, con una sesión abierta en la carpeta indicada, y devuelve el texto de la tarjeta. Las acciones de la persona no tienen herramienta. El registro en cada agente va en su módulo de `agents/`, junto a lo que ya instalan, revisan y quitan `init`, `doctor` y `uninstall`.
- **El importador** es una función pura de `packages/exporters`, la inversa del exportador de OpenSpec, que da una `Spec` de core. `specty import` la escribe en un cambio nuevo creado como en `new`. La migración del legacy vive en `install/`, la usa `init` y pregunta por pasos, como `check --install`.
- **La suite de cumplimiento** está en `evals/`:
  - cada escenario prepara un repositorio temporal con `specty init`, le da al agente un encargo y juzga el resultado por el repositorio (commits, auditoría, archivos) y por la transcripción del agente;
  - cada agente tiene un adaptador con su línea de comando headless y la forma de leer su transcripción;
  - el informe va en Markdown y en JSON.

## Cortes

- C1: `retro --into` documenta lo preparado como ampliación del cambio activo
  - ac: AC1, AC2, AC3
- C2: `specty ci` rechaza los commits que no se pueden trazar
  - ac: AC4, AC5, AC6, AC7
- C3: La GitHub Action y la plantilla de CI ejecutan `specty ci`
  - ac: AC8, AC9
  - depends: C2
- C4: `specty mcp` expone los comandos del agente como herramientas
  - ac: AC10, AC11, AC12
- C5: `init --mcp` registra el servidor en los agentes, y `doctor` y `uninstall` lo conocen
  - ac: AC13
  - depends: C4
- C6: `specty import` trae un cambio de OpenSpec como borrador
  - ac: AC14, AC15
- C7: `init` migra una instalación del legacy
  - ac: AC16
  - depends: C6
- C8: La suite de cumplimiento con agentes reales
  - ac: AC17, AC18
- C9: Resultados de la suite y estado de la fase 3
  - ac: AC19
  - depends: C1, C2, C3, C4, C5, C6, C7, C8

## Riesgos

- R1: El primer pull request de un repositorio que adopta Specty con trabajo a medias trae commits sin trailers. Mitigación: `specty ci` solo revisa el rango del evento y nunca todo el historial, y su salida dice cómo documentarlos con `specty retro`.
- R2: Un squash merge quita los trailers de los commits de tarea. Mitigación: la plantilla ejecuta `specty ci` en los pull requests, donde los commits aún están; en un push, `specty ci` acepta un commit cuyo mensaje lleva `Specty-Change`, como el squash que usa la descripción del PR (ARCHITECTURE §9).
- R3: El protocolo MCP cambia de versión. Mitigación: el servidor responde con la versión que pide el cliente si la conoce, o con la más reciente que conoce, y una prueba hace de cliente con mensajes reales del protocolo.
- R4: Las ejecuciones con modelos reales no son deterministas y cuestan. Mitigación: cada escenario se repite un número fijo de veces con un límite de turnos, el informe da tasas y no un aprobado único, y la suite solo corre a mano.
- R5: La migración del legacy toca archivos de la persona (hooks, AGENTS.md, configuración). Mitigación: muestra la diferencia, pregunta por cada paso, mueve en vez de borrar y no toca lo que no reconoce.
- R6: Una propuesta de OpenSpec escrita a mano no sigue la plantilla. Mitigación: lo que el importador no reconoce va tal cual al Diseño, y `propose` valida la spec antes de que la persona la vea.

## Cierre

### Resumen

Toda la fase 3 del plan está construida, en nueve cortes cerrados en main:

- `retro --into` documenta como ampliación del cambio activo lo preparado fuera de su alcance (C1).
- `specty ci` rechaza los commits que no se pueden trazar, con las verificaciones `traced`, `task-approval` y `no-spike` (C2). Lo ejecutan la GitHub Action de `action.yml`, la plantilla de `check --install` y la CI de Specty, y en GitHub Actions lee el evento (C3).
- `specty mcp` ofrece los comandos del agente como herramientas MCP por stdio (C4), y `init --mcp` lo registra en cada agente con configuración MCP de proyecto, con `doctor` y `uninstall` (C5).
- `specty import` trae un cambio de OpenSpec como borrador (C6), e `init` migra una instalación del legacy a `.specty/legacy/` (C7).
- La suite de cumplimiento (`evals/`, `pnpm evals`) pone a agentes reales ante cuatro escenarios (C8). Con Claude Code cumplió en las cinco ejecuciones, sin violaciones (C9).

### Desviaciones

- Tres cortes se rehicieron en un cambio nuevo, con la misma implementación:
  - C5: un test aprobado de `uninstall` no elegía «sí».
  - C6: un campo `then` rompía la regla `noThenProperty` de Biome en tests aprobados.
  - C8: su verificación no podía fallar antes de que existiera el paquete.

  En C5 y C6, desbloquear un test aprobado es solo de la persona.
- Un cambio fuera de la épica arregló la matriz de aceptación, que no contaba los tests enviados en la fase de tests (`Specty-Tests: true`).
- El modo automático de Claude Code denegó lanzar un agente real hasta que el usuario lo autorizó en el chat.

### Decisiones

- AC19 se cumple a medias: §16 y §18 muestran los resultados y que la fase 3 sigue abierta. Su criterio de salida, una suite estable con al menos cuatro agentes, no se pudo medir: en esta máquina solo Claude Code tiene sesión.

### Pendientes

- Ejecutar `pnpm evals` con Codex, Gemini CLI, OpenCode y Cursor CLI, y repetir los escenarios, para cerrar la fase 3.
- Publicar la Action con una etiqueta `v<versión>` en el próximo release.
- Leer los comandos de la CI del proyecto en la detección (ARCHITECTURE §17).
- Dividir `packages/core/src/cards/index.ts` y `cards/doctor.ts`, que están sobre el aviso de `max-lines`.
