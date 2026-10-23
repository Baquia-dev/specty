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
│  └─ revisions/r1.md, r2.md…  # instantánea de cada revisión propuesta
└─ archive/<año>/<id>/         # cambios cerrados o cancelados, misma estructura

.git/specty/                   # local, por worktree, nunca versionado
├─ receipts.json               # recibos de commit
├─ active                      # cambio activo cuando no hay rama por cambio
├─ shell/<tool_use_id>.json    # foto del árbol antes de cada comando de Bash del agente
└─ server.json                 # puerto y token de la UI en ejecución
```

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
timebox: 2h                           # solo spike
estimate:                             # opcional: ajuste del modelo al tamaño calculado
  adjust: +1
  reason: Agregación por periodos sin tests previos.
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

- **Criterios**: `CUANDO … ENTONCES …` o `WHEN … THEN …`; opcionalmente `DADO` / `GIVEN`.
- **Archivos**: una acción, una ruta o glob y el motivo. Acciones: `crear`, `modificar`, `borrar` o `renombrar origen -> destino` (también en inglés: create, modify, delete, rename). Se prefieren rutas explícitas; para el tamaño, un glob cuenta como sus coincidencias actuales más una.
- **Campos de tarea**:
  - `files` (obligatorio): rutas o globs incluidos en Archivos.
  - `ac` (obligatorio salvo en quick y spike): los criterios que cubre. Las tareas `refactor`, `test`, `docs` o `chore` pueden indicar `ac: —`.
  - `verify` (opcional si la configuración tiene una verificación por defecto).
  - `type` (opcional, por defecto `feat`): tipo de Conventional Commits.
  - `notes` (opcional).
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
- Un cambio `quick` supera sus límites, o un cambio supera los umbrales de división.

**Avisos**, que se muestran en la salida y en la UI:

- Un criterio no tiene un resultado observable o usa términos vagos ("rápido", "correctamente", "adecuado"…).
- Una tarea tiene más archivos de los recomendados, o su tarjeta supera el presupuesto de contexto.
- Una tarea de código no toca tests, si la política es `recommended`.

### Forma canónica y hash

- Los comentarios HTML de la plantilla (pistas para el agente) se eliminan en `propose`, salvo dentro de bloques de código.
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

- `approved.hash` debe coincidir con la forma canónica actual de `spec.md`. Si no coincide, nada avanza hasta que se proponga y apruebe una nueva revisión.
- `items[].decision` puede ser:
  - `pending`;
  - `confirmed` o `rejected`: lo decidió la persona;
  - `implicit`: se aceptó al aprobar la spec.

  Si el texto de un ítem cambia, su decisión vuelve a `pending`.
- `tasks[].status` puede ser `pending`, `active` o `done`. `scopeExtra` guarda las ampliaciones aprobadas.
- `items[].comment` (opcional) guarda por qué la persona rechazó un supuesto; el agente lo lee en `specty next`.
- `maxIds` guarda el número más alto usado por cada prefijo (también `S`, las solicitudes de alcance), para que un id borrado nunca se reutilice con otro significado.
- `closingSubmittedAt` (opcional) indica que el cierre ya se envió y espera la confirmación de la persona.
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

Una línea JSON por evento: `{ "ts", "actor": "agent" | "human" | "specty", "tool"?, "event", "data" }`. `tool` es la herramienta que declara el agente: sirve como contexto, no como prueba.

| Evento | Datos |
| --- | --- |
| `change.created` | carril, rama, origen (`follows`, `epic`) |
| `spec.proposed` | revisión, hash, tamaño, avisos |
| `assumption.decided` | ítem, decisión, comentario |
| `review.changes_requested` | revisión, ids de comentarios |
| `spec.approved` | revisión, hash, canal (`ui`, `tty`, `pr`), presencia verificada |
| `task.started` | tarea, commit base |
| `task.verified` | tarea, comando, código de salida, duración, final de la salida si falló |
| `task.completed` | tarea, commit, resumen |
| `scope.requested` / `scope.decided` | rutas, motivo, decisión (`auto` o persona); si es `auto`, `basis` (ruta → `test`, `generated` o `planned`) y `plannedFor` (ruta prevista → tareas que la listaban) |
| `adjust.requested` | petición literal |
| `adjust.classified` | clasificación por ítem: defecto, refinamiento o alcance nuevo |
| `change.verified` | la verificación completa (`verify.full`) antes de aceptar: comando, código de salida, duración, final de la salida si falló |
| `change.accepted` | revisión aceptada |
| `retro.confirmed` | hash del índice, modo (`agent` o `minimal`) |
| `change.closed` / `change.cancelled` | motivo, al cancelar |
| `integration.started` | incorporar la rama principal al cerrar dejó el merge para el agente: rama destino, su commit, motivo (`conflicts` o `verify`) y archivos en conflicto |
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

Un ancla puede ser un ítem (`{ "item": "A1" }`) o una cita dentro de una sección (`{ "section", "quote" }`). Los comentarios sin resolver llegan al agente en `specty next`.

## 6. `config.yaml`

```yaml
version: 1
language: es
mode: individual                  # individual | team
governed: ["lib/**", "test/**"]   # rutas donde rige el flujo
ignored: ["**/*.md", "docs/**", "assets/**"]
sensitive: ["lib/core/auth/**", "**/migrations/**", ".github/**"]
verify:
  default: flutter test
  full: flutter analyze && flutter test
  timeoutSec: 600
scope:
  implicitTests: true             # tests junto a los archivos del alcance
  generated: ["**/*.g.dart", "**/*.freezed.dart"]
  autoApprove: tests-and-generated  # none | tests-and-generated: tests, generados y lo que ya está en Archivos
lanes:
  quick: { maxFiles: 3 }
split: { maxTasks: 8, maxFiles: 15, maxModules: 2, taskMaxFiles: 5 }
size: { S: 4, M: 10, L: 18 }      # puntuación máxima de cada nivel; por encima de L es XL
policy:
  tests: recommended              # required | recommended | off
retro:
  mode: agent                     # agent | minimal
git:
  branchPerChange: true
  worktrees: true                 # cada cambio en su propia worktree (necesita branchPerChange)
  setup: "pnpm install --prefer-offline"  # prepara cada worktree nueva; false: nada; sin la clave: el comando del stack
team:                             # solo con mode: team
  approvers: []
  requirePrReview: true
ui:
  port: auto
  requireUserPresence: false      # WebAuthn (fase 4)
```

Specty escribe `.specty/` con su propio formato. Si el repositorio usa un formateador, debe excluir esa carpeta: `"!.specty"` en `files.includes` de Biome, o `.specty/` en `.prettierignore`. `specty doctor` avisa cuando falta.

La tabla de esfuerzo por herramienta (`presets/effort.yaml`) viene con Specty y se puede sobrescribir con una clave `effort:` en este archivo.

`git.worktrees` (por defecto `true`) hace que `specty new` cree cada cambio en su propia worktree; con `false`, `new` cambia la rama de la carpeta actual (ARCHITECTURE §9). `git.setup` es el comando que prepara cada worktree nueva, normalmente instalando las dependencias. Sin la clave, Specty usa el del stack que detecta en la carpeta:

- pnpm: `pnpm install --prefer-offline`; npm: `npm install`; yarn: `yarn install`; bun: `bun install`.
- Flutter: `flutter pub get`; Dart: `dart pub get`.
- uv: `uv sync`; Poetry: `poetry install`; PDM: `pdm install`; Pipenv: `pipenv install --dev`.
- Bundler: `bundle install`; Composer: `composer install`; Mix: `mix deps.get`; Go: `go mod download`.

Los demás stacks no lo necesitan, porque su build trae las dependencias. Con `false`, no se ejecuta nada.

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
| Manual dentro del alcance | `Specty-Change`, `Specty-Manual: true` |
| Retro | `Specty-Change` (del cambio retro o del activo), `Specty-Retro: true` |
| Spike | Además, `Specty-Kind: spike`; el CI impide fusionarlo a la rama principal |

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
Este repositorio usa Specty. Antes de crear, modificar o borrar código, ejecuta `specty next` y sigue su salida hasta la línea `SIGUIENTE:`.
- Si el usuario pide un cambio y no hay uno activo, `specty next` te indica cómo crear la spec.
- Completa cada tarea con `specty task done <id>`; no ejecutes `git commit` tú mismo.
- Si necesitas un archivo fuera del alcance de la tarea, pídelo con `specty scope add`.
- Aprobar, aceptar y cerrar lo hace el usuario en su terminal; tú se lo pides y terminas tu turno.
- Si el comando `specty` no existe, usa `npx -y @baquia-dev/specty <comando>`. Nunca uses `npx specty`: es otro paquete.
<!-- specty:end id=flow -->
```

Lo que está fuera de los marcadores pertenece a la persona y Specty no lo modifica. Un AGENTS.md nuevo empieza además con las secciones «Mapa» y «Convenciones», con pistas para completarlas a mano. Cuando exista la UI (fase 2), la línea de aprobación remitirá también a ella.

## 9. Salida de los comandos

`specty propose`, con la spec válida:

```text
SPECTY · 20261020-evolucion-academica · review · revisión 1
SPEC VÁLIDA · tamaño M (3 archivos, 2 módulos, sin tests en analytics)
ESFUERZO RECOMENDADO (Claude Code): implementación medium · revisiones de la spec y del alcance: high
AVISO: T1 no incluye tests (política: recommended).
SIGUIENTE: dile al usuario que la spec está lista en http://localhost:4777/c/20261020-evolucion-academica, con su tamaño y el esfuerzo recomendado, y termina tu turno.
```

`specty next` en revisión, con comentarios:

```text
SPECTY · 20261020-evolucion-academica · review · revisión 2 · 1 comentario
COMENTARIOS:
  [Diseño] «Usa CaChip para la leyenda, no un Container.»
SUPUESTOS RECHAZADOS:
  A2 «Por periodo debe agrupar por trimestres, no por los periodos configurados.»
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
| Objetivo, Fuera de alcance | `proposal.md` | `spec.md` (resumen y alcance) | `requirements.md` (introducción) |
| Supuestos | `design.md` | `spec.md` (supuestos) | `design.md` |
| Criterios | `specs/<capacidad>/spec.md`: `ADDED Requirements` con escenarios WHEN/THEN | `spec.md` (requisitos funcionales y escenarios) | `requirements.md` (criterios EARS) |
| Diseño, Archivos, Riesgos | `design.md` | `plan.md` | `design.md` |
| Tareas | `tasks.md` | `tasks.md` (T001…, con rutas de archivo) | `tasks.md` (con referencias a requisitos) |

El mapeo parte de la documentación pública de cada formato y se valida contra su versión vigente al implementar cada exportador. La importación (al menos desde OpenSpec, para quienes vienen del legacy) usa el mapeo inverso.
