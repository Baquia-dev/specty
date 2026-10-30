# Formatos de archivo

Referencia para implementar `@baquia-dev/specty-core` y la CLI. Los nombres de campo van en inglés; los textos visibles, en el idioma del proyecto.

## 1. Estructura

```text
.specty/
├─ config.yaml                 # configuración del proyecto (archivo protegido)
├─ templates/                  # opcional: plantillas propias por carril e idioma
├─ changes/<id>/
│  ├─ spec.md                  # contenido: lo redacta el agente y lo edita la persona
│  ├─ state.json               # estado: solo lo escribe Specty
│  ├─ audit.jsonl              # eventos que git no puede derivar (solo se añaden líneas)
│  ├─ comments.json            # hilos de revisión de la UI
│  ├─ revisions/r1.md, r2.md…  # instantánea de cada revisión propuesta
│  └─ reviews/spec-r1.md, diff-1.md…  # respuestas de la revisión independiente (ADR 0011), protegidas
├─ archive/<año>/<id>/         # cambios cerrados o cancelados, misma estructura
└─ legacy/                     # lo que tenía `.specty/` con el legacy, movido por `init` (ARCHITECTURE §14); sus cambios se importan con `specty import`

.git/specty/                   # local, por worktree, nunca versionado
├─ receipts.json               # recibos de commit
├─ active                      # cambio activo cuando no hay rama por cambio
├─ shell/<tool_use_id>.json    # foto del árbol antes de cada comando de Bash del agente
├─ pending/<conversación>.card # tarjeta que una compactación dejó para el siguiente comando (Cursor); se entrega una vez y caduca en un día
├─ pending/<conversación>.warning # aviso tras un comando que la herramienta no deja dar en el momento (Antigravity); va en la siguiente llamada al modelo, una vez, y caduca en un día
├─ pending/<conversación>.stop # turno que el fin de turno devolvió al trabajo, para una herramienta que no lo marca (Antigravity): su siguiente fin de turno termina; caduca en un día
└─ server.json                 # puerto y token de la UI en ejecución

.git/common/specty/            # local, compartido por todas las worktrees, nunca versionado
├─ delegated.json              # modo delegado activo (ADR 0010): { "by", "at" }, quién lo activó y cuándo
├─ sessions/<conversación>.json # { "folder", "at" }: la worktree en la que trabaja una conversación de agente, desde que entró con `EnterWorktree` (Claude Code) o `specty enter` (las demás); el guard la escribe y la lee
├─ activity/<agente>-<conversación>.json # { "tool", "folder", "first", "last" }: la carpeta del último paso de una conversación de agente, su primer paso y el último (ADR 0016); el guard la reescribe si cambia de carpeta o si pasó un minuto, y `status` la lee para decir quién lleva cada cambio
├─ locks/<id>.json             # { "pid", "command", "folder", "at" }: el comando que está cambiando ese cambio, uno a la vez (ARCHITECTURE §9); se crea en exclusiva y se borra al terminar, y el de un proceso que ya no existe no cuenta; para reemplazarlo, un comando toma antes `locks/<id>.json.claim`, un permiso exclusivo y breve
└─ backups/<fecha>/            # lo que había antes de que `init` o `uninstall` lo cambiaran (una carpeta por ejecución)
   ├─ repo/<ruta>              # copia de un archivo del repositorio
   ├─ outside/<ruta absoluta>  # copia de uno de fuera (Codex, OpenCode, .git/info/exclude de una worktree)
   └─ manifest.json            # [{ "path", "created", "removed"?, "copy"? }]: cada archivo creado, cambiado o borrado
```

**El servidor MCP en cada agente** (`specty init --mcp`, ARCHITECTURE §6). La entrada se llama `specty`, ejecuta `specty mcp` y se escribe solo con `specty` en el PATH, en la configuración MCP de proyecto de cada agente que el repositorio usa. Lo demás del archivo no cambia:

| Agente | Archivo | Entrada |
| --- | --- | --- |
| Claude Code | `.mcp.json` | `"mcpServers": { "specty": { "command": "specty", "args": ["mcp"] } }` |
| Cursor | `.cursor/mcp.json` | la misma |
| Gemini CLI | `.gemini/settings.json` | la misma |
| Devin (Windsurf) | `.devin/config.json` | la misma |
| OpenCode | `opencode.json` | `"mcp": { "specty": { "type": "local", "command": ["specty", "mcp"], "enabled": true } }` |
| Codex | `.codex/config.toml` | la tabla `[mcp_servers.specty]` con `command = "specty"` y `args = ["mcp"]`; Codex la lee en un proyecto de confianza |

Antigravity solo lee los servidores MCP de la carpeta del usuario, donde Specty no escribe: `init` y `doctor` dicen cómo añadirlo. `uninstall` quita la entrada de todos esos archivos y borra el que se queda vacío.

### Identificadores

- Cambio: `AAAAMMDD-slug`, por ejemplo `20261020-evolucion-academica`.
- Ítems: `A` supuestos, `AC` criterios, `T` tareas, `R` riesgos, `C` cortes de épica. El número lo asigna quien redacta y Specty lo valida. Un id ya propuesto nunca se renumera ni se reutiliza, porque commits, comentarios y auditoría lo referencian.

## 2. `spec.md`

### Frontmatter

```yaml
---
kind: standard                        # quick | standard | spike | retro | epic
epic: 20261015-dashboard-estudiante   # opcional: épica a la que pertenece
slice: C2                             # opcional: corte de la épica
follows: [20261001-analytics-base]    # opcional: cambios que continúa
dependsOn: []                         # opcional: cambios que deben cerrarse antes
allowedDependencies: [zod, "@angular/*"]  # opcional: dependencias que el cambio puede añadir (nombres o globs); las demás las rechaza `specty check --spec`
timebox: 2h                           # solo spike
estimate:                             # opcional: ajuste del modelo al tamaño calculado
  adjust: +1                          # solo sube: un -1 no se aplica y el tamaño lo dice
  reason: Agregación por periodos sin tests previos.
effort:                               # opcional: esfuerzo del modelo para revisar la spec y el alcance
  review: max                         # low | medium | high | max; solo sube el que calcula Specty
  reason: El periodo cambia la API pública.
---
```

El título es el único `#` del documento.

### Secciones por carril

Los encabezados se aceptan en español o en inglés.

| Sección | quick | standard | spike | retro | epic |
| --- | --- | --- | --- | --- | --- |
| Objetivo · Goal | ✓ | ✓ | | ✓ | ✓ |
| Pregunta · Question | | | ✓ | | |
| Motivo · Reason | | | | ✓ | |
| Fuera de alcance · Out of scope | | ✓ | ✓ | | ✓ |
| Supuestos · Assumptions | | ✓ | ✓ | | ✓ |
| Criterios de aceptación · Acceptance criteria | | ✓ | | | ✓ |
| Diseño · Design | | opcional | | | opcional |
| Archivos · Files | ✓ | ✓ | ✓ | ✓ (se genera del diff) | |
| Tareas · Tasks | ✓ (una) | ✓ | ✓ | | |
| Cortes · Slices | | | | | ✓ |
| Riesgos · Risks | | opcional | | ✓ | opcional |
| Cierre · Closing | automático | al cerrar | al cerrar (Hallazgos y Decisión) | | al cerrar |

Una sección obligatoria puede contener solo `- Ninguno` cuando así sea. Escribirlo obliga a pensarlo.

### Ejemplo y sintaxis de los ítems

```markdown
# Mi evolución académica

## Objetivo
El estudiante ve su evolución por materia en un gráfico de líneas con filtro temporal, leyenda interactiva y un mensaje de tendencia.

## Fuera de alcance
- Cambios en la API del backend.
- La vista del docente.

## Supuestos
- A1: Las series por materia ya llegan en el provider actual; no hace falta cambiar la API.
  - impacto: alto
- A2: "Por periodo" agrupa por trimestres académicos.

## Criterios de aceptación
- AC1: CUANDO el estudiante elige "Histórico anual" ENTONCES el gráfico muestra un punto por mes para cada materia.
- AC2: CUANDO el estudiante toca un chip de la leyenda ENTONCES esa serie se oculta o se muestra sin recargar la vista.

## Archivos
- modificar lib/features/home/home_estudiante_provider.dart — modelo multiserie y filtro temporal
- modificar lib/features/analytics/analytics_estudiante_dashboard_cards.dart — rediseño de la tarjeta
- crear test/features/analytics/evolucion_card_test.dart — pruebas de widget

## Tareas
- [ ] T1: Modelo multiserie y filtro temporal
  - files: lib/features/home/home_estudiante_provider.dart
  - ac: AC1
  - verify: flutter test test/features/home
- [ ] T2: Rediseñar la tarjeta de evolución
  - files: lib/features/analytics/analytics_estudiante_dashboard_cards.dart, test/features/analytics/evolucion_card_test.dart
  - ac: AC1, AC2
  - verify: flutter test test/features/analytics

## Riesgos
- R1: Con 12 puntos y 4 series, el gráfico puede desbordar en pantallas pequeñas. Mitigación: probarlo a 320 px de ancho.
```

- **Criterios**: `CUANDO … ENTONCES …` o `WHEN … THEN …`; opcionalmente `DADO` / `GIVEN`. Un criterio que ningún test puede comprobar lleva debajo el campo `test: manual`, igual en los dos idiomas y con `manual` como único valor: ningún test tiene que llevar su id, y lo comprueba la persona al aceptar ([ADR 0014](decisions/0014-los-tests-como-contrato.md)).
- **Archivos**: una acción, una ruta o glob y el motivo. Acciones: `crear`, `modificar`, `borrar` o `renombrar origen -> destino` (también en inglés: create, modify, delete, rename). Se prefieren rutas explícitas; para el tamaño, un glob cuenta como sus coincidencias actuales más una, y una ruta que también cubre un glob cuenta una vez. El tamaño solo cuenta código escrito a mano, con la regla de `lines`: ni las rutas ni las coincidencias que no están gobernadas, caen en `scope.generated`, son lockfiles, tienen una marca de generado en sus primeras líneas o son binarias. Los límites de archivos (`split.maxFiles` y `lanes.quick.maxFiles`) cuentan además solo los que no son tests; la puntuación cuenta también los tests. El cierre no vuelve a mirar el tamaño (ARCHITECTURE §11).
- **Campos de tarea**:
  - `files` (obligatorio): rutas o globs incluidos en Archivos.
  - `ac` (obligatorio salvo en quick y spike): los criterios que cubre. Las tareas `refactor`, `test`, `docs` o `chore` pueden indicar `ac: —`.
  - `verify` (opcional si la configuración tiene una verificación por defecto).
  - `type` (opcional, por defecto `feat`): tipo de Conventional Commits.
  - `notes` (opcional).
  - `effort` (opcional): el esfuerzo que el modelo recomienda para implementarla, `low`, `medium`, `high` o `max`, y su motivo tras ` — ` (`effort: high — reescribe el índice`). Solo sube el que calcula Specty.
- **Supuestos**: los marcados con `impacto: alto` exigen una decisión explícita antes de aprobar. Los demás se aceptan junto con la spec.
- **Cortes** (épicas): `- C1: título`, con los campos `ac` (criterios que cubre) y `depends` (cortes que deben cerrarse antes).
- **Variaciones aceptadas**: Specty tolera, y reescribe en forma canónica:
  - encabezados con otras mayúsculas, sin tildes o con dos puntos finales;
  - `*` como viñeta;
  - ids en minúscula o con ceros (`ac01`);
  - rutas con `./` o entre comillas invertidas;
  - tareas sin casilla;
  - ` - ` como separador del motivo.

### Validación (`propose`)

**Errores**, que bloquean:

- Falta una sección obligatoria del carril, o hay un id duplicado, mal formado o renumerado.
- Hay una tarea sin `files`, o con archivos que no están en la sección Archivos.
- Se referencia un criterio inexistente, o hay un criterio que ninguna tarea cubre.
- Hay una tarea sin `verify` y no existe una verificación por defecto.
- En `adjusting`: se modifica o elimina una tarea completada.
- En `closing`: hay cambios fuera de la sección Cierre.
- Un cambio `quick` supera sus límites, o un cambio supera los umbrales de división. La tarea única de `quick` solo se exige antes de la primera aprobación: después, un ajuste puede añadir tareas de corrección.
- Una tarea de código de un cambio `standard` no lista ningún test en sus archivos, si la política es `required` o `contract`. Con `contract`, un `refactor` o un `perf` no lo necesita: su contrato son los tests que ya existen, y `task done` no lo completa si les quita aserciones.

**Avisos**, que se muestran en la salida y en la UI:

- Un criterio no tiene un resultado observable o usa términos vagos ("rápido", "correctamente", "adecuado"…).
- Una tarea tiene más archivos de los recomendados, o su tarjeta supera el presupuesto de contexto.
- Una tarea de código no toca tests, si la política es `recommended`.

### Forma canónica y hash

- Los comentarios HTML de la plantilla (pistas para el agente) se eliminan en `propose`, salvo dentro de bloques de código y de código en línea: entre series de comillas invertidas de la misma longitud, en la misma línea, un comentario citado es texto. Un comentario que se abre y no se cierra es un error que señala su línea, porque ocultaría todo lo que sigue.
- Las secciones se escriben en el orden canónico de la tabla anterior. Las estructuradas se reescriben en forma canónica; la prosa (Objetivo, Diseño, Cierre…) se conserva tal cual, salvo los espacios al final de línea y las líneas en blanco que la rodean.
- Los saltos de línea se normalizan a LF y el texto a Unicode NFC, para que guardar el archivo desde otro editor o sistema no cambie el hash.
- El hash de una revisión es el SHA-256 de la forma canónica, con las casillas normalizadas a `[ ]`. El estado de las tareas vive en `state.json`; Specty marca `[x]` en el archivo solo para que se lea bien.
- Cada ítem y cada sección tienen su propio hash. Con ellos se calcula el delta entre revisiones.

## 3. `state.json`

```json
{
  "schema": 1,
  "id": "20261020-evolucion-academica",
  "kind": "standard",
  "phase": "implementing",
  "branch": "specty/20261020-evolucion-academica",
  "baseCommit": "9f1c2e7",
  "revision": 3,
  "approved": { "revision": 3, "hash": "sha256:4be1c2d…", "at": "2026-10-20T15:02:11Z", "by": "Jorge Palacio", "channel": "ui" },
  "size": { "level": "M", "score": 7, "adjust": 0, "reasons": ["3 archivos", "2 módulos", "sin tests en analytics"] },
  "items": {
    "A1": { "hash": "1f3a…", "decision": "confirmed" },
    "A2": { "hash": "77c0…", "decision": "implicit" }
  },
  "tasks": {
    "T1": { "status": "done", "baseCommit": "9f1c2e7", "commit": "a1b2c3d", "attempts": 1, "startedAt": "2026-10-20T15:05:40Z", "doneAt": "2026-10-20T15:20:12Z", "summary": "Modelo EvolucionSerie y enum de filtro temporal" },
    "T2": { "status": "active", "baseCommit": "a1b2c3d", "attempts": 0, "startedAt": "2026-10-20T15:21:03Z", "scopeExtra": [] }
  },
  "pending": {
    "scopeRequests": [
      { "id": "S1", "task": "T2", "paths": ["lib/core/theme/ca_colors.dart"], "reason": "Faltan los tokens de color por materia" }
    ],
    "adjustment": null
  },
  "maxIds": { "A": 2, "AC": 2, "T": 2, "R": 1 }
}
```

- `phase` es una de las fases de ARCHITECTURE §4: `draft`, `review`, `testing`, `implementing`, `acceptance`, `adjusting`, `closing`, `done` o `cancelled`. `testing` es la fase de los tests de los criterios antes del código ([ADR 0014](decisions/0014-los-tests-como-contrato.md)): con `policy.tests: contract`, se entra en ella al aprobar la spec de un cambio con tareas pendientes `feat` (un `standard`: el ciclo de una feature, con el gate 2) o solo `fix` (también un `quick`: el ciclo de un bug, cuyo test en rojo se bloquea solo).
- `approved.hash` debe coincidir con la forma canónica actual de `spec.md`. Si no coincide, nada avanza hasta que se proponga y apruebe una nueva revisión.
- `approved.channel` dice por dónde se aprobó: `tty`, `ui`, `pr` o `delegated`. `delegated` significa que aprobó el agente en modo delegado. `by` es siempre la persona: la que aprobó o la que delegó.
- `items[].decision` puede ser:
  - `pending`;
  - `confirmed` o `rejected`: lo decidió la persona;
  - `implicit`: se aceptó al aprobar la spec.

  Si el texto de un ítem cambia, su decisión vuelve a `pending`.
- `tasks[].status` puede ser `pending`, `active` o `done`. `scopeExtra` guarda las ampliaciones aprobadas.
- `tasks[].baseCommit` es el commit desde el que empezó la tarea. `tasks[].commit` (opcional) es el commit de la tarea, pero la CLI no lo guarda: es el commit que contiene el propio `state.json`. Se encuentra por su trailer `Specty-Task`, y el servidor local lo añade a lo que sirve a la UI (ARCHITECTURE §15).
- `items[].comment` (opcional) guarda por qué la persona rechazó un supuesto; el agente lo lee en `specty next`.
- `pending.scopeRequests[].retro` (opcional): la creó `specty retro --into` y guarda la huella de lo preparado que documenta (un hash de la ruta, el modo y el blob de cada archivo gobernado preparado). Si al aprobarla la huella ya no coincide, Specty la rechaza (ARCHITECTURE §9).
- `maxIds` guarda el número más alto usado por cada prefijo (también `S`, las solicitudes de alcance), para que un id borrado nunca se reutilice con otro significado.
- `closingSubmittedAt` (opcional) indica que el cierre ya se envió y espera la confirmación de la persona.
- `testsSubmittedAt` (opcional), en la fase `testing`, indica que el agente envió los tests y esperan la aprobación de la persona; se borra al aprobarlos.
- `lockedTests` (opcional): los tests que aprobó la persona en la fase `testing`, cada ruta con el hash de su contenido al aprobarlos. El guard no deja escribirlos ni borrarlos, y `tests-locked` falla si alguno cambia (ARCHITECTURE §4). Un test que la persona desbloquea para una tarea (`scope add` sobre él, que decide solo la persona) queda abierto mientras la tarea está activa, y al completarla `lockedTests` guarda el hash de su versión nueva; si ya no existe, deja de estar bloqueado.
- `testCycle` (opcional), en la fase `testing`, guarda el ciclo que decidió su aprobación: `feature` (los tests esperan a la persona) o `bug` (su rojo se bloquea solo). Se borra al salir de la fase.
- `integration` (opcional) registra una incorporación de la rama principal que no salió sola: el merge dio conflictos o, con su resultado, la verificación falla, y el merge espera en la carpeta del cambio a que el agente lo termine (ARCHITECTURE §9). Mientras no tiene `resolved`, el agente solo puede tocar los archivos de `paths`:

  ```json
  "integration": {
    "target": "main",
    "commit": "b4c5d6e",
    "reason": "conflicts",
    "conflicts": ["lib/features/home/home_page.dart"],
    "paths": ["lib/features/home/home_page.dart", "lib/core/theme/ca_colors.dart"],
    "at": "2026-10-20T16:02:11Z",
    "resolved": { "commit": "c7d8e9f", "at": "2026-10-20T16:10:40Z" }
  }
  ```

  - `target` es la rama destino, y `commit`, el commit suyo que se incorpora.
  - `reason` es `conflicts` o `verify`. `conflicts` lista los archivos en conflicto; con `verify`, puede ir vacío.
  - `paths` son los archivos que cambió cualquiera de los dos lados desde su base común. Sus tests implícitos y los archivos generados también se pueden tocar.
  - `resolved` (opcional) guarda el commit de merge y la fecha. El campo se conserva para que la persona vea al cerrar qué resolvió el agente.

## 4. `audit.jsonl`

Una línea JSON por evento: `{ "ts", "actor": "agent" | "human" | "specty", "tool"?, "by"?, "session"?, "model"?, "effort"?, "event", "data" }`. `tool` es la herramienta que declara el agente: sirve como contexto, no como prueba. Si el agente toma una decisión de la persona en modo delegado (aprobar, decidir el alcance, aceptar, cerrar o cancelar), la línea lleva `actor: "agent"` y `data.delegated: true`. `by` es el nombre de la persona, su `user.name` de git, en sus decisiones y en las que el agente toma por ella. `model` y `effort` son el modelo y el esfuerzo del agente cuando su herramienta los dice, también como contexto (`agents/run.ts`): hoy solo Claude Code, cuyo esfuerzo llega en `CLAUDE_EFFORT` y cuyo modelo es el de la última respuesta del transcript de su sesión (`projects/*/<CLAUDE_CODE_SESSION_ID>.jsonl` bajo `CLAUDE_CONFIG_DIR` o `~/.claude`), del que Specty lee solo los últimos 64 KB y solo ese campo. Si no se encuentran, la línea va sin ellos; las líneas anteriores no los tienen. `session` es el id de la sesión del agente, cuando su herramienta lo dice: hoy, `CLAUDE_CODE_SESSION_ID` de Claude Code, solo si es un nombre sin separadores (`[A-Za-z0-9_-]`), aunque su transcript no aparezca. Sirve para saber qué sesiones trabajaron en un cambio y medir su consumo.

| Evento | Datos |
| --- | --- |
| `change.created` | carril, rama, origen (`follows`; `epic` y `slice` en el corte de una épica) y, con `new --request`, la petición literal del usuario (`request`), tal como la escribió; `bootstrap: true` si es el primer cambio de un proyecto nuevo, su esqueleto (ARCHITECTURE §14) |
| `spec.proposed` | revisión, hash, tamaño, avisos |
| `assumption.decided` | ítem, decisión, comentario |
| `review.changes_requested` | la persona pidió cambios: revisión e ids de los comentarios sin resolver |
| `spec.approved` | revisión, hash, canal (`ui`, `tty`, `pr`), presencia verificada; si un ajuste desbloqueó tests aprobados, `unlocked` (sus rutas) |
| `tests.proposed` | en la fase `testing`, el agente envió los tests: `count` y `files`, los que van en el commit, y `red`: cada comando de la verificación que falló, `{ cmd, exit }` |
| `tests.approved` | la persona aprobó los tests enviados (el gate 2 de ADR 0014): canal (`tty`, `ui` o `delegated`) |
| `tests.locked` | en el ciclo de un bug, Specty bloqueó los tests en rojo sin esperar a la persona: `count` y `files` |
| `task.started` | tarea, commit base |
| `task.verified` | tarea, comando, código de salida, duración, final de la salida si falló, y `tree`: el código sobre el que corrió, un hash del árbol de trabajo sin `.specty/` tomado antes de verificar |
| `task.completed` | tarea, commit, resumen (300 caracteres como máximo) y, si la tarea quitó aserciones de tests que ya existían, `removedAssertions`: `{ path, removed }` por archivo; si su diff tiene riesgos conocidos, `risks`: `{ path, rule, cwe?, line? }` por hallazgo; con `--finding`, `findings`: los textos del agente, en orden, de 300 caracteres como máximo cada uno; si dejó archivos por encima de `lines.warn`, `longFiles`: `{ path, lines, before, limit, severity }` por archivo |
| `scope.requested` / `scope.decided` | rutas, motivo, decisión (`auto` o persona); si es `auto`, `basis` (ruta → `test`, `generated` o `planned`) y `plannedFor` (ruta prevista → tareas que la listaban); si la persona aprueba el desbloqueo de tests aprobados, `unlock` (sus rutas) y `task`; la solicitud de `retro --into` lleva `retro` (la huella de lo preparado), y si lo preparado cambió antes de aprobarla, Specty la rechaza (actor `specty`) con el motivo |
| `epic.slicesDone` | todos los cortes de una épica tienen un cambio cerrado, y `specty next` la pasa a aceptación (actor `specty`): `slices`, el cambio de cada corte |
| `adjust.requested` | petición literal |
| `adjust.classified` | clasificación por ítem: defecto, refinamiento o alcance nuevo |
| `review.completed` | la revisión independiente (ADR 0011), anotada por `specty review` (actor `specty`): `target` (`spec` o `diff`), revisión, comando, código de salida, duración y, si respondió, el archivo de la respuesta |
| `change.verified` | la verificación completa (`verify.full`), anotada por `specty accept` cuando la ejecuta, por el servidor local cuando la persona la lanza desde la UI, o al incorporar la rama principal en un cambio abierto, si pasa (actor `specty`): comando, código de salida (`null` si se cortó por tiempo), duración, las últimas 10 líneas si falló, y `tree`, como en `task.verified`. `accept` no la repite si la última verificación con ese comando (también la de una tarea, sola o tras `verify.quick`) pasó con el mismo `tree`. Si dejó un informe de `checks.coverage.reports` que mide líneas que añade el cambio, también `coverage`: `measured`, `covered`, los cinco primeros tramos sin ejecutar en `gaps` (`{path, from, to}`) y cuántos son en `stretches`; las líneas cuentan desde el merge-base con la rama destino o, con un merge de esta en curso, desde el commit que entra. La aceptación muestra la de la última que pasó con el `tree` actual |
| `change.accepted` | revisión aceptada |
| `retro.confirmed` | en una retro aparte, el modo (`agent` o `minimal`); con `retro --into`, en el cambio activo, la solicitud (`request`) y sus rutas (`paths`) |
| `change.usage` | lo que consumió el cambio, medido con ccusage al cerrarlo, o al aceptar uno quick, justo antes de archivarlo (actor `specty`): `calls`, las llamadas al modelo de las sesiones que nombran sus líneas (`session`) desde `change.created`; `input`, `output`, `cacheWrite` y `cacheRead`, sus tokens de cada tipo, y `cost`, en USD, si cada modelo de esas llamadas tiene precios, ninguno negativo, que expliquen al céntimo el coste de nueve de cada diez de sus sesiones en el informe de ccusage, y de al menos cuatro. Sin ccusage, sin una respuesta válida o sin sesiones, no hay evento |
| `change.closed` / `change.cancelled` | motivo, al cancelar |
| `integration.started` | incorporar la rama principal al aceptar o al cerrar dejó el merge para el agente: rama destino, su commit, motivo (`conflicts` o `verify`) y archivos en conflicto |
| `integration.resolved` | `specty integrate` hizo el commit de merge: commit |
| `integration.abandoned` | el merge ya no estaba en curso y la incorporación pendiente se descartó: rama destino |

```jsonl
{"ts":"2026-10-20T14:40:03Z","actor":"agent","tool":"claude-code","event":"spec.proposed","data":{"revision":1,"hash":"sha256:c09d…","size":"M"}}
{"ts":"2026-10-20T14:52:40Z","actor":"human","event":"assumption.decided","data":{"item":"A2","decision":"rejected","comment":"Por periodo debe agrupar por trimestres, no por los periodos configurados."}}
{"ts":"2026-10-20T15:02:11Z","actor":"human","event":"spec.approved","data":{"revision":3,"hash":"sha256:4be1c2d…","channel":"ui"}}
{"ts":"2026-10-20T15:20:09Z","actor":"specty","event":"task.verified","data":{"task":"T1","cmd":"flutter test test/features/home","exit":0,"ms":18422}}
{"ts":"2026-10-20T16:05:31Z","actor":"specty","event":"change.verified","data":{"cmd":"flutter analyze && flutter test","exit":0,"ms":41870}}
```

## 5. `comments.json`

```json
[
  {
    "id": "c1",
    "revision": 2,
    "anchor": { "section": "design", "quote": "Container redondeado" },
    "author": "Jorge Palacio",
    "body": "Usa CaChip para la leyenda, no un Container.",
    "createdAt": "2026-10-20T14:55:02Z",
    "resolvedInRevision": 3
  }
]
```

Un ancla puede ser un ítem (`{ "item": "A1" }`) o una cita dentro de una sección (`{ "section", "quote" }`); `section` es la clave de la sección (`goal`, `outOfScope`, `assumptions`, `criteria`, `design`, `files`, `tasks`, `risks`).

- La persona comenta solo durante la revisión (fase `review`), desde la UI. `id` es `c<n>` por orden de llegada, `revision` es la revisión comentada y `author`, el `user.name` de git. Un comentario vacío se rechaza.
- Comentar no entra en la auditoría; pedir cambios, sí: `review.changes_requested` con los ids de los comentarios sin resolver. Sin comentarios sin resolver ni supuestos rechazados, no hay nada que pedir y se rechaza.
- Los comentarios sin resolver llegan al agente en `specty next` («CAMBIOS PEDIDOS») solo cuando la persona pidió cambios después de la última propuesta: mientras comenta, la revisión sigue siendo suya.
- `propose` con una revisión nueva marca los comentarios sin resolver con `resolvedInRevision`. Si la spec no cambió, no hay revisión nueva y siguen abiertos.

## 6. `config.yaml`

```yaml
version: 1
language: es                      # es | en; `init` lo pregunta primero
mode: individual                  # individual | team
governed: ["lib/**", "test/**"]   # rutas donde rige el flujo
ignored: ["**/*.md", "docs/**", "assets/**"]
sensitive: ["lib/core/auth/**", "**/migrations/**", ".github/**"]
verify:
  default: flutter test
  full: flutter analyze && flutter test
  quick: dart format --output=none --set-exit-if-changed .  # antes de la verificación de cada tarea
  timeoutSec: 600                 # al vencer, se corta el comando con todos los procesos que lanzó
scope:
  implicitTests: true             # tests junto a los archivos del alcance
  generated: ["**/*.g.dart", "**/*.freezed.dart"]
  autoApprove: tests-and-generated  # none | tests-and-generated: tests, generados y lo que ya está en Archivos
lanes:
  quick: { maxFiles: 3 }          # archivos de código: gobernados, sin contar tests
split: { maxTasks: 8, maxFiles: 15, maxModules: 2, taskMaxFiles: 5 }  # maxFiles, como en quick
size: { S: 4, M: 10, L: 18 }      # puntuación máxima de cada nivel; por encima de L es XL
lines:                            # líneas de código de los archivos que toca una tarea, sin blancos ni comentarios
  warn: 300                       # avisa si la tarea deja un archivo por encima y lo hizo crecer
  fail: 500                       # bloquea si la tarea lo lleva por encima; false: nunca
  tests: { warn: 400, fail: 600 }
  exclude: ["src/legacy/report.ts", "**/*.pb.ts"]  # rutas o globs que no se miden; se suman a las de por defecto: fixtures, __fixtures__, mocks, __mocks__, testdata, migrations, i18n, l10n, locales y translations
checks:                           # specty check (ADR 0012)
  levels: { max-lines: error }    # error | warn | off por verificación; sin la clave, error
  maxFindings: 10                 # fallos que se muestran por verificación antes de «… y N más»
  exclude: ["legacy/**"]          # rutas o globs que ninguna verificación mira; se suman a las de por defecto: node_modules, build, dist, out, target, coverage, vendor, .dart_tool, .next, .angular y .gradle
  todo:                           # la verificación todo
    markers: ["TODO", "FIXME"]    # palabras que, primeras en un comentario, marcan trabajo pendiente; distingue mayúsculas
    reference: "#\\d+|\\b[A-Z][A-Z0-9]+-\\d+\\b|https?://\\S+"  # expresión regular de la referencia a un issue, tras la marca
  functions: { maxLines: 50, complexity: 10 }  # límites de cada función: líneas de código y complejidad ciclomática
  layers:                         # opcional: las capas del proyecto; sin la clave, la verificación layers no aparece
    domain: { paths: ["src/domain/**"], forbiddenPackages: ["@angular/*", "@nestjs/*", "node:*"] }
    application: { paths: ["src/application/**"], may: [domain] }
    infrastructure: { paths: ["src/infrastructure/**"], may: [application, domain] }
    ui: { paths: ["src/ui/**"], may: [application, domain] }
  generators:                     # opcional: generadores de código además de los detectados
    - { command: "npm run openapi", outputs: ["src/api/**"], inputs: ["openapi.yaml"] }  # sin inputs, corre con cualquier cambio
  preCommit: false                # true: el pre-commit ejecuta también `specty check --staged` sobre los cambios manuales
  commands:                       # opcional: los comandos del proyecto, por encima de los detectados
    tests: "pnpm test --run"      # format | lint | typecheck | tests
  coverage:                       # la verificación diff-coverage
    reports: ["coverage/lcov.info", "*/coverage/lcov.info"]  # dónde dejan los tests su informe, con * dentro de un tramo; por defecto, también */*/coverage/lcov.info, coverage/<proyecto>/lcov.info (como el de Angular) en la raíz o una o dos carpetas abajo, lcov.info, coverage.xml, coverage/cobertura-coverage.xml, los de JaCoCo de Maven y Gradle y coverage.out
    warn: 80                      # avisa si los tests ejecutan menos de este % de las líneas que añade el cambio
    error: 60                     # opcional: falla por debajo de este %
policy:
  tests: contract                 # contract | required | recommended | off; contract: los tests de una feature, antes del código (ARCHITECTURE §4). init escribe contract en un proyecto nuevo; sin la clave, recommended
glossary: docs/dominio.md         # el glosario del dominio; sin la clave: docs/dominio.md (es) o docs/domain.md (en)
retro:
  mode: agent                     # agent | minimal
git:
  branchPerChange: true
  worktrees: true                 # cada cambio en su propia worktree (necesita branchPerChange)
  setup: "pnpm install --prefer-offline"  # prepara cada worktree nueva; false: nada; sin la clave: el comando del stack
  target: develop                 # rama de la que parten los cambios y a la que se incorporan; sin la clave: la principal
  flow: gitflow                   # specty | github | trunk | gitflow: cómo se nombran las ramas; sin la clave: specty/<id>
  branchPattern: "team/{type}-{slug}"  # opcional: nombre propio con {type}, {slug} e {id}; gana a flow
team:                             # solo con mode: team
  approvers: []
  requirePrReview: true
ui:
  port: auto
  requireUserPresence: false      # WebAuthn (fase 4)
memory:                           # la memoria de Specty (ADR 0016)
  orphanAfterMin: 60              # minutos sin pasos ni cambios de estado tras los que un cambio que espera al agente es huérfano
```

Specty escribe `.specty/` con su propio formato. Si el repositorio usa un formateador, debe excluir esa carpeta: `"!.specty"` en `files.includes` de Biome, o `.specty/` en `.prettierignore`. `specty doctor` avisa cuando falta.

`review` activa la revisión independiente (ADR 0011), que solo configura la persona:

```yaml
review:
  command: claude -p --model opus --tools "" --setting-sources "" --strict-mcp-config
  timeoutSec: 600                 # opcional; sin la clave, el de verify
```

`specty review` le pasa a `command` por la entrada estándar las instrucciones y la spec, y guarda su salida en `reviews/spec-r<revisión>.md`. En aceptación le pasa también el diff de todo el cambio, y la salida va a `reviews/diff-<n>.md`, con `n` el número de la revisión del resultado. Sin `review`, Specty no recomienda ni ejecuta revisiones.

`glossary` es la ruta del glosario del dominio (ADR 0014), un archivo del proyecto con una línea por término:

```markdown
- **Pedido** (`Order`): lo que un cliente compra en una visita.
- **Línea de pedido**: un producto y su cantidad dentro de un pedido.
```

El nombre en el código, entre paréntesis, es opcional. Las demás líneas y los comentarios HTML no cuentan, así que las pistas pueden ir en un comentario. Un término aparece en un texto sin importar mayúsculas, como palabra entera y también en plural con `s` o `es`; su nombre en el código aparece tal cual (`parseGlossary` y `termsIn` en `core/src/glossary.ts`). Si el archivo no existe, no hay glosario. `specty init` lo crea con las pistas en un comentario donde falta, y `specty doctor` avisa mientras no define ningún término.

`verify.quick` es una comprobación rápida de todo el repositorio, como el formato o el tamaño de los archivos, que `task done` ejecuta antes de la verificación de cada tarea. Las dos van en un solo comando, `<quick> && <verify>`, que es también el que muestra la tarjeta de la tarea. Así un fallo aparece en la tarea que lo causó, no en otra posterior ni al aceptar. Sin la clave, cada tarea ejecuta solo su verificación.

`specty init` escribe `verify.default` y `verify.full` con los comandos que detecta. Si el archivo ya existe, solo añade los que falten y la detección encuentre ahora (por ejemplo, tras el primer cambio de un repositorio vacío), insertando sus líneas al final de `verify` (o un bloque `verify` nuevo al final del archivo); nunca cambia un valor que ya está, y el resto del archivo, con sus comentarios, queda igual.

La tabla de esfuerzo por herramienta (`presets/effort.yaml`) viene con Specty y se puede sobrescribir con una clave `effort:` en este archivo.

La guía de las verificaciones, con lo que comprueba cada una, cómo se configura y cómo se desactiva, está en [checks.md](checks.md) y, en inglés, en [checks.en.md](checks.en.md). Lo que sigue es el detalle.

`specty check` ejecuta primero los comandos del propio proyecto, cada uno como una verificación con su id: `format`, `lint`, `typecheck` y `tests`. Salen de `checks.commands` o, sin la clave, de los que Specty detecta en el stack principal, los mismos que `init` escribe en `verify` y en AGENTS.md: los scripts de `package.json` y `composer.json` y, en Python, Ruby, PHP, Go, Java, Kotlin y Swift, las herramientas que el proyecto configura, por su archivo de configuración, su sección o el manifiesto que las declara (`cli/src/detect/quality.ts`; la guía [checks.md](checks.md) da la lista). Specty nunca añade una herramienta: si está configurada pero no instalada, su verificación falla con el código de salida del comando. El formato solo se detecta en su forma de comprobación, nunca en la que reescribe archivos: los scripts `format:check`, `fmt:check` o `check:format` en JavaScript y TypeScript, `dart format --output=none --set-exit-if-changed .` en Dart, `cargo fmt --check` en Rust, `ruff format --check` o `black --check .` en Python, `pint --test` o `php-cs-fixer check` en PHP, `spotlessCheck` de Gradle o `spotless:check` de Maven en Java y Kotlin, `swift format lint --strict --recursive .` en Swift y `dotnet format --verify-no-changes` en .NET. En C#, `typecheck` es `dotnet build`. Una verificación sin comando no aparece. Cada comando corre con la shell en la raíz, con el tiempo límite de `verify.timeoutSec`, y mira el proyecto entero, porque un cambio puede romper archivos que no tocó. Pasa si sale con 0. Si no, su primer hallazgo dice con qué código salió, o que superó el tiempo, y los demás son las líneas de su salida que señalan `ruta:línea` (o `ruta(línea,columna)`, o la ruta en una línea y `línea:columna` en las siguientes, como ESLint), primero las de archivos de la ejecución. Sin ninguna, son sus últimas líneas. Como en todas, se muestran hasta `checks.maxFindings`.

Luego vienen las de cada stack. En un proyecto TypeScript, `strict-types` prohíbe en las líneas añadidas un `any` explícito, `@ts-ignore` y `@ts-nocheck`, y la aserción no nula (`x!`); no mira los `*.d.ts`. Si el `package.json` de la raíz declara `typescript-eslint` o `@typescript-eslint/eslint-plugin` y existe `node_modules/.bin/eslint`, ejecuta ese ESLint con la configuración del proyecto y además `@typescript-eslint/no-explicit-any`, `@typescript-eslint/ban-ts-comment` y `@typescript-eslint/no-non-null-assertion` a `error` (con `--rule`, en formato levn). Le pasa los archivos de la ejecución, o `.` con `--all`, y solo cuenta los mensajes de esas tres reglas; si ESLint sale con 2, la verificación no corre y da su error. Sin ese ESLint, usa la detección propia de Specty, línea a línea y sin comentarios ni cadenas, así que la regla se cumple también con Biome o sin lint.

En un proyecto Dart o Flutter, `dart-strict` exige el analizador en modo estricto: `strict-casts`, `strict-inference` y `strict-raw-types` a `true` en `analyzer.language` del `analysis_options.yaml` de la raíz, o en lo que trae su `include` (un URI o una lista; `package:` se resuelve con `.dart_tool/package_config.json`, y una ruta, relativa al archivo que la incluye). Lo propio pisa lo incluido, y la cadena se sigue hasta cinco niveles. Falla con los modos que faltan o están en `false`. Si un `include` no se lee (falta `dart pub get`) y los modos no aparecen en lo demás, solo avisa. Falla también con cada `// ignore:` o `// ignore_for_file:` que el cambio añade a un archivo `.dart`, porque apagan el analizador en esa línea o en todo el archivo.

Con `checks.layers`, en un proyecto TypeScript o JavaScript, `layers` falla con cada import que cruza las capas. Cada capa tiene sus `paths` (globs), las capas que puede importar (`may`; ella misma y lo que no está en ninguna capa siempre) y los paquetes que no (`forbiddenPackages`, globs sobre el nombre del paquete: `@angular/core` para `@angular/core/testing`, `node:fs` para los módulos de Node). Un archivo es de la primera capa que lo contiene, y un `may` que nombra una capa que no existe hace que la configuración no se acepte. Los imports los resuelve el dependency-cruiser del proyecto, con los alias de `tsconfig.json`: Specty ejecuta `node_modules/.bin/depcruise --no-config --ts-pre-compilation-deps --ts-config tsconfig.json --do-not-follow node_modules --output-type json --output-to <archivo>` sobre los archivos de la ejecución que están en alguna capa, o sobre las carpetas de las capas con `--all`. La regla la aplica el core. En Dart y Flutter no hace falta ninguna herramienta: un escáner propio lee las directivas `import` y `export` de cada archivo `.dart` de las capas (fuera de comentarios y cadenas; los `part` no cuentan) y las resuelve. Un `package:` con el `name` del `pubspec.yaml` es el archivo bajo `lib/`, otro `package:` es ese paquete (`flutter`, `riverpod`), `dart:io` es el paquete `dart:io`, y una ruta relativa se resuelve desde la carpeta del archivo. En un repositorio con los dos lenguajes, dependency-cruiser solo hace falta para los archivos TypeScript o JavaScript. Como las de marcas, con `--changed` y `--staged` solo cuentan los imports de líneas añadidas. Sin dependency-cruiser, la verificación no corre y dice que se añada como devDependency; si falla, no corre y da su error.

En Python, Go y Rust, `layers` tampoco necesita herramientas: escáneres propios del core leen sus imports, cada uno con su línea, y los resuelven sin compilar. En Python (`core/src/checks/imports-python.ts`), `import a.b` y `from a.b import c`: un módulo es del proyecto si existe como `a/b.py`, `a/b/__init__.py` o la carpeta `a/b`, en la raíz o bajo `src/`; si no, es el paquete `a`; los relativos parten de la carpeta del archivo. En Go (`imports-go.ts`), cada `import "ruta"`, con alias o sin él, en una línea o en bloque: una ruta bajo el `module` de `go.mod` es la carpeta `<carpeta>/*.go`, y cualquier otra, su paquete. En Rust (`imports-rust.ts`), cada `use` (también `pub use` y el que ocupa varias líneas, por su prefijo hasta `{`) y cada `extern crate`: `crate::a::b` es `a/b.rs` bajo el último `src` de la ruta del archivo, `super::` y `self::` parten de su módulo, y cualquier otro primer nombre es su crate.

En Java y Kotlin (`imports-jvm.ts`), cada `import` (también `import static` y `a.b.*`, con `;` o sin él y con alias): los paquetes del proyecto son las carpetas con archivos `.java` o `.kt`, y un import es del proyecto cuando sus primeros nombres, al menos dos, terminan la ruta de una de ellas; va al archivo de su tipo en esa carpeta, o a `<carpeta>/*`. Cualquier otro es el paquete con su nombre completo. En PHP (`imports-php.ts`), cada `use` antes de la primera clase, interfaz, trait o enum, con `use function`, `use const` y los grupos `use A\{B, C}` por su prefijo: un nombre que cubre un prefijo de `autoload.psr-4` o `autoload-dev.psr-4` de `composer.json` (el más largo) va al archivo que da PSR-4, o a `<carpeta>/*` en un grupo; cualquier otro es el paquete con sus `\` como `/`.

En C# (`imports-csharp.ts`), cada `using`, `global using`, `using static` y alias (`using X = A.B.C;`), pero no las declaraciones `using var` ni las sentencias `using (…)`: los namespaces del proyecto son los que declaran sus archivos `.cs` (`namespace A.B`, con llaves o de archivo), y un nombre que es uno de ellos, o lo es sin su último tramo, va a `<carpeta>/*.cs`, la carpeta del primer archivo que lo declara. Cualquier otro es el paquete con su nombre completo.

`generated` comprueba que el código generado coincide con lo que produce su generador, como un `git diff --exit-code` tras regenerar, sin dejar nada cambiado. Por cada generador guarda lo que tienen sus salidas (las que git ve, seguidas o nuevas sin ignorar), lo ejecuta con la shell en la raíz, compara byte a byte y lo restaura todo: lo cambiado y lo borrado vuelve, y lo nuevo se borra. Falla con cada salida que no coincide, que falta o que ya no se genera, nombrando el comando. Si el comando falla, la verificación no corre y da su error. Se ejecuta sola, después de las demás, para que ninguna lea archivos a medias. Con `--changed` y `--staged`, un generador solo corre si la ejecución toca uno de sus orígenes o de sus salidas; con `--all`, siempre. Specty detecta dos generadores:

- Prisma, en un stack TypeScript o JavaScript con `prisma`. Toma los bloques `generator` con `output` de `prisma/schema.prisma`, `schema.prisma` o `prisma/schema/*.prisma`, relativos a su schema, y lo ejecuta con el gestor del proyecto (`npx prisma generate`, `pnpm exec prisma generate`…). El cliente en `node_modules` no cuenta: no está en el repositorio.
- build_runner, en un stack Dart con `build_runner` en el `pubspec.yaml`, con `dart run build_runner build --delete-conflicting-outputs`. Genera lo de `scope.generated` o, sin él, `*.g.dart`, `*.freezed.dart`, `*.gr.dart` y `*.mocks.dart`, y corre cuando la ejecución toca un archivo que declara un `part` generado, `pubspec.yaml` o `build.yaml`.

`checks.generators` añade otros, cada uno con su `command`, sus `outputs` y, si quiere, sus `inputs`.

En todos los stacks salvo Elixir, `function-lines` y `complexity` miden cada función sin un linter. En TypeScript y JavaScript (`.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.jsx`), Java, C#, PHP, C (`.c`, `.h`), C++ (`.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh`), Go, Rust, Swift y Dart, la miden sobre su árbol de sintaxis de tree-sitter ([ADR 0016](decisions/0016-tree-sitter-para-medir-las-funciones.md); `core/src/checks/functions-tree.ts`, con la tabla de cada lenguaje en `tree-languages*.ts`). Una función es una declaración, un método, un constructor, un accesor, un getter o un setter, una lambda, una closure o una función anónima (en Dart, la firma y su cuerpo, que son nodos hermanos); empieza en su primer token que no está en un decorador, una anotación, un atributo o un comentario. El nombre es el suyo (en C y C++, al final de su declarador; de `A::run`, `run`) o, si no tiene, el de la variable, la propiedad, la clave o el campo que la recibe. Cuentan como ramas también el `elseif` de PHP, los `and` y `or` de PHP y C++ y el `guard` de Swift; un `default` no cuenta, ni los brazos de `match` de Rust, que la estimación tampoco contaba. Si el lenguaje no tiene gramática, o la versión de partida o la actual de un archivo tienen errores de sintaxis, miden las dos versiones con la estimación propia del core: una para los lenguajes de llaves, otra para Python (`core/src/checks/functions-python.ts`) y otra para Ruby (`functions-ruby.ts`). Las dos medidas cuentan las líneas de código de la cabecera a la llave de cierre, sin blancos ni comentarios, y la complejidad ciclomática: 1 más cada `if`, `for`, `while`, `case`, `catch`, `guard`, `&&`, `||`, `??` y ternario, sin los de las funciones anidadas. En Python, una función va de su `def` o `async def`, con su cabecera aunque ocupe varias líneas, a la última línea de código más indentada que ella; no cuentan los docstrings ni las líneas dentro de una cadena de varias líneas, y las ramas son `if`, `elif`, `for`, `while`, `except`, `case`, `and` y `or`. En Ruby va de su `def` al `end` que la cierra, contando los bloques que abren `def`, `class`, `module`, `begin`, `do` y un `if`, `unless`, `while`, `until`, `case` o `for` al principio de la sentencia o tras un `=` (nunca un modificador); `def x = expr` ocupa una línea, y las ramas son `if`, `elsif`, `unless`, `while`, `until`, `for`, `when`, `rescue`, `and`, `or`, `&&`, `||` y el ternario, también los modificadores. Una función falla si el cambio la tocó, pasa de `checks.functions` (`maxLines`, `complexity`) y es nueva o creció respecto al punto de partida, emparejada por nombre y por orden entre las de ese nombre; las que no tienen nombre, por orden entre ellas. Una que ya pasaba del límite y el cambio no agrandó no cuenta; con `--all`, cuentan todas. Los archivos de test no se miden. No usan las reglas de ESLint, porque ESLint no sabe cómo era la función antes del cambio.

En cualquier stack salvo Dart, `suppressions` falla con cada comentario o anotación que el cambio añade para apagar el compilador, el comprobador de tipos o el linter. Usa un catálogo por familia de lenguajes, según la extensión de cada archivo (`core/src/checks/suppressions.ts`), sacado de la documentación de cada herramienta:
- Python: ruff, flake8, mypy, pyright y pylint.
- JavaScript y TypeScript: ESLint y Biome.
- Java y Kotlin: `@SuppressWarnings`, `@Suppress`, SpotBugs, Checkstyle y Sonar.
- C#: `#pragma warning disable`, `#nullable disable`, `SuppressMessage` y ReSharper.
- Go: golangci-lint, staticcheck y gosec.
- Rust: `#[allow]` y `#[expect]`.
- PHP: PHPStan, PHP_CodeSniffer, Psalm y PHPMD.
- Ruby y Elixir: RuboCop y Credo.
- Swift: SwiftLint y swift-format.
- C y C++: clang-tidy y los `#pragma`.

Las marcas que son comentarios solo cuentan dentro de un comentario, y las que son código, fuera de las cadenas. En Python, Ruby y Elixir, el comentario empieza en el primer `#` fuera de una cadena de una línea. Una directiva de herramienta debe abrir el comentario, salvo `NOSONAR`, `NOLINT` y `#nosec`, que cuentan en cualquier punto. `@ts-ignore` y `@ts-nocheck` son de `strict-types`, y el `// ignore:` de Dart, de `dart-strict`. La lista completa está en la guía ([checks.md](checks.md)).

Después vienen, para cualquier lenguaje, estas verificaciones, cada una con su id en `checks.levels`:

- `max-lines`: las líneas de código de cada archivo, con los límites de `lines`.
- `focused-tests`: un test enfocado deja sin correr a los demás (`describe.only`, `fit`, `solo: true` de Dart, `focus: true` de RSpec, `FIt` y `Focus` de Ginkgo, `->only()` de Pest).
- `skipped-tests`: un test apagado con una marca (`it.skip`, `xit`, `skip:` de Dart, `@pytest.mark.skip`, `@unittest.skip`, `#[ignore]`, `@Disabled`, `@Ignore`, `enabled = false` de TestNG, `[Ignore]`, `Skip = "…"` de xUnit). No cuentan los saltos condicionales, que decide el propio test (`test.skipIf`, `@pytest.mark.skipif`, `t.Skip()`, `pytest.skip()`).
- `todo`: una marca de `checks.todo.markers` que empieza un comentario (`//`, `/*`, `*` a principio de línea, `#`, `--`, el de HTML, `;` o `%`) sin nada que case con `checks.todo.reference` en el resto de la línea. Por defecto vale `#12`, `acme/app#12`, una clave como `ABC-12` o un enlace. Una configuración con una `reference` que no es una expresión regular no se acepta.

- `tests-locked`: un test de `lockedTests` de algún cambio abierto de la carpeta que ya no coincide con su hash, o que falta. No aparece donde ningún cambio tiene tests aprobados.
- `secrets`: los secretos, con Betterleaks o, si no está, gitleaks. Specty le pasa al escáner una copia temporal de los archivos de la ejecución, tal como los ve el modo, junto a `.gitleaks.toml`, `.gitleaksignore` y `.betterleaksignore` de la raíz; a Betterleaks le pasa `.betterleaks.toml` con `--config`, porque no lo carga solo, salvo que el entorno defina `BETTERLEAKS_CONFIG` o `BETTERLEAKS_CONFIG_TOML`. El escáner siempre recibe `--redact`, así que el secreto no llega ni al informe ni a la salida. Primero prueba Betterleaks 2 (`fs`), después la forma de gitleaks (`dir`), que es la de Betterleaks 1, y por último gitleaks. Si no hay ninguno, la verificación no corre (`SIN EJECUTAR`) y `--verbose` dice qué instalar; si el escáner falla, tampoco, con su último mensaje como motivo. Para un falso positivo valen los comentarios `betterleaks:allow` o `gitleaks:allow` y los archivos de ignorados de cada escáner.
- `diff-coverage`: qué parte de las líneas ejecutables que añade la ejecución ejecutó algún test, según el informe de cobertura que dejaron los tests del proyecto en esa misma ejecución. Corre después de las demás y solo lee los informes de `checks.coverage.reports` modificados desde que empezó, así que sin los tests (como en `task done` con verificación propia) o con un informe de antes no aparece. Lee LCOV (`SF:`, `DA:`), Cobertura (`<source>`, `<class filename>`, `<line number hits>`), JaCoCo (`<package name>`, `<sourcefile name>`, `<line nr ci>`) y el perfil de Go (`archivo:l1.c1,l2.c2 sentencias veces`); una línea medida en varios informes cuenta como ejecutada si lo fue en alguno. Una ruta absoluta dentro del repositorio pasa a relativa, y una relativa se ancla a la carpeta más profunda del informe donde existe ese archivo (los paquetes de un monorepo); si no, el archivo se empareja por el final de su ruta, con la coincidencia más larga (un módulo de Go, la carpeta de fuentes de Java, otra copia del repositorio). Las líneas que ningún informe mide no cuentan; sin ninguna medida, no aparece. Por debajo de `checks.coverage.warn` es un aviso, y por debajo de `checks.coverage.error`, un fallo: una línea con el porcentaje y una por tramo sin ejecutar (`ruta:línea`), con los tramos cortados por las líneas ejecutadas. La verificación completa que anota Specty también la mide, con sus propios informes, y la deja en `change.verified` (§4) para la aceptación.

Las dos de tests solo miran los archivos de test (por nombre o por carpeta, como `scope.implicitTests`). Las carpetas de tests son `test`, `tests`, `__tests__`, `__snapshots__`, `integration_test`, `spec` y `specs`; estas dos últimas, las de RSpec, solo fuera de una carpeta de código (`src`, `lib`, `app` o `main`), así que `spec/models/user_spec.rb` es un test y `src/spec/parse.ts` no. Con `--changed` y `--staged`, las tres de marcas y `secrets` solo miran las líneas que el cambio añade según `git diff -U0`; con `--all`, todas. Con `--staged`, todas las verificaciones leen lo preparado, no lo que hay en el disco.

`specty check --install` prepara el proyecto para sus verificaciones, y la persona decide cada paso en su terminal. Por cada archivo muestra el diff (`git diff --no-index` entre el antes y el después) y pregunta antes de escribirlo. Sin terminal interactiva se niega, porque escribe `.specty/config.yaml`, y con `--dry-run` solo enseña el plan, sin preguntar ni escribir. Los pasos son:

- `.specty/config.yaml`: `checks.preCommit: true`, conservando el resto del archivo y sus comentarios.
- `.github/workflows/specty-check.yml`: la plantilla de GitHub Actions. Prepara el stack (Node 22, pnpm, Flutter o Dart, y el comando de instalación detectado), ejecuta `npx -y @baquia-dev/specty@<versión> check --all --json` con la versión exacta del CLI que la escribe, y guarda el JSON como artefacto. En los pull requests ejecuta también `specty ci` con la misma versión, que lee el evento ([checks.md](checks.md#commits-trazables-specty-ci)). Las demás plataformas de CI se añaden como plantillas en `check/ci.ts`.
- En Dart, `analysis_options.yaml`: los modos estrictos que falten bajo `analyzer.language`, sin tocar sus `include` ni comentarios; si no existe, lo crea.
- Junto al guard de Claude Code (`Stop`), Cursor (`stop`), Codex (`Stop`, en `.codex/hooks.json` del proyecto), Gemini CLI (`AfterAgent`, en `.gemini/settings.json`, con el límite en milisegundos), Devin (`Stop`, en la raíz de `.devin/hooks.v1.json`) y Antigravity (`Stop`, en el hook `specty` de `.agents/hooks.json`): el hook de fin de turno `specty hook agent-stop <agente>`, con el mismo comando de Specty que el guard y el tiempo límite de `verify.timeoutSec` (ARCHITECTURE §10). En OpenCode, el plugin de Specty se vuelve a escribir con `STOP` igual a ese tiempo límite, y desde entonces ejecuta el hook en cada `session.idle`.
- Para cada agente que el repositorio usa (por sus marcas de ARCHITECTURE §10), sus exclusiones con los globs de `checks.exclude` y `scope.generated`, para que no lea dependencias, artefactos de build ni código generado. Van en `.cursorignore` (Cursor), en `.geminiignore` (Gemini CLI), en `.antigravityignore` (Antigravity), en el archivo de Windsurf que exista (`.devinignore`, `.windsurfignore` o `.codeiumignore`; si no hay ninguno, `.codeiumignore`), como reglas `Read(<patrón>)` en `permissions.deny` de `.claude/settings.json` (Claude Code) y como `"<patrón>": "deny"` en `permission.read` de `opencode.json` u `opencode.jsonc` (OpenCode, que también recibe cada patrón con `**/` sin ese prefijo). Solo se añaden los patrones que faltan, y lo demás queda. Copilot y Codex no tienen un archivo de exclusión propio en el repositorio. Los cambios archivados (`.specty/archive/**`) salen solo del índice, siempre y bajo su propio comentario: en `.cursorindexingignore` (Cursor) y en `.antigravityignore` (Antigravity). Nunca van a las exclusiones que además impiden leer, porque el agente aún puede necesitar abrir un cambio archivado.
- Con `checks.layers` en TypeScript o JavaScript y sin dependency-cruiser, este como devDependency con su versión exacta (`dependency-cruiser@18.7.0`), con el gestor del proyecto (`npm install --save-dev --save-exact`, `pnpm add --save-dev --save-exact`, `yarn add --dev --exact` o `bun add --dev --exact`), solo si la persona lo confirma.

Los pasos planifican uno tras otro sobre los mismos archivos, así que dos pasos que tocan el mismo archivo (el hook de fin de turno y las reglas `Read` de Claude Code) dan un solo diff. Lo que la persona ya decidió distinto (`checks.preCommit: false`, un modo estricto en `false`, una plantilla de CI con otro contenido) es un conflicto: se informa y no se toca. Lo que se aplica entra en un commit con recibo, `Specty-Init`, solo con los archivos que no tenían cambios de la persona y nunca dentro de un cambio activo. Ejecutarlo otra vez, con todo aplicado, dice que no hay nada que instalar. Betterleaks y gitleaks no son paquetes del proyecto: si faltan, el comando dice que se instalen.

`specty check --spec [id]` añade las verificaciones del plan aprobado de un cambio: el de `id` o, sin él, el activo de la carpeta. Comparan el diff de la ejecución con el plan, así que no se combinan con `--all`. La aprobación sigue en `state.json`, que el agente no puede escribir, y el alcance es el mismo que usa `task done`:

- `spec-approved`: la spec está aprobada y no cambió desde entonces; el cierre, que llega después, no cuenta. Falla si no está aprobada, si cambió, si el cambio está cancelado o si no existe. Sin cambio, es la única que aparece.
- `scope`: cada archivo que el diff toca o borra está en «Archivos» (con el origen de los renombrados), en los `files` de alguna tarea o en una ampliación aprobada; los tests implícitos y los generados entran solos. Lista cada ruta que queda fuera.
- `dependencies`: cada dependencia que el diff añade a un manifiesto casa con `allowedDependencies` del frontmatter, por nombre o por glob. Lee, en cualquier carpeta, `package.json` (`dependencies`, `devDependencies`, `peerDependencies` y `optionalDependencies`), `pubspec.yaml` (`dependencies` y `dev_dependencies`, sin los paquetes del SDK como `sdk: flutter`), `requirements*.txt`, `pyproject.toml` (PEP 621, sus extras, los grupos de PEP 735 sin `include-group` y Poetry), `go.mod` (sin `// indirect`), `Cargo.toml`, `Gemfile`, `composer.json` (sin los paquetes de plataforma), `pom.xml` (sin `<dependencyManagement>`, `<build>` ni `<reporting>`), `build.gradle(.kts)`, `gradle/libs.versions.toml`, los `.csproj`, `.fsproj` y `.vbproj`, `Directory.Packages.props` y `Package.swift`. En Java y Kotlin el nombre es `grupo:artefacto`, y en Swift, el último tramo de la `url` del paquete. Los lectores de TOML y XML (`core/src/checks/manifests-*.ts`) leen solo lo que necesitan, sin un parser completo. Solo cuentan los nombres nuevos respecto al punto de partida: un cambio de versión no; un manifiesto nuevo, con todas sus dependencias. Un manifiesto que no se puede leer no da ninguna. Cada ecosistema nuevo es un lector más en `core/src/checks/dependencies.ts`.
- `fix-tests`: cada tarea `fix` activa o hecha tiene en el diff un test suyo, de sus `files`, de sus ampliaciones o junto a ellos; justo en la raíz de la carpeta de tests, solo el que lleva el nombre de uno de sus archivos. Con `--staged` solo cuenta la activa, porque la hecha ya hizo su commit.
- `criteria-tested`: avisa de cada criterio de una tarea `feat` o `fix` activa o hecha (las que tienen la regla de tests `first`; ver `testRules`) que ninguna línea añadida a un archivo de test de la ejecución nombra. El id cuenta en el nombre de un test o de su grupo y en una línea de comentario, escrito como en la spec (`AC2`, que no cuenta para `AC20`), por `criterionMarks` de `core/src/checks/markers.ts`. El nombre está en la línea que declara el test (el catálogo de `testCases`, más `describe`, `context`, `suite`, los nodos de Ginkgo, `t.Run("…"` de Go y `test "…"` de Elixir) y, si la declaración es una anotación (`@`, `[`, `#[`), en las anotaciones que la siguen y en la firma. Los datos de un fixture y el cuerpo de un test no cuentan. Un criterio con `test: manual` no necesita test, y con `policy.tests: off` no avisa de ninguno. Con `--staged` solo cuenta la tarea activa. Solo avisa, salvo con `policy.tests: contract`, donde falla (ADR 0014).
- `tests-removed`: avisa, sin hacer fallar nunca, de cada test que el diff borra y de cada test con menos casos que en el punto de partida (el merge-base o HEAD). Los casos se cuentan con un catálogo de declaraciones por familia de frameworks (`it(`, `test(`, `testWidgets(`, `def test_`, `func Test`, `@Test`, `[Fact]`, `#[test]`…); su nivel solo sirve para apagarlo.

`specty task done` ejecuta `specty check --changed --spec` con el cambio activo: tras comprobar el alcance de la tarea y el tamaño de sus archivos, y antes de su verificación, para que lo barato falle primero. Deja fuera `scope` y `max-lines`, que `task done` ya comprueba por tarea. Si la tarea tiene verificación, deja fuera también `format`, `lint`, `typecheck` y `tests`: esa verificación es como la persona ejecuta los comandos del proyecto en cada tarea, y así los tests no corren dos veces. `propose` exige una verificación a cada tarea, así que solo faltan si la persona quita `verify.default` después de aprobar. Si falla una verificación de nivel error, la tarea no se completa: la tarjeta es la de verificación fallida, con el comando y el informe como salida. Los avisos no bloquean, y su informe sale por la salida de error antes de la tarjeta. Con `policy.tests: contract`, una tarea `refactor` o `perf` que quita aserciones de un test que ya existía no se completa: `task done` dice cuántas y de qué test, antes de la verificación (ADR 0014); sin `contract`, es un aviso de la aceptación. Cada verificación se suaviza con `checks.levels`; por ejemplo, `fix-tests: warn` deja completar una tarea `fix` sin test, con un aviso.

`git.worktrees` (por defecto `true`) hace que `specty new` cree cada cambio en su propia worktree; con `false`, `new` cambia la rama de la carpeta actual (ARCHITECTURE §9). `git.setup` es el comando que prepara cada worktree nueva, normalmente instalando las dependencias. Sin la clave, Specty usa el del stack que detecta en la carpeta:

- pnpm: `pnpm install --prefer-offline`; npm: `npm install`; yarn: `yarn install`; bun: `bun install`.
- Flutter: `flutter pub get`; Dart: `dart pub get`.
- uv: `uv sync`; Poetry: `poetry install`; PDM: `pdm install`; Pipenv: `pipenv install --dev`.
- Bundler: `bundle install`; Composer: `composer install`; Mix: `mix deps.get`; Go: `go mod download`.

Los demás stacks no lo necesitan, porque su build trae las dependencias. Con `false`, no se ejecuta nada.

`git.target` es la rama de la que parten los cambios nuevos y a la que se incorporan al cerrar. Sin la clave, es la rama principal detectada (ARCHITECTURE §9). Si la clave nombra una rama que no existe en local, `new` se bloquea y `close` cierra sin incorporar: Specty no recurre a la principal.

`git.flow` dice cómo nombra `new` la rama de cada cambio, con el tipo de `--type` (un tipo de commit, `feat` por defecto) y el título sin la fecha. `specty`, el valor sin la clave: `specty/<id>`. `github` y `trunk`: `<tipo>/<slug>`, como `fix/login-con-google`. `gitflow`: `bugfix/<slug>` para un `fix` y `feature/<slug>` para los demás. Un spike va en `spike/<id>` con `specty` y en `spike/<slug>` con los otros. Si la rama ya existe, en local o en un remoto, `new` le añade `-2`, `-3`…; el id del cambio no cambia. Cada rama queda ligada a su cambio en la configuración de git (`branch.<rama>.specty`), que es como Specty sabe el cambio de una rama que no lleva el id y cuáles borra `specty prune` cuando ya están incorporadas (ARCHITECTURE §9). Con `github`, `trunk` o `gitflow`, el SIGUIENTE de `next` sin cambio activo pide `--type`.

`git.branchPattern` nombra las ramas con un patrón propio, por encima de `git.flow`: `{type}` es el tipo de commit tal cual (`fix`, no `bugfix`; `spike` en un spike), `{slug}` el título sin la fecha y `{id}` el id del cambio. Así, `team/{type}-{slug}` da `team/fix-login-con-google` y `JIRA/{id}` da `JIRA/20261027-login-con-google`. El patrón tiene que llevar `{slug}` o `{id}`, ningún otro marcador, y formar un nombre que git admita: sin espacios, `..`, `~^:?*[\`, `//` ni `@{`, sin `/` ni `-` al principio, sin `/` ni `.` al final, y sin un componente que empiece por `.` o termine en `.lock`. Si no, la configuración no es válida y ningún comando se ejecuta. `next` pide `--type` si el patrón lleva `{type}`, sea cual sea `git.flow`.

## 7. Trailers de commit

```text
feat(analytics): rediseñar la tarjeta de evolución

Specty-Change: 20261020-evolucion-academica
Specty-Task: T2
Specty-Spec: r3@4be1c2d
Specty-Agent: claude-code
```

| Commit | Trailers |
| --- | --- |
| Tarea | `Specty-Change`, `Specty-Task`, `Specty-Spec` (revisión@hash corto), `Specty-Agent` |
| Spec aprobada | `Specty-Change`, `Specty-Spec` |
| Tests enviados en la fase de tests (`test(<módulo>)`) | `Specty-Change`, `Specty-Spec`, `Specty-Tests: true`; la matriz de aceptación cuenta sus líneas (ARCHITECTURE §13) |
| Merge de la incorporación al cerrar; archivo al cerrar, cancelar o aceptar un quick | `Specty-Change` |
| Decisión que el agente toma en modo delegado (las dos filas anteriores) | Además, `Specty-Delegated: true` y `Specty-Agent`; los commits de las tareas no lo llevan (ADR 0010) |
| Manual dentro del alcance | `Specty-Change`, `Specty-Manual: true` |
| Retro | `Specty-Change` (del cambio retro o del activo), `Specty-Retro: true` |
| Spike | Además, `Specty-Kind: spike`; el CI impide fusionarlo a la rama principal |
| Instalación (`init`) | Solo `Specty-Init: true`: no pertenece a ningún cambio |

## 8. Bloque de AGENTS.md

```markdown
<!-- specty:begin id=project -->
## Proyecto (detectado por Specty)
- Stack: TypeScript (pnpm)
- Paquetes: packages/cli, packages/core
- Comandos:
  - Tests: `pnpm test`
  - Check: `pnpm check`
<!-- specty:end id=project -->

<!-- specty:begin id=flow -->
## Flujo de trabajo (Specty)
Este repositorio usa Specty. Antes de crear, modificar o borrar código, ejecuta `specty next` y sigue su salida hasta la línea `SIGUIENTE:`. Habla con el usuario en español.
- Si el usuario pide un cambio y no hay uno activo, `specty next` te indica cómo crear la spec.
- Cada cambio vive en su propia carpeta (una worktree): tras `specty new`, trabaja en la carpeta que indica, no en la principal.
- Completa cada tarea con `specty task done <id>`; no ejecutes `git commit` tú mismo.
- Si necesitas un archivo fuera del alcance de la tarea, pídelo con `specty scope add`.
- Aprobar, aceptar y cerrar lo hace el usuario en su terminal; tú se lo pides y terminas tu turno. Solo si `SIGUIENTE:` te lo pide (modo delegado), los ejecutas tú.
- Si el comando `specty` no existe, usa `npx -y @baquia-dev/specty <comando>`. Nunca uses `npx specty`: es otro paquete.

## Reglas (Specty)
- `specty task done` ya ejecuta `specty check --changed --spec` y la verificación de la tarea, y no la completa con fallos: no los repitas justo antes; corrige lo que devuelva y no reportes con fallos pendientes.
- Antes de crear un módulo, caso de uso, componente o pantalla, busca uno equivalente en el repo y replica su estructura.
- Localiza el código con búsquedas dirigidas por símbolo o texto y lee solo los fragmentos necesarios, no archivos completos; pide juntas, en la misma respuesta, las lecturas y búsquedas que no dependen entre sí.
- Edita con cambios puntuales; no reescribas archivos completos para cambios pequeños.
- Reporte final breve: qué cambió, qué se verificó y qué queda pendiente.
<!-- specty:end id=flow -->
```

Lo que está fuera de los marcadores pertenece a la persona y Specty no lo modifica. Los bloques van en el idioma de `language`, y la primera línea le pide al agente hablar con el usuario en ese idioma, el mismo de las salidas de Specty. Las reglas del bloque son solo las que no puede verificar una herramienta: lo demás lo verifica `specty check`, que `task done` ejecuta (§6, [ADR 0012](decisions/0012-lo-verificable-lo-verifica-specty.md)). Un AGENTS.md nuevo empieza además con las secciones «Mapa» y «Convenciones», con pistas para completarlas a mano; la de «Convenciones» pide no escribir lo que ya verifica `specty check`. Cuando exista la UI (fase 2), la línea de aprobación remitirá también a ella. La línea de aprobar, aceptar y cerrar menciona el modo delegado ([ADR 0010](decisions/0010-modo-delegado.md)): mientras está activo, es el `SIGUIENTE:` de cada tarjeta el que le pide al agente que lo haga él. Si el repositorio registra el servidor MCP de Specty, el bloque de flujo lleva tras su primera línea una más: «- Si tienes las herramientas MCP de Specty (`specty_next`, `specty_new`, `specty_task_done`…), úsalas en lugar del comando que hace lo mismo: así el chat muestra el cambio.» Sin ella, el agente ejecuta los comandos en la terminal y la vista del chat no sale (ARCHITECTURE §6).

## 9. Salida de los comandos

`specty propose`, con la spec válida:

```text
SPECTY · 20261020-evolucion-academica · review · revisión 1
SPEC VÁLIDA · tamaño M (3 archivos, 2 módulos, sin tests en analytics)
ESFUERZO RECOMENDADO (Claude Code): implementación medium · revisiones de la spec y del alcance: high
AVISO: T1 no incluye tests (política: recommended).
SIGUIENTE: dile al usuario que la spec está lista en http://localhost:4777/c/20261020-evolucion-academica, con su tamaño y el esfuerzo recomendado, y termina tu turno.
```

`specty next` en revisión, cuando la persona rechazó un supuesto y pidió cambios:

```text
SPECTY · 20261020-evolucion-academica · review · revisión 2
SUPUESTOS RECHAZADOS:
  A2 «"Por periodo" agrupa por trimestres académicos.» — Por periodo debe agrupar por trimestres, no por los periodos configurados.
CAMBIOS PEDIDOS:
  c1 · Diseño «Container redondeado»: Usa CaChip para la leyenda, no un Container.
SIGUIENTE: corrige .specty/changes/20261020-evolucion-academica/spec.md y ejecuta `specty propose`.
```

`specty next` en implementación (tarjeta de tarea):

```text
SPECTY · 20261020-evolucion-academica · implementing · tarea 2 de 2
TAREA T2: Rediseñar la tarjeta de evolución
ARCHIVOS PERMITIDOS:
  lib/features/analytics/analytics_estudiante_dashboard_cards.dart
  test/features/analytics/evolucion_card_test.dart
  + tests y archivos generados junto a ellos
CRITERIOS:
  AC1: CUANDO el estudiante elige "Histórico anual" ENTONCES el gráfico muestra un punto por mes para cada materia.
  AC2: CUANDO el estudiante toca un chip de la leyenda ENTONCES esa serie se oculta o se muestra sin recargar la vista.
CONVENCIONES: lib/features/AGENTS.md
HECHO: T1 Modelo EvolucionSerie y enum de filtro temporal (a1b2c3d)
VERIFICACIÓN: flutter test test/features/analytics
ESFUERZO SUGERIDO: medium
SIGUIENTE: implementa T2 y ejecuta `specty task done T2 --summary "<qué hiciste>"`.
```

`specty task done` bloqueado (código de salida 2):

```text
SPECTY · 20261020-evolucion-academica · implementing · tarea 2 de 2
BLOQUEADO: archivos fuera del alcance de T2:
  lib/core/theme/ca_colors.dart
SIGUIENTE: revierte ese archivo o pide ampliar el alcance con `specty scope add lib/core/theme/ca_colors.dart --task T2 --reason "<motivo>"`.
```

## 10. Exportadores

| Specty | OpenSpec | Spec Kit | Kiro |
| --- | --- | --- | --- |
| Carpeta | `openspec/changes/<id>/` | `specs/<id>/` | `.kiro/specs/<nombre>/` |
| Objetivo, Fuera de alcance | `proposal.md`: Why, What Changes (los archivos), Impact y Out of Scope | `spec.md`: la historia de usuario y Out of Scope | `requirements.md`: Introduction |
| Supuestos | `design.md`: Assumptions | `spec.md`: Assumptions | `design.md`: Assumptions |
| Criterios | `specs/<nombre>/spec.md`: `ADDED Requirements`, un `### Requirement:` y un `#### Scenario:` con **WHEN** y **THEN** por criterio | `spec.md`: escenarios **When**/**Then** numerados y requisitos funcionales FR-001… | `requirements.md`: un requisito con su historia de usuario y criterios EARS numerados (`WHEN … THE SYSTEM SHALL …`) |
| Diseño, Archivos, Riesgos | `design.md` | `plan.md`: Summary, Design, Project Structure y Risks | `design.md`: Overview, Architecture, Components and Interfaces y Risks |
| Tareas | `tasks.md`: `- [x] 1.1 …`, marcadas si están hechas | `tasks.md`: `- [ ] T001 [US1] … in <rutas>` | `tasks.md`: `- [ ] 1. …`, con sus archivos y `_Requirements: 1.2_` |

`<nombre>` es el id del cambio sin su fecha. Los encabezados y las palabras clave de cada formato (WHEN, THEN, SHALL) van en inglés, como los espera cada herramienta, y el texto de la spec va tal cual, en su idioma. Un criterio `CUANDO … ENTONCES …` (o `WHEN … THEN …`) se parte en su condición y su resultado; uno de otra forma va entero como resultado. Lo hace `packages/exporters` (`exportSpec`), que devuelve rutas y contenidos sin escribir nada. El mapeo parte de la documentación pública de cada formato, consultada al implementarlo (octubre de 2026).

**Importación desde OpenSpec** (`specty import <carpeta>`). Usa el mapeo inverso:

- `parseOpenSpec` (`packages/exporters`) lee los archivos de la carpeta.
- `importedSections` (`core/src/cards/import.ts`) los pone en las palabras de la spec.
- `specTemplate` los escribe en lugar de las pistas de esas secciones.

| OpenSpec | Spec |
| --- | --- |
| El `#` de `proposal.md`, sin «Change:» ni «Proposal:» | Título (sin él, el nombre de la carpeta) |
| Why y What Changes | Objetivo |
| Out of Scope | Fuera de alcance |
| Cada `#### Scenario:` con WHEN y THEN (y GIVEN; AND se une a la cláusula anterior) | Un criterio `DADO … CUANDO … ENTONCES …` |
| Cada `- [ ]` de `tasks.md`, sin su numeración | Una tarea sin `files`, que añade el agente |
| `design.md`, las demás partes de la propuesta, los requisitos sin escenario, los escenarios incompletos, los requisitos de REMOVED y las tareas `- [x]` | Diseño, tal cual y con una etiqueta por grupo |

Supuestos y Archivos conservan su pista. La petición literal del cambio es «Importado de OpenSpec: <carpeta>», y la carpeta de origen no cambia. Los cambios archivados (`openspec/changes/archive/`) y las specs vivas (`openspec/specs/`) no se importan. Sin carpeta, `specty import` lista los cambios de `openspec/changes/` y, tras migrar el legacy, los de `.specty/legacy/changes/`, que tienen el mismo formato.
