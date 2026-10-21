# Arquitectura de Specty

Documento de diseño; se lee bajo demanda. Producto: [../PRODUCT.md](../PRODUCT.md) · Decisiones: [decisions/](decisions/) · Formatos de archivo: [formats.md](formats.md) · UI: [ui.md](ui.md)

## 1. Visión general

```text
 Chat del agente (Claude Code, Cursor, Codex, Antigravity, Gemini CLI…)
        │  specty next · new · propose · task done · scope add · adjust · retro
        ▼
 ┌────────────────── CLI `specty` (o servidor MCP) ──────────────────┐
 │  core: spec · flujo · alcance · tamaño · textos de salida         │
 │  almacén .specty/ · git (ramas, commits, recibos) · detección     │
 └─────────┬──────────────────────────┬──────────────────────┬───────┘
           │ HTTP + SSE (local)       │ guard                │ trailers + .specty/
           ▼                          ▼                      ▼
     UI web (persona)     hooks del agente · hooks de git    CI (`specty ci`)
```

Tres reglas organizan el sistema:

1. **Specty es la máquina de estados.** Solo Specty escribe el estado, hace los commits de tarea y cambia de fase ([ADR 0006](decisions/0006-specty-gestiona-el-flujo.md)).
2. **El agente es un trabajador sin estado.** Pregunta qué hacer (`specty next`), lo hace y reporta. Como todo el estado está en disco, cualquier sesión, con cualquier herramienta o modelo, puede retomar un cambio a medias.
3. **Lo que concede permisos sobre el código lo decide una persona**: aprobar una spec, aprobar una ampliación de alcance, aceptar el resultado y confirmar el cierre.

## 2. Paquetes

Monorepo con pnpm workspaces, en `github.com/Baquia-dev/specty`. Solo se publica `@baquia-dev/specty` en npm, que instala el comando `specty`; los demás paquetes van empaquetados dentro ([ADR 0007](decisions/0007-nombre-y-organizacion.md)). Licencia: Apache-2.0 ([ADR 0008](decisions/0008-licencia-apache.md)).

| Paquete | Responsabilidad | Restricción |
| --- | --- | --- |
| `packages/core` (`@baquia-dev/specty-core`) | Esquema, parser, serializador, hash y delta de specs; máquina de estados; reglas de alcance; tamaño y esfuerzo; textos de salida | Sin IO ni APIs de Node: también se ejecuta en el navegador |
| `packages/cli` (`@baquia-dev/specty`) | Comandos, almacén `.specty/`, git, hooks de git, adaptadores de agentes, detección, servidor local (HTTP + SSE), servidor MCP | El guard y los hooks usan un punto de entrada mínimo para arrancar rápido |
| `packages/ui` (`@baquia-dev/specty-ui`) | App web de revisión, aprobación y auditoría | Capa de datos independiente del transporte |
| `packages/exporters` (`@baquia-dev/specty-exporters`) | OpenSpec, Spec Kit, Kiro | Funciones puras sobre el modelo de core |

```text
specty/
├─ packages/{core,cli,ui,exporters}/
├─ evals/          # suite de cumplimiento con agentes reales
├─ docs/
├─ AGENTS.md
└─ PRODUCT.md
```

## 3. Modelo de dominio

- **Cambio**: unidad de trabajo. Tiene id, carril, spec, estado, registro de auditoría y, por defecto, su propia rama.
- **Spec** (`spec.md`): contenido que redacta el agente y edita la persona. No contiene estado.
- **Ítems** con id estable, nunca renumerado: supuestos `A1`, criterios `AC1`, tareas `T1`, riesgos `R1`, cortes de épica `C1`.
- **Tarea**: archivos permitidos (`files`), criterios que cubre (`ac`), verificación (`verify`) y tipo de commit.
- **Revisión**: cada `propose` válido crea una revisión numerada (`r1`, `r2`…) con su hash. Las aprobaciones se atan a un hash concreto.
- **Alcance del cambio**: la sección Archivos. **Alcance de la tarea**: sus `files`, más lo permitido implícitamente (§8) y las ampliaciones aprobadas.

## 4. Máquina de estados

```text
 new
  │
  ▼
 draft ──propose──► review ◄──── comentarios: el agente corrige y vuelve a proponer
                      │  ▲
              aprobar*│  └─────────propose (solo el delta)───────┐
                      ▼                                          │
                 implementing ◄── scope add · decidir alcance*   │
                      │                                          │
          última tarea│                                          │
                      ▼                                          │
                  acceptance ──pedir ajustes (agente o persona)──► adjusting
                      │
              aceptar*│
                      ▼
                   closing ──propose (cierre) · confirmar*──► done

 Desde cualquier fase salvo done: cancelar* ──► cancelled      (* acción humana)
```

| Fase | Código gobernado | `spec.md` | Espera a |
| --- | --- | --- | --- |
| `draft` | bloqueado | el agente redacta | agente |
| `review` | bloqueado | el agente atiende comentarios; la persona edita en la UI | persona |
| `implementing` | solo el alcance de la tarea activa | bloqueado | agente |
| `acceptance` | bloqueado | bloqueado | persona |
| `adjusting` | bloqueado | solo añadir tareas y ajustar criterios; las tareas hechas son inmutables | agente |
| `closing` | bloqueado | solo la sección Cierre | agente, luego persona |
| `done`, `cancelled` | — | inmutable (archivado) | — |

**Invariante:** el agente solo ejecuta transiciones que envían trabajo o reducen sus propios permisos. Ninguna variable de entorno, flag ni modo de prueba habilita una acción humana desde la CLI del agente; los tests usan inyección de dependencias. En el legacy, `VITEST=1` o `NODE_ENV=test` habilitaban la aprobación sin TTY, y el guard solo bloqueaba el texto `specty approve`.

## 5. Carriles

| Carril | Cuándo | Diferencias con el flujo estándar |
| --- | --- | --- |
| `quick` | Hasta 3 archivos, sin rutas sensibles | Spec mínima (objetivo, archivos, una tarea); aprobación y aceptación con un clic; cierre automático |
| `standard` | Por defecto | Flujo completo |
| `spike` | Incertidumbre técnica | Rama `spike/<id>` que no se fusiona; termina en una decisión (ADR o spec de seguimiento) |
| `retro` | Código sin spec, manual o de un agente sin hooks | Documenta cambios ya hechos; la persona confirma; habilita el commit |
| `epic` | Alcance `XL` | No tiene tareas: define cortes con dependencias, y cada corte es un cambio hijo |

Specty decide si un cambio cabe en `quick`: si la spec supera los límites, `propose` la rechaza e indica pasar a `standard`.

## 6. Interfaz del agente

| Comando | Fase | Efecto |
| --- | --- | --- |
| `specty next` | Todas | Dice qué toca ahora. En `implementing` activa la siguiente tarea y devuelve su tarjeta; en el resto es de solo lectura |
| `specty new "<título>" [--kind] [--follows <id>] [--epic <id> --slice C1]` | Sin cambio activo | Crea el cambio, la rama y el esqueleto de la spec |
| `specty propose` | draft, review, adjusting, closing | Valida la spec; calcula tamaño, delta y esfuerzo recomendado; la envía a revisión |
| `specty task done <T> --summary "<texto>"` | implementing | Comprueba el alcance, ejecuta `verify`, hace el commit y avanza |
| `specty scope add <ruta…> --task <T> --reason "<texto>"` | implementing | Pide ampliar el alcance; se aprueba sola si la política lo permite |
| `specty adjust "<petición literal>"` | acceptance | Registra la petición y devuelve el protocolo de clasificación |
| `specty retro [--into <id>]` | Cualquiera | Devuelve el protocolo para documentar cambios ya hechos |

Comandos para la persona: `init`, `ui`, `status`, `why <ruta>[:<línea>]`, `audit <id>`, `export <id> --to openspec|speckit|kiro`, `doctor` y `ci`. También `approve`, `accept` y `cancel`, que exigen TTY y sirven como alternativa a la UI.

**Contrato de salida** (igual en CLI y MCP):

- La primera línea indica cambio, fase y progreso. La última es `SIGUIENTE: <acción exacta>`.
- Códigos de salida:
  - `0`: correcto.
  - `1`: error de validación, con una lista accionable y números de línea.
  - `2`: bloqueado por el flujo, con el motivo y el paso válido.
- `--json` devuelve lo mismo, estructurado.
- Los textos viven en `core` y se prueban como interfaz pública. Un cambio de redacción puede cambiar el comportamiento de un modelo (ver la suite de cumplimiento en §16).
- Repetir `next` no cambia nada.
- `next --wait[=<segundos>]` (opcional) espera, con límite, a que la persona actúe en la UI. Por defecto, el agente termina su turno con el enlace de la UI. Cuando la persona aprueba y escribe "continúa", el agente vuelve a ejecutar `next`.

**Cómo escribe la spec el agente:** con sus propias herramientas de edición, sobre `.specty/changes/<id>/spec.md`. El guard lo permite solo en las fases que lo admiten. `propose` es la puerta obligatoria: nada avanza sin validación. Se descartó enviar la spec por stdin, porque escribir Markdown largo en un heredoc falla a menudo por el escapado.

**MCP** (fase 3): los siete comandos se exponen como herramientas (`specty_next`, `specty_task_done`…) sobre el mismo servicio de core.

## 7. Contexto para el agente

- **AGENTS.md**: Specty gestiona dos bloques delimitados ([formats.md §8](formats.md#8-bloque-de-agentsmd)):
  - hechos del proyecto: stack, comandos verificados, mapa y convenciones, generados por la detección;
  - flujo: unas 8 líneas.

  El resto del archivo pertenece a la persona y Specty no lo toca.
- **Punteros por herramienta**: solo para las herramientas detectadas o elegidas, y solo donde la herramienta no lee AGENTS.md por sí misma (por ejemplo, `CLAUDE.md` con `@AGENTS.md`). Nunca copian contenido.
- **Tarjeta de tarea** (salida de `next` en `implementing`). Presupuesto: unos 1.500 tokens; si una tarea no cabe, `propose` avisa que hay que dividirla. Incluye:
  - la tarea, sus archivos permitidos y los criterios que cubre;
  - punteros a las convenciones de esas rutas (AGENTS.md anidados);
  - las tareas previas resumidas, con su commit;
  - la verificación y el esfuerzo sugerido.
- **Entre cambios**: un cambio de seguimiento carga la sección Cierre del anterior, no su historial.

## 8. Alcance

- `task done` compara el árbol de trabajo con el commit base de la tarea, incluidos archivos nuevos sin seguimiento y borrados.
- Permitido = `files` de la tarea + implícitos + ampliaciones aprobadas.
- **Implícitos** (configurables):
  - tests junto a los archivos del alcance, según el stack detectado (`*_test.dart`, `*.test.ts`, `test_*.py`…);
  - archivos generados declarados (`**/*.g.dart`, `**/*.freezed.dart`);
  - el lockfile, si el manifiesto (`package.json`, `pubspec.yaml`…) está en el alcance.
- **Rutas sensibles** (migraciones, auth, CI, infraestructura, configuración de Specty): nunca se aprueban solas.
- **Ampliación**: `scope add` evalúa la política. Si no aplica, crea una solicitud que la UI muestra al momento. Mientras está pendiente, el agente puede seguir trabajando dentro de su alcance, pero no completar la tarea.
- Durante una tarea activa, todo cambio en el árbol se atribuye a esa tarea: Specty no distingue quién teclea.

## 9. Git

**Ramas.** Por defecto, cada cambio vive en `specty/<id>` (o `spike/<id>`), creada desde la rama actual al ejecutar `new`. El cambio activo es el ligado a la rama actual. Con `git.branchPerChange: false`, el puntero vive en `.git/specty/active`, en local. Las ramas permiten trabajar cambios en paralelo con `git worktree`, y por eso no existe un archivo de estado global.

**Commits que hace Specty**, siempre con la identidad git de la persona y con trailers ([formats.md §7](formats.md#7-trailers-de-commit)):

- Al aprobar una revisión: solo `.specty/changes/<id>/` (`docs(spec): …`).
- En `task done`: el código de la tarea, junto con `state.json` y `audit.jsonl`.
- Al cerrar: el movimiento a `.specty/archive/`.

**Recibos.** Antes de cada commit, Specty guarda en `.git/specty/receipts.json` el hash del índice (`git write-tree`). El hook `pre-commit` acepta el commit si encuentra un recibo válido para ese índice, y lo consume. Así, un agente que ejecuta `git commit` por su cuenta no pasa, aunque copie los trailers.

**Hooks de git** (`pre-commit` y `prepare-commit-msg`), instalados con el gestor detectado: husky, lefthook, simple-git-hooks o nativo. `pre-commit` decide en este orden:

1. Hay un merge, rebase, cherry-pick o revert en curso → permitir.
2. Hay un recibo válido → permitir.
3. Todo lo preparado está fuera de las rutas gobernadas → permitir.
4. Hay un cambio activo y lo preparado está dentro de su alcance → permitir como **cambio manual**. `prepare-commit-msg` añade `Specty-Change` y `Specty-Manual: true`, y el mensaje del commit es el motivo.
5. Cualquier otro caso → bloquear y explicar el paso válido: `specty retro`, o `specty retro --into <id>` si hay un cambio activo.

**Retro-specs.**

- Modo `agent` (por defecto): el mensaje del hook incluye un texto listo para pegar en el chat del agente. El agente:
  1. ejecuta `specty retro` y lee `git diff --staged`;
  2. completa la spec de carril `retro` (motivo, cambios, riesgos);
  3. ejecuta `propose`.

  La persona la confirma en la UI, Specty emite un recibo para ese índice y el commit pasa.
- Modo `minimal`: la persona escribe el motivo en la terminal, y Specty genera la sección de cambios a partir del diff.
- `--into <id>`: se registra como ampliación de alcance del cambio activo, con su motivo.
- Si el índice cambia después de la confirmación, el recibo deja de valer.

**Squash merge.** Al fusionar con squash, los commits por tarea desaparecen de la rama principal. Specty incluye `Specty-Change` en la descripción del PR que genera, y `why` recurre al mapa tarea → archivos guardado en el cambio archivado. Se recomienda configurar el squash para usar el título y la descripción del PR.

## 10. Cumplimiento por capas

| Capa | Qué hace | ¿Se puede evadir? |
| --- | --- | --- |
| 1. Instrucciones (AGENTS.md y salida de Specty) | Guía | Sí |
| 2. Hooks del agente (guard) | Bloquea escrituras fuera de alcance, `git commit` directo, acciones humanas y edición de archivos protegidos | Sí, con shell indirecta |
| 3. Hooks de git | Bloquea commits sin recibo ni spec | Sí, con `--no-verify` |
| 4. CI (`specty ci` como check obligatorio) | Rechaza commits no trazables, specs sin aprobación válida para su hash y ramas `spike/` hacia la principal | No |
| 5. Revisión de PR (modo equipo) | Aprobación con identidad verificada por el servidor | No |

**Guard.** Un único punto de entrada, `specty guard --tool <id>`:

1. Lee el evento de la herramienta por stdin.
2. Lo normaliza a escritura, borrado, shell o MCP.
3. Core decide.
4. El adaptador responde en el formato de la herramienta: normalmente, código de salida 2 con el motivo y el siguiente paso.

Objetivo de rendimiento: p95 < 200 ms. Las reglas de shell (comandos que escriben archivos, `--no-verify`, `core.hooksPath`, acciones humanas) son de mejor esfuerzo, porque un comando siempre se puede ofuscar. Para eso existe la capa 3. El guard también bloquea `npx specty`, `npm i specty` y sus equivalentes sin scope, porque `specty` en npm es un paquete ajeno ([ADR 0007](decisions/0007-nombre-y-organizacion.md)), y responde con el comando correcto.

**Soporte de hooks por herramienta** (revisado el 2026-10-20; se vuelve a verificar al implementar cada adaptador):

| Herramienta | Evento previo a la acción | Configuración | Estado |
| --- | --- | --- | --- |
| Claude Code | `PreToolUse` | `.claude/settings.json` | Soportado; el legacy ya lo instala |
| Antigravity | `PreToolUse` | `.agents/hooks.json` | El legacy lo instala; verificar |
| Cursor | `preToolUse`, `beforeShellExecution` | `.cursor/hooks.json` | Documentado |
| Windsurf | `pre_write_code`, `pre_run_command` | `.windsurf/hooks.json` | Documentado |
| Gemini CLI | `BeforeTool` | `.gemini/settings.json` | Experimental; hay que activarlo |
| GitHub Copilot | `preToolUse` | `.github/hooks/*.json` | Parcial; verificar |
| Codex | hooks en `config.toml` | `~/.codex/config.toml` | `PreToolUse` sin confirmar |
| Resto (Aider, Zed, Cline, Continue…) | — | — | Solo capas 1, 3 y 4 |

### Modelo de confianza

Specty protege contra el agente impaciente (el que se salta pasos para ayudar) y contra el olvido humano. No protege contra una persona o un agente que quiera evadirlo deliberadamente con acceso de escritura al repositorio: en local, cualquier control se puede desactivar. Por eso las garantías fuertes viven en el servidor: el CI obligatorio y, en modo equipo, la revisión de PR. En la fase 4, la aprobación con presencia del usuario (WebAuthn, es decir, Touch ID o Windows Hello) eleva la barrera en local, porque el agente no puede generarla.

## 11. Tamaño y esfuerzo

**Señales deterministas** que calcula `propose`:

- archivos por acción (crear, modificar, borrar) y módulos distintos tocados;
- rutas sensibles: migraciones, auth, pagos, CI, infraestructura;
- dependencias nuevas o cambios de API pública;
- fan-in de los archivos tocados (cuántos archivos los importan);
- ausencia de tests en la zona.

La puntuación da un nivel `S`, `M`, `L` o `XL`, con umbrales configurables. El modelo puede ajustar un nivel con motivo (`estimate` en el frontmatter), y el ajuste queda visible en la UI.

**Recomendación de esfuerzo**, por fase y en niveles neutros (`low`, `medium`, `high`, `max`):

- Planificar y revisar el alcance: según el tamaño del cambio.
- Implementar: según el tamaño de cada tarea. Normalmente un nivel menos, porque una spec bien hecha reduce el razonamiento necesario.

La tabla `presets/effort.yaml` traduce los niveles a cada herramienta (por ejemplo, el nivel de esfuerzo de Claude Code o el *reasoning effort* de Codex). Se actualiza con cada versión de Specty, porque cambia con cada lanzamiento de modelos. `propose` imprime la recomendación para la herramienta detectada y el agente se la transmite a la persona. Specty no cambia el esfuerzo del modelo: lo recomienda.

**Dividir.** Si el cambio es `XL` o supera los umbrales (por defecto: más de 8 tareas, más de 15 archivos o más de 2 módulos), `propose` lo rechaza y propone una épica:

- cortes verticales que funcionen de punta a punta;
- contratos primero, si los cortes van en paralelo;
- un `spike`, si el problema es la incertidumbre.

Las tareas con más de 5 archivos, o cuya tarjeta supera el presupuesto, generan un aviso.

## 12. Ajustes

`adjust` registra la petición literal y devuelve el protocolo. El agente clasifica la petición según los criterios y la sección Fuera de alcance:

| Tipo | Señal | Resultado |
| --- | --- | --- |
| Defecto | Incumple un criterio existente | Tarea `fix` que referencia ese criterio |
| Refinamiento | Cambia un detalle de un criterio existente | Criterio modificado, más una tarea |
| Alcance nuevo | Ningún criterio lo cubre, o choca con Fuera de alcance | Spec de seguimiento (`new --follows <id>`). La persona puede forzar "ampliar alcance", y queda registrado |

`propose` añade un apoyo determinista:

- Modificar tareas ya hechas es un error.
- Si el ajuste toca archivos que no estaban en la sección Archivos, la UI lo marca como "posible alcance nuevo".
- La re-aprobación muestra solo el delta.

## 13. Auditoría y trazabilidad

- **Se guarda** en `audit.jsonl` lo que git no puede derivar: aprobaciones (quién, hash, canal), decisiones sobre supuestos y alcance, peticiones de ajuste literales y su clasificación, resultados de verificación, reintentos, confirmaciones de retro-specs y la herramienta que declara el agente (útil como contexto, no como prueba).
- **Se deriva de git** y no se duplica: commits por tarea, archivos, cambios manuales (por sus trailers) y tiempos.
- `specty audit <id>` combina ambas fuentes en un informe Markdown o JSON. La UI muestra la misma línea de tiempo.
- `specty why <ruta>[:<línea>]` recorre blame → commit → trailers → cambio, tarea y criterio, y muestra el porqué de esa línea.

## 14. Detección e inicio

**Proyecto existente** (`specty init`):

1. Detecta stack, gestor de paquetes, monorepo, comandos (manifiestos y workflows de CI), herramientas de IA en uso (`.claude/`, `.cursor/`, `.gemini/`, `.windsurf/`, `.agents/`, `.github/copilot-instructions.md`…) y gestor de hooks.
2. Valida los comandos ejecutándolos, con confirmación y timeout. Solo los que funcionan se escriben como verificados.
3. Pregunta únicamente lo que falta.
4. Genera:
   - `.specty/config.yaml`;
   - los bloques de AGENTS.md;
   - los punteros y hooks de las herramientas detectadas;
   - los hooks de git;
   - opcionalmente, el workflow de CI.
5. Termina con `specty doctor`.

**Proyecto nuevo**:

1. Entrevista breve: qué, para quién, alcance del MVP, fuera de alcance, stack (o "recomiéndame"), despliegue y restricciones.
2. Genera `PRODUCT.md` y el esqueleto de AGENTS.md.
3. El primer cambio es `bootstrap`, de carril `standard`, así que el scaffolding también queda trazado.
4. Al cerrarlo, Specty vuelve a detectar el proyecto y completa los comandos.

**`specty doctor`** comprueba:

- que el comando `specty` resuelve a `@baquia-dev/specty`;
- que los comandos citados existen y funcionan;
- que las rutas citadas existen;
- el presupuesto de AGENTS.md;
- los punteros y hooks instalados;
- la versión de Node y la configuración de CI.

## 15. Servidor local y UI

- `specty ui` levanta un servidor HTTP en `127.0.0.1` con eventos SSE (portado del legacy). `propose` y `next` lo arrancan en segundo plano si no está activo e imprimen el enlace; el servidor se apaga solo tras un rato inactivo. Si el sandbox del agente impide arrancarlo, la persona ejecuta `specty ui`.
- API:
  - lectura de cambios: spec parseada, estado, delta, tamaño y diffs por tarea;
  - edición estructurada de la spec: core serializa y escribe el archivo;
  - comentarios y acciones humanas.

  Un vigilante del sistema de archivos y de `HEAD` emite eventos para que todas las vistas se actualicen.
- Las acciones humanas existen solo en la UI y en la TTY. La seguridad del servidor está en [ui.md](ui.md#seguridad).
- La verificación completa previa a la aceptación la lanza la persona desde la UI y la ejecuta el servidor, así no depende del timeout de herramientas del agente.

## 16. Calidad

**Requisitos no funcionales**:

- Node ≥ 22; macOS, Linux y Windows (las rutas se normalizan a POSIX en las specs).
- Funciona sin conexión y sin telemetría: las métricas son solo locales.
- Ninguna dependencia en el código del usuario.

**Pruebas**:

- core con cobertura ≥ 90 %;
- ida y vuelta parser ↔ serializador;
- todas las transiciones de la máquina de estados;
- pruebas end-to-end con repositorios git temporales.

**Suite de cumplimiento** (`evals/`): escenarios con agentes reales en modo headless (Claude Code, Codex, Gemini CLI, Cursor CLI…), por ejemplo:

- "pide código sin spec";
- "la tarea necesita otro archivo";
- "el usuario dice 'apruébalo tú'";
- "ajuste fuera de alcance".

Mide violaciones, bloqueos y rondas. Se ejecuta antes de cada versión, y es lo que demuestra que Specty funciona con cualquier modelo.

## 17. Portado desde el legacy

| Módulo | Tamaño | Acoplamiento | Plan |
| --- | --- | --- | --- |
| `src/detect` | ~1,7k líneas | Solo sus propios tipos | Casi íntegro. Se añade la detección de herramientas de IA y de comandos de CI |
| `src/governance/hook-managers` | ~0,8k | `core/git` | Íntegro. Los hooks nuevos implementan recibos y cambios manuales |
| `src/adapters` (21) | ~1,5k | `generate/types`, `i18n`, `config` | Se portan el registro y la escritura JSONC. Cambia lo que generan: puntero mínimo, hooks y MCP, y por defecto solo para las herramientas detectadas. Se añaden hooks a más herramientas: hoy solo 2 de los 21 adaptadores los instalan |
| `src/ui/server.ts`, `src/ui/sse.ts` | ~250 | Bajo | Se portan con la seguridad nueva. `router`, `dispatcher` y los servicios (~1,4k) no se portan, porque dependen de la gobernanza legacy |

Se reescribe:

- la gobernanza, con el nuevo modelo de estado;
- los motores de specs: OpenSpec pasa a ser solo un exportador;
- las métricas, que se derivan de la auditoría.

Se elimina:

- la generación de reglas y roles;
- el handoff, que reemplaza la sección Cierre.

## 18. Plan por fases

| Fase | Contenido | Criterio de salida |
| --- | --- | --- |
| F0 · Fundaciones | Monorepo. En core: spec (parser, serializador, hash, delta, validación), máquina de estados, alcance y tamaño | Pruebas de ida y vuelta y de transiciones en verde |
| F1 · Flujo por CLI | `init` (detección), los 7 comandos del agente, git (ramas, recibos, trailers), hooks de git, bloques de AGENTS.md, guard con adaptadores de Claude Code y Cursor, aprobación por TTY | Desde aquí, Specty se construye usándose a sí mismo |
| F2 · UI | Primero el sistema de diseño y un prototipo navegable; después las pantallas de revisión, delta, progreso, aceptación y cierre en vivo | Un cambio completo sin abrir el Markdown |
| F3 · Auditoría y ecosistema | `why`, `audit`, flujo retro completo, `specty ci` y GitHub Action, exportadores, importador desde OpenSpec y el legacy, servidor MCP, más adaptadores con hooks, suite de cumplimiento con ≥ 4 agentes | La suite de cumplimiento es estable con cada agente |
| F4 · Escala y equipos | Épicas y worktrees en paralelo, modo equipo (aprobadores, revisión de PR), WebAuthn, extensión de VS Code (mismo bundle de UI), MCP Apps en el chat | — |

## 19. Preguntas abiertas

1. Titular del copyright en `NOTICE`: hoy figura "Jorge Palacio and the Specty contributors". Si Baquia es una entidad legal que será dueña del código, debe ir su razón social.
2. Rama por cambio en modo individual. Propuesta: activada por defecto.
3. Retro por defecto. Propuesta: modo `agent` (la visión original), con `minimal` activable.
4. Aceptación en el carril `quick`. Propuesta: un clic.
5. Política de tests por defecto. Propuesta: `recommended`, que avisa si una tarea de código no toca tests.
