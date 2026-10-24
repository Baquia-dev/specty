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
| `packages/cli` (`@baquia-dev/specty`) | Comandos, almacén `.specty/`, git, hooks de git, adaptadores de agentes, detección, servidor local (HTTP + SSE), servidor MCP | El guard y los hooks usan un punto de entrada mínimo para arrancar rápido (`enforce/entry.ts`, §10) |
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
    ┌─────────────────┤                                          │
    │ sin tareas      ▼                                          │
    │ pendientes implementing ◄── scope add · decidir alcance*   │
    │                 │                                          │
    │     última tarea│                                          │
    │                 ▼                                          │
    └───────────► acceptance ──pedir ajustes (agente o persona)──► adjusting
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

**Incorporación pendiente.** Si incorporar la rama principal al cerrar (o al aceptar un quick) deja un merge para el agente (§9), la fase no cambia. Lo que cambia es el código gobernado: solo quedan abiertos los archivos que junta la fusión, con sus tests implícitos y los generados, y se espera al agente. La spec conserva el acceso de su fase. `specty next` muestra la incorporación antes que el trabajo de la fase.

**Invariante:** el agente solo ejecuta transiciones que envían trabajo o reducen sus propios permisos. Ninguna variable de entorno, flag ni modo de prueba habilita una acción humana desde la CLI del agente; los tests usan inyección de dependencias. En el legacy, `VITEST=1` o `NODE_ENV=test` habilitaban la aprobación sin TTY, y el guard solo bloqueaba el texto `specty approve`.

La única excepción es el modo delegado ([ADR 0010](decisions/0010-modo-delegado.md)). La persona lo activa desde su terminal con `specty delegate on`, después de leer una advertencia y confirmarla, y mientras dura el agente ejecuta esas acciones en su nombre. `delegate` en sí nunca lo ejecuta el agente: ni para activar el modo ni para desactivarlo.

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
| `specty new "<título>" [--request "<petición literal>"] [--kind] [--follows <id>] [--epic <id> --slice C1] [--from <rama>]` | Siempre (sin worktrees: sin cambio activo) | Crea el cambio, la rama y el esqueleto de la spec en una worktree nueva y preparada (§9). Con `git.worktrees: false`, en la carpeta actual, salvo con `--worktree`. `--request` guarda la petición del usuario tal cual en `change.created`, y la tarjeta del borrador se la muestra al agente: la spec responde a lo que se pidió, no a una paráfrasis |
| `specty propose` | draft, review, adjusting, closing | Valida la spec; calcula tamaño, delta y esfuerzo recomendado; la envía a revisión. Si la persona configuró `review.command` y la spec es L, XL o sensible, pide antes `specty review`, una vez por cambio |
| `specty review` | review, acceptance | Pasa a la revisión independiente que configuró la persona ([ADR 0011](decisions/0011-revision-independiente.md)) la spec, en revisión, o la spec y el diff de todo el cambio, en aceptación: otro modelo, sin herramientas ni más contexto. Guarda la respuesta en `reviews/` y la muestra; el agente corrige lo que sea real o se lo cuenta al usuario. La tarjeta de aceptación la pide para cambios L o XL o con avisos de aserciones o riesgos. Es información: no cambia la fase |
| `specty task done <T> --summary "<texto>" [--finding "<texto>"]` | implementing | Comprueba el alcance, ejecuta `verify.quick` (si existe) y el `verify` de la tarea, hace el commit y avanza. Cada `--finding` queda para las tareas y los cambios siguientes (§7) |
| `specty scope add <ruta…> --task <T> --reason "<texto>"` | implementing | Pide ampliar el alcance; se aprueba sola si la política lo permite |
| `specty adjust "<petición literal>"` | acceptance | Registra la petición y devuelve el protocolo de clasificación |
| `specty integrate` | Con una incorporación pendiente | Termina el merge de la rama principal que dejó el cierre: sin marcadores, dentro de sus archivos y con la verificación en verde, hace el commit de merge (§9) |
| `specty retro [--into <id>]` | Cualquiera | Devuelve el protocolo para documentar cambios ya hechos |

Comandos para la persona: `init`, `ui`, `status`, `prune`, `why <ruta>[:<línea>]`, `audit <id>`, `export <id> --to openspec|speckit|kiro`, `doctor`, `uninstall` y `ci`. `prune` también lo puede ejecutar el agente, porque solo borra lo ya incorporado (§9). También `approve [<cambio>] [--scope <S>]`, `reject [<cambio>] --scope <S>`, `accept [<cambio>]`, `close [<cambio>]` y `cancel [<cambio>]`, que exigen una TTY real (ninguna variable la simula) y son, hasta la fase 2, la forma de decidir. `close`, y `accept` en un cambio quick, también incorporan el cambio a la rama principal (§9).

Estas decisiones se toman desde cualquier carpeta del repo, porque cada cambio vive en su propia worktree. El comando elige el cambio en este orden:

1. El que se nombra con `<cambio>`.
2. El de la carpeta actual, si espera esa decisión.
3. El único que la espera en todas las worktrees. La salida dice cuál es y en qué carpeta está.
4. Si la esperan varios, el que la persona elige en la terminal.

Cada uno espera una decisión distinta:

- `approve`: la spec en revisión, o con `--scope S`, esa solicitud. `reject --scope S` espera esa misma solicitud.
- `accept`: un resultado en aceptación.
- `close`: un cierre enviado, o un cambio cerrado que no llegó a su rama destino.
- `cancel`: cualquier cambio abierto.

El comando se ejecuta en la worktree del cambio y con su configuración, como si la persona hubiera hecho `cd` allí. Si ningún cambio espera esa decisión, lo dice. Los comandos del agente nunca preguntan: actúan sobre el cambio de su carpeta. `status` muestra los cambios abiertos de todas las worktrees, cada uno leído en su carpeta, con la ruta de los que no son el de la carpeta actual; la copia de otro cambio que una rama heredó no cuenta.

`delegate on|off` activa o desactiva el modo delegado ([ADR 0010](decisions/0010-modo-delegado.md)), también solo desde una TTY. El interruptor vale para el clon y todas sus worktrees. Mientras está activo, el agente ejecuta esas acciones sin TTY, y la CLI responde por la persona: confirma, da por confirmados los supuestos de impacto alto pendientes y no escribe comentarios. Además, `accept` ejecuta siempre la verificación completa y no acepta si falla. La auditoría registra esas decisiones como del agente, por delegación. Con TTY sigue decidiendo la persona, aunque el modo esté activo.

Implementado en la fase 1: los siete comandos del agente (`retro` sin `--into`, que se registra como retro aparte) y `init`, `status`, `doctor`, `approve`, `reject`, `accept`, `close` y `cancel`. `ui`, `why`, `audit`, `export`, `ci` y `next --wait` llegan en fases posteriores.

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
  - las reglas de tests, según el tipo de la tarea y salvo con `policy.tests: off`: en `feat` y `fix`, primero el test que comprueba cada criterio, visto fallar; en `feat`, `fix`, `refactor` y `perf`, un test que ya existía y falla no se cambia para que pase: el agente para y se lo explica al usuario;
  - la verificación y el esfuerzo sugerido.

  Como respaldo determinista de esa regla, `task done` compara los tests que ya existían en el commit base de la tarea con el árbol de trabajo (`git diff -U0 -M`) y cuenta, por archivo, las aserciones quitadas menos las añadidas (`expect(`, `assert…`, `XCTAssert…`, `.should`, `t.Error`…; una aserción comentada cuenta como quitada). Si alguno pierde aserciones, la salida lo avisa, `task.completed` lo guarda y la tarjeta de aceptación y la nota de `specty accept` lo muestran. Es un aviso, no un bloqueo.

  `task done` avisa igual de los **riesgos del contenido**. Analiza lo que la tarea añade a los archivos gobernados que no son tests, con los nuevos incluidos: el diff va del commit base a un árbol con el trabajo actual (`treeWith`), sin tocar el índice. El catálogo (`core/src/scope/risk.ts`) tiene patrones de una línea con su CWE:
  - verificación TLS desactivada (CWE-295);
  - `eval` y `exec` (CWE-95);
  - deserialización insegura (CWE-502);
  - comandos por la shell (CWE-78);
  - MD5 o SHA-1 (CWE-328);
  - CORS abierto (CWE-942);
  - permisos para todos (CWE-732);
  - secretos en el código (CWE-798);
  - HTML sin escapar (CWE-79).

  También avisa de los archivos que pasan a modo 755 y de las rutas de pagos, webhooks o seguridad. Los patrones avisan de más antes que de menos, porque no bloquean: `task.completed` guarda `risks`, y la aceptación los muestra para que la persona los revise.
- **Tras compactar** (Claude Code: `SessionStart` con el matcher `compact`, al mismo `specty guard --tool claude-code`): el guard responde con lo que imprimiría `next`, y Claude Code lo añade al contexto, así que la tarjeta vuelve entera aunque el resumen la haya recortado. Solo tras compactar: al empezar, reanudar o limpiar, AGENTS.md ya pide ejecutar `next`. Fuera de un repositorio con Specty no añade nada.
- **Hallazgos**: lo que el agente descubre en una tarea y deben saber las siguientes, o el cambio que venga después, lo deja con `task done <T> --finding "<texto>"` (repetible), en `task.completed`. Las tarjetas de las tareas siguientes lo muestran en HALLAZGOS. La del cierre pide llevar a `### Pendientes` los que sigan abiertos.
- **Entre cambios**: un cambio de seguimiento (`new --follows <id>`) carga en su borrador los Pendientes del Cierre del anterior y los hallazgos de sus tareas, no su historial. Lo busca entre los cambios abiertos y archivados de su carpeta; si no lo encuentra, por ejemplo porque sigue abierto en otra worktree, el borrador lo dice.

## 8. Alcance

- `task done` compara el árbol de trabajo con el commit base de la tarea, incluidos archivos nuevos sin seguimiento y borrados.
- Permitido = `files` de la tarea + implícitos + ampliaciones aprobadas.
- **Implícitos** (configurables):
  - tests junto a los archivos del alcance, según el stack detectado (`*_test.dart`, `*.test.ts`, `test_*.py`…);
  - archivos generados declarados (`**/*.g.dart`, `**/*.freezed.dart`);
  - el lockfile, si el manifiesto (`package.json`, `pubspec.yaml`…) está en el alcance.
- **Rutas sensibles** (migraciones, auth, CI, infraestructura, configuración de Specty): nunca se aprueban solas.
- **Ampliación**: `scope add` evalúa la política. Con `tests-and-generated` aprueba sola los tests, los archivos generados y los que ya están en la sección Archivos de la spec aprobada (son alcance del cambio y solo cambian de tarea), salvo las rutas sensibles. Si no aplica, crea una solicitud que la UI muestra al momento. Mientras está pendiente, el agente puede seguir trabajando dentro de su alcance, pero no completar la tarea.
- Durante una tarea activa, todo cambio en el árbol se atribuye a esa tarea: Specty no distingue quién teclea.
- **Archivos compartidos:** `propose`, `approve` y `scope add` avisan («ARCHIVOS COMPARTIDOS») cuando un archivo gobernado del cambio aparece también en la sección Archivos, o en las ampliaciones aprobadas, de otro cambio abierto de otra worktree, leído en su carpeta. Las rutas con comodines encajan en los dos sentidos. Solo avisan, para que el posible conflicto se vea al planificar y no al incorporar; la documentación no cuenta.

## 9. Git

**Ramas.** Por defecto, cada cambio vive en `specty/<id>` (o `spike/<id>`). El cambio activo es el ligado a la rama de la carpeta. Con `git.branchPerChange: false`, el puntero vive en `.git/specty/active`, en local. Las ramas permiten trabajar cambios en paralelo con `git worktree`, y por eso no existe un archivo de estado global.

**Cambios en paralelo.** Una carpeta tiene una sola rama, así que trabaja un solo cambio. Por eso `specty new "<título>"` crea cada cambio en una worktree nueva, con su rama y su carpeta, y nadie trabaja en la carpeta principal. Con `git.worktrees: false`, `new` crea la rama en la carpeta actual, desde su rama, como antes, y `--worktree` pide la worktree para un cambio. En una worktree nueva:

- **Carpeta:** `<carpeta principal>.worktrees/<id>`, fuera del repositorio, para que las herramientas y los tests de la otra carpeta no la vean.
- **Base:** `--from <rama>` o, por defecto, la rama destino. Es `git.target` o, sin esa clave, la rama principal: la de `origin/HEAD` y, sin remoto, la primera que exista de `init.defaultBranch`, `main` y `master`. Nunca la rama actual, porque un cambio en paralelo no debe heredar el trabajo sin fusionar de otro. Si `git.target` nombra una rama que no existe, `new` se bloquea.
- **Lo que no mira:** el cambio en curso y el código sin spec de la carpeta actual, porque no los toca.
- **Hooks:** copia los archivos de hooks de agente que git no sigue (`.claude/settings.local.json`…). Los versionados llegan con la rama; los hooks de git y `.git/info/exclude` se comparten entre worktrees, y el estado local de `.git/specty/` es de cada una.
- **Preparación:** ejecuta allí `git.setup` o, sin esa clave, el comando de instalación del stack detectado (formats.md §6), y la salida lo nombra. Si falla, el cambio existe igual, y la salida muestra la cola y pide ejecutarlo allí.
- **El agente sigue allí:** el SIGUIENTE de `new` le pide cambiar a esa carpeta la de su sesión, o abrir allí un agente; el bloque de flujo de AGENTS.md lo dice también. El guard le impide escribir en otra worktree (§10).

Las worktrees que otras herramientas crean dentro del repositorio (Claude Code usa `.claude/worktrees/`) no cuentan como código sin spec ni entran en los commits de Specty.

**Incorporación.** Al cerrar un cambio, o al aceptar uno quick, Specty lo lleva a la rama destino en ese mismo comando. Es la misma que `new` usa como base: `git.target` o, sin esa clave, la rama principal. Si `git.target` nombra una rama que no existe, el cambio se cierra sin incorporarse. En lo que sigue, «la rama principal» es la rama destino. La rama principal solo avanza por fast-forward hasta código verificado, así que nunca recibe un conflicto: lo resuelve el cambio que llega después, en su rama y su carpeta.

1. Si la carpeta donde está la rama principal tiene cambios sin commit en archivos con seguimiento, el comando se niega antes de tocar nada.
2. Si la rama principal avanzó desde que empezó el cambio, se fusiona en la rama del cambio, en su carpeta (`git merge --no-ff --no-commit`), y se ejecuta `verify.full` (o `verify.default`). Solo con verde se hace el commit de merge, con recibo y `Specty-Change`. Con conflictos o en rojo, el comando no cierra y el merge queda en curso en la carpeta del cambio, para el agente:
   - `state.json` registra la incorporación pendiente (formats.md §3), con los archivos que cambió cada lado desde su base común. El guard solo deja tocar esos archivos (§4), y `specty next` le muestra al agente qué resolver.
   - El agente la termina con `specty integrate`, que exige que no queden marcadores de conflicto, que lo cambiado esté dentro de esos archivos y que la verificación pase. Entonces hace el commit de merge, que deja fuera `.specty/`, y marca la incorporación como resuelta.
   - Mientras tanto, `close` y `accept` piden decirle al agente «continúa». Si alguien aborta el merge, la incorporación pendiente se descarta y el comando la intenta de nuevo.
   - La persona repite el comando, y antes de confirmar ve el merge del agente y lo que resolvió.
   - En modo delegado, el agente lo hace todo: la salida le pide resolver la incorporación con `specty next` y `specty integrate`, y repetir él `close` (o `accept`), sin pasar por la persona.

   El reintento de un cambio ya cerrado (paso 4) aborta el merge en lugar de dejarlo para el agente; la persona incorpora la principal a mano en esa carpeta y repite el comando.
3. Se archiva el cambio como siempre.
4. La rama principal avanza por fast-forward: con `git merge --ff-only` en la carpeta donde está, o con `git update-ref` si no está en ninguna. Si falla (otra sesión la movió entre medias), el cambio queda cerrado y `specty close` reintenta solo la incorporación.
5. La worktree del cambio se borra con `git worktree remove`, sin `--force`, y la rama queda; si el cambio vivía en la carpeta principal, esa carpeta vuelve a la rama principal. Si cierra el agente (modo delegado) desde dentro de la worktree, la carpeta queda para no dejar su sesión en una carpeta borrada, y la salida le pide salir de ella (en Claude Code, `ExitWorktree`).

Solo se incorporan los cambios `standard` y `quick` con rama y en modo `individual`. Un `spike` no se fusiona, un `retro` no tiene rama, y las épicas y el modo `team` (que integra por PR) cierran como antes, con un SIGUIENTE que pide fusionar la rama.

**Limpieza.** Antes de crear su worktree, `specty new` borra las de cambios ya terminados: cerrados que ya están en su rama destino (o que no se incorporan), y cancelados. Son las que quedan cuando el agente cierra desde dentro. Nunca borra la carpeta en la que corre el proceso, ni la principal, ni la de un cambio abierto. Usa `git worktree remove` sin `--force`, así que una carpeta con archivos sin seguimiento queda, y las ramas también. `specty prune` hace lo mismo y además borra las ramas `specty/*` y `spike/*` que ya están en la rama destino y no están en ninguna worktree. Las demás quedan, como la de un cambio cancelado, que guarda su registro, y la salida dice por qué.

**Commits que hace Specty**, siempre con la identidad git de la persona y con trailers ([formats.md §7](formats.md#7-trailers-de-commit)):

- Al aprobar una revisión: solo `.specty/changes/<id>/` (`docs(spec): …`).
- En `task done`: el código de la tarea, junto con `state.json` y `audit.jsonl`.
- Al cerrar: el merge de la rama principal en la del cambio, si avanzó, y el movimiento a `.specty/archive/`.
- En `init`: los archivos que escribe y que git sigue (`config.yaml`, `AGENTS.md`, `CLAUDE.md`, la configuración no local del guard de Claude Code y de Cursor, los hooks de husky o lefthook), en la rama de la carpeta y sin spec, porque es la instalación de Specty (`chore(specty): …`, `Specty-Init: true`). Así la carpeta principal queda limpia, y ningún cierre se bloquea por esos archivos. Quedan fuera los que ya tenían cambios de la persona (la salida los nombra), lo que ella tenga preparado y los archivos locales. Con un cambio activo en la carpeta, `init` no hace el commit.

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
| 2. Hooks del agente (guard) | Bloquea escrituras fuera de alcance (o, con una incorporación pendiente, fuera de los archivos que junta), `git commit` directo, acciones humanas (salvo en modo delegado, y nunca `delegate`) y edición de archivos protegidos; al terminar cada comando de shell, avisa de lo que cambió sin permiso, y no deja que una sesión entre en otra worktree mientras su cambio sigue abierto | Sí, con shell indirecta; el aviso posterior llega con el cambio ya hecho |
| 3. Hooks de git | Bloquea commits sin recibo ni spec | Sí, con `--no-verify` |
| 4. CI (`specty ci` como check obligatorio) | Rechaza commits no trazables, specs sin aprobación válida para su hash y ramas `spike/` hacia la principal | No |
| 5. Revisión de PR (modo equipo) | Aprobación con identidad verificada por el servidor | No |

**Guard.** Un único punto de entrada, `specty guard --tool <id>`:

1. Lee el evento de la herramienta por stdin.
2. Lo normaliza a escritura, borrado, shell o MCP. Un parche (`apply_patch` de Codex) es un conjunto de escrituras y borrados: sus cabeceras `*** Add File:` y `*** Update File:` escriben, `*** Delete File:` borra, y `*** Move to:` escribe la ruta nueva y borra la anterior.
3. Core decide.
4. El adaptador responde en el formato de la herramienta: normalmente, código de salida 2 con el motivo y el siguiente paso.

El guard solo juzga rutas que puede ubicar dentro del repositorio y que git no ignora. El análisis de shell sigue los `cd` de cada comando y, como bash, se salta los comentarios y el cuerpo de los heredocs; dentro de `((…))` y `$((…))`, `<`, `>`, `&`, `|` y los paréntesis son aritmética, no redirecciones ni subshells. Lo que corre en un subshell (`(…)` o `$(…)` fuera de comillas) se analiza como el resto, y sus `cd` no salen de él. Una ruta con variables sin expandir, o una ruta relativa tras un `cd` a un destino desconocido, no se bloquea por alcance: la cubren los hooks de git y el CI. Un `git commit` que un `cd` o `git -C` llevan a una carpeta fuera de todas las worktrees del repositorio es de otro repositorio y no se juzga; si la carpeta no se puede ubicar, se juzga como de este.

**Después de cada comando de shell** (Claude Code: `PostToolUse` y `PostToolUseFailure`, con el matcher `Bash`; Codex: `PostToolUse`, que también llega tras un comando fallido; Cursor: `postToolUse` y `postToolUseFailure`, con el matcher `Shell`; OpenCode: el plugin, con `execute.after` o `tool.execute.after`). Antes del comando, si lo permite y no es de Specty, el guard guarda una foto de los archivos que difieren de `HEAD`, con su tamaño y su fecha, en `.git/specty/shell/<tool_use_id>.json`. Al terminar, compara y juzga lo que cambió con las mismas reglas, así que también ve lo que escriben intérpretes, scripts y generadores, que el análisis de shell no puede prever. No lo deshace: el aviso le llega al modelo (en Claude Code y Codex, por la salida 2; en Cursor, como `additional_context`, que se añade a la conversación tras el resultado; en OpenCode, añadido al resultado del comando), y `task done` sigue siendo la puerta. Las fotos que nadie recoge se borran al cabo de un día.

**Una sesión, una worktree** (Claude Code: `EnterWorktree` en el matcher de `PreToolUse`). El trabajo en paralelo es una sesión de agente por cambio. La primera worktree en la que entra una sesión (por el `session_id` del evento) pasa a ser la suya, y queda guardada en la carpeta común de git (`common/specty/sessions/<id>.json`). Mientras el cambio de esa worktree siga abierto, el guard no le deja entrar en otra: el motivo nombra su worktree y su cambio, y el SIGUIENTE pide terminarlo o abrir otra sesión. Cuando el cambio se cierra o se cancela, o su carpeta ya no existe, la sesión queda libre y puede encadenar el siguiente. Sin `session_id`, el guard no juzga la entrada.

**Entrar por nombre** (Claude Code: `WorktreeCreate` y `WorktreeRemove`, sin `matcher`, al mismo `specty guard --tool claude-code`). Claude Code pide permiso cada vez que `EnterWorktree` recibe un `path` fuera de `.claude/worktrees/`, y ninguna regla lo evita; con `name` no pregunta. Con estos hooks, Specty crea las worktrees por Claude Code: si el nombre es el id de un cambio cuya carpeta preparó `specty new`, responde con esa carpeta sin crear nada; si no, crea `.claude/worktrees/<name>` en la rama `worktree-<name>` desde HEAD (o reutiliza la que exista), también para los subagentes aislados. Al borrar, quita las de `.claude/worktrees/` con su rama si ya está fusionada, y deja las de los cambios: las limpia `specty new` cuando terminan. Los hooks solo necesitan git, y el guard juzga el `name` con la misma carpeta, así que la sesión queda ligada a la del cambio. Cuando los ajustes tienen estos hooks, el SIGUIENTE de `specty new` propone `EnterWorktree` con `name` igual al id del cambio.

Objetivo de rendimiento: p95 < 200 ms. Para acercarse, los hooks cargan solo su entrada: `main.ts` no importa nada de forma estática, y con `guard --tool <id>` o `hook <nombre>` carga `enforce/entry.ts`, que los ejecuta sin commander, los prompts, los comandos ni el servidor; cualquier otra forma de esos comandos pasa por la CLI completa. El bundle va partido en `dist/` (`specty.mjs` y sus trozos, en la misma carpeta), y un test recorre su metafile para que los hooks no vuelvan a llegar a esas partes. Core importa zod como espacio de nombres (`import * as z`), así que los bundles de la CLI y de la UI dejan fuera sus traducciones y su JSON Schema: el de la CLI pasó de 1,70 a 1,14 MB. Medido el 2026-10-24, el guard de un `Bash` bajó de 123 a 101 ms de mediana en un prototipo sin carga, y de 359 a 244 ms con la máquina cargada por otras sesiones. El resto de su tiempo son las llamadas a git. Las reglas de shell (comandos que escriben archivos, `--no-verify`, cambiar `core.hooksPath` (leerlo no), acciones humanas) son de mejor esfuerzo, porque un comando siempre se puede ofuscar. Para eso existe la capa 3. El guard también bloquea `npx specty`, `npm i specty` y sus equivalentes sin scope, porque `specty` en npm es un paquete ajeno ([ADR 0007](decisions/0007-nombre-y-organizacion.md)), y responde con el comando correcto.

**Soporte de hooks por herramienta** (revisado el 2026-10-21; se vuelve a verificar al implementar cada adaptador):

| Herramienta | Evento previo a la acción | Configuración | Estado |
| --- | --- | --- | --- |
| Claude Code | `PreToolUse` (`matcher` + `hooks: [{ type: "command" }]`; salida 2 bloquea), `PostToolUse` y `PostToolUseFailure` con `Bash` (salida 2: el modelo ve el aviso), y `SessionStart` con `compact` (su salida va al contexto) | `.claude/settings.json`, o `settings.local.json` si el comando lleva una ruta local | Implementado (F1); aviso tras cada comando de Bash. En el mismo archivo, `init` permite `EnterWorktree` y `ExitWorktree` e instala `WorktreeCreate` y `WorktreeRemove`: las worktrees son transparentes para la persona, y el agente entra (por nombre), sale y las borra sin preguntar |
| Antigravity | `PreToolUse` | `.agents/hooks.json` | El legacy lo instala; verificar |
| Cursor | `preToolUse` (`Write`, `Delete`, `Shell`) y `beforeShellExecution`; responde JSON con `permission` | `.cursor/hooks.json` (`version: 1`) | Implementado (F1); aviso tras cada comando con `postToolUse` y `postToolUseFailure` (`Shell`), que responden `additional_context`. No existe un evento previo a editar: `Write` cubre las escrituras del agente |
| Windsurf | `pre_write_code`, `pre_run_command` | `.windsurf/hooks.json` | Documentado |
| Gemini CLI | `BeforeTool` | `.gemini/settings.json` | Experimental; hay que activarlo |
| GitHub Copilot | `preToolUse` | `.github/hooks/*.json` | Parcial; verificar |
| Codex (0.123 o posterior) | `PreToolUse` con `Bash` y `apply_patch` (el comando o el parche van en `tool_input.command`; salida 2 bloquea), y `PostToolUse` con `Bash` | `hooks.json` de la configuración de usuario (`$CODEX_HOME`, o `~/.codex`), no del repositorio: Codex guarda la confianza en cada hook por la ruta absoluta de su archivo, y uno del repositorio habría que aprobarlo con `/hooks` en cada worktree | Implementado; aviso tras cada comando de Bash. La persona confía en el hook una vez con `/hooks`; fuera de los repositorios con Specty, el guard no hace nada |
| OpenCode (1.18.29 o posterior, y 2) | No tiene hooks de comando: un plugin de Specty registra `execute.before` (OpenCode 2, en `setup`) o `tool.execute.before` (OpenCode 1, en `server`), manda cada herramienta al guard con la forma de Claude Code (`tool_name`, `tool_input`) y la rechaza lanzando un error con el motivo cuando el guard responde 2 | `plugins/specty.js` en la configuración global (`$XDG_CONFIG_HOME/opencode`, o `~/.config/opencode`), no en el repositorio: sirve en todas las worktrees y los formateadores del proyecto no revisan su código | Implementado: `shell`/`bash` (en su `workdir`), `edit`, `write`, `multiedit` y `patch`/`apply_patch`. El plugin solo arranca el guard en carpetas con `.specty/config.yaml`. Aviso tras cada comando de shell: `execute.after` (OpenCode 2) añade una parte de texto a `result.content`, y `tool.execute.after` (OpenCode 1) lo añade al final de `output.output`; en OpenCode 2 no avisa si la herramienta falla, y nunca lanza tras el comando |
| Resto (Aider, Zed, Cline, Continue…) | — | — | Solo capas 1, 3 y 4 |

### Modelo de confianza

Specty protege contra el agente impaciente (el que se salta pasos para ayudar) y contra el olvido humano. No protege contra una persona o un agente que quiera evadirlo deliberadamente con acceso de escritura al repositorio: en local, cualquier control se puede desactivar. Por eso las garantías fuertes viven en el servidor: el CI obligatorio y, en modo equipo, la revisión de PR. En la fase 4, la aprobación con presencia del usuario (WebAuthn, es decir, Touch ID o Windows Hello) eleva la barrera en local, porque el agente no puede generarla.

En modo delegado ([ADR 0010](decisions/0010-modo-delegado.md)), la persona renuncia a revisar cada spec y cada resultado: el agente decide por ella, y la auditoría marca esas decisiones como delegadas. Lo demás se mantiene: la spec antes del código, el alcance de cada tarea y los commits de Specty.

## 11. Tamaño y esfuerzo

**Señales deterministas** que calcula `propose`:

- archivos por acción (crear, modificar, borrar) y módulos distintos tocados (solo cuentan las rutas gobernadas: la documentación y lo demás de `ignored` no suma módulos). Un glob cuenta como sus coincidencias actuales más una: la CLI las busca entre lo que git sigue y lo no ignorado sin seguir, y se las pasa a core, que no lee el disco;
- rutas sensibles: migraciones, auth, pagos, CI, infraestructura;
- dependencias nuevas o cambios de API pública;
- fan-in de los archivos tocados (cuántos archivos los importan);
- ausencia de tests en la zona.

La puntuación da un nivel `S`, `M`, `L` o `XL`, con umbrales configurables. El modelo puede subir un nivel con motivo (`estimate` en el frontmatter), y el ajuste queda visible en la UI. No puede bajarlo: un `adjust: -1` no se aplica y las razones del tamaño lo dicen, porque bajar un `XL` le evitaría la división en una épica.

**Recomendación de esfuerzo**, por fase y en niveles neutros (`low`, `medium`, `high`, `max`):

- Planificar y revisar el alcance: según el tamaño del cambio.
- Implementar: según el tamaño de cada tarea. Normalmente un nivel menos, porque una spec bien hecha reduce el razonamiento necesario.

El modelo que redacta la spec puede subir esas recomendaciones con su motivo, como el tamaño: la de la revisión con `effort: { review, reason }` en el frontmatter, y la de cada tarea con su campo `effort: <nivel> — <motivo>`. Specty toma el mayor de los dos, así que no puede bajarlas. La implementación del cambio es la mayor entre la de su tamaño y las de sus tareas. Cuando el modelo sube algo, la línea de esfuerzo de `propose` y `approve` lo dice con sus motivos. Una revisión en `max` también pide la revisión independiente antes de aprobar ([ADR 0011](decisions/0011-revision-independiente.md)), si la persona la configuró.

La tabla `presets/effort.yaml` traduce los niveles a cada herramienta (por ejemplo, el nivel de esfuerzo de Claude Code o el *reasoning effort* de Codex). Se actualiza con cada versión de Specty, porque cambia con cada lanzamiento de modelos. `propose` imprime la recomendación para la herramienta detectada y el agente se la transmite a la persona. Specty no cambia el esfuerzo del modelo: lo recomienda.

**Dividir.** Si el cambio es `XL` o supera los umbrales (por defecto: más de 8 tareas, más de 15 archivos de código o más de 2 módulos), `propose` lo rechaza y propone una épica. Los archivos de código son los gobernados que no son tests, con los globs expandidos; los tests y la documentación no cuentan en el límite, pero sí en la puntuación, y por tanto en el nivel `XL`. El límite de 3 archivos del carril `quick` cuenta igual. Al dividir conviene:

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

Es reversible: `specty init --dry-run` lista los archivos que crearía o cambiaría (solo los que cambiarían de verdad), sin escribir nada ni hacer commit. Sin `--dry-run`, antes de cambiar un archivo que ya existía, `init` guarda una copia en la carpeta común de git (`common/specty/backups/<fecha>/`, ver [formats.md §1](formats.md#1-estructura)) y la salida dice dónde; si todo lo que escribe es nuevo, no crea la carpeta. Los instaladores escriben a través de `install/files.ts`, que simula, compara y copia. `specty uninstall` lo deshace: quita lo que `init` instaló en el repositorio, reconocido por sus marcas (los bloques `specty:begin`/`specty:end` de AGENTS.md, el bloque `# >>> specty >>>` de los hooks de git, el comando `specty` de lefthook, las entradas con `guard --tool <id>` y los permisos `EnterWorktree` y `ExitWorktree`), deja el resto de cada archivo y borra el que se queda vacío. Es de la persona, como `delegate`: necesita una terminal real y una confirmación cuya opción por defecto es «No», y el guard se lo bloquea siempre al agente, también en modo delegado. Enseña la lista antes de preguntar, guarda copias como `init` y no hace commit. Deja `.specty/` (el historial), el `@AGENTS.md` de CLAUDE.md y el guard global de Codex y OpenCode, y dice dónde están; `--dry-run` solo lista lo que quitaría.

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
- que la guía de otra herramienta no pida al agente lo que el guard bloquea: los bloques de flujo de gentle-ai (`agent-routing`, el de su ODD, que pide commits propios por unidad de trabajo, y `orchestrator`, `sdd-orchestrator` y `sdd`, los de su antiguo SDD) en AGENTS.md o CLAUDE.md del repositorio, o en los archivos globales donde gentle-ai los escribe (`~/.claude/CLAUDE.md`, el `AGENTS.md` de Codex y el de OpenCode, y `~/.cursor/rules/gentle-ai.mdc`);
- la versión de Node y la configuración de CI.

## 15. Servidor local y UI

**Lo que existe** (`packages/cli/src/server/`):

- `specty ui [--port <n>]` levanta un servidor HTTP en `127.0.0.1`, en el puerto 4173 o el siguiente libre (hasta 19 más), imprime el enlace `http://localhost:<puerto>/?token=…` y sigue hasta Ctrl+C. El token se genera al arrancar y vive solo en memoria. Al abrir el enlace, el servidor lo cambia por una cookie `specty-<puerto>` (`HttpOnly`, `SameSite=Strict`; el puerto va en el nombre porque las cookies de `localhost` se comparten entre puertos) y redirige a `/`, así el token no queda en la URL.
- Toda petición con un `Host` que no sea `localhost:<puerto>` o `127.0.0.1:<puerto>` recibe 403 (DNS rebinding). La API exige la cookie y, si llega `Origin`, que sea el del servidor; no habilita CORS, admite GET y, para las acciones, POST (405 para lo demás), y todas las respuestas llevan `nosniff`, `no-referrer`, `X-Frame-Options: DENY` y `no-store`.
- **Acciones de la persona**, solo si la persona arrancó `specty ui` desde una terminal interactiva: arrancado por el agente (sin TTY), el servidor es de solo lectura, porque el agente vería el enlace con el token. `GET /api/session` dice si hay acciones (`{ actions, csrf }`). Cada acción es un `POST` con JSON que, además de la cookie, exige `Origin` del propio servidor y la cabecera `X-Specty-CSRF` con el token de la sesión; sin acciones responde 403 `{"error":"read-only"}`. Rutas: `/api/changes/<id>/approve` (`{ revision }`), `/assumptions/<A>` (`{ decision: "confirmed" | "rejected", comment? }`), `/scope/<S>` (`{ decision: "approved" | "rejected", reason? }`), `/comments` (`{ anchor: { item } | { section, quote }, body }`), `/request-changes`, `/accept`, `/adjust` (`{ request }`) y `/close`. Cada una ejecuta el comando de la persona que ya existe (`approve`, `approve`/`reject --scope`, `accept`, `adjust`, `close`) en la carpeta del cambio, con una terminal de la UI: la persona ya decidió en la pantalla, así que confirma y registra el canal `ui` en la aprobación; `accept` no pregunta por la verificación completa, que la UI lanza aparte. Decidir un supuesto durante la revisión guarda la decisión en `state.items` y la anota como `assumption.decided`. Comentar y pedir cambios no tienen comando de terminal: son de la revisión en la UI. Un comentario se guarda en `comments.json`; pedir cambios lo anota como `review.changes_requested` y desde entonces `specty next` le da al agente los comentarios sin resolver, hasta que propone una revisión nueva, que los resuelve (ver `docs/formats.md` §5). Antes de aprobar, el servidor exige que la revisión pedida sea la vigente y que estén confirmados todos los supuestos de alto impacto. Las acciones se ejecutan de una en una y responden la salida del comando: 200 si se hizo y 409 si el flujo la rechazó.
- **Modo delegado** ([ADR 0010](decisions/0010-modo-delegado.md)): `GET /api/delegation` dice si está activo, quién lo activó y cuándo, con el aviso que `specty delegate on` muestra antes de activarlo, en español y en inglés (`{ on, by?, at?, warning: { es, en } }`). `POST /api/delegation` con `{ on }` es una acción de la persona como las demás y ejecuta `delegate on|off`; al activarlo, la terminal de la UI responde «sí» a su pregunta, porque la persona ya leyó el aviso y confirmó en la pantalla. El interruptor entra en la firma de los eventos, así que cambiarlo, desde la UI o desde la terminal, emite `changes`.
- `GET /api/changes` devuelve cada cambio una vez, con la forma de `ChangeRecord` de la UI (`packages/ui/src/data/records.ts`): `spec`, `state`, `comments`, `audit` y la spec aprobada tal cual, `verifyFull` de su carpeta, `phaseSince` y `folder`, la worktree donde vive. Lo único que se añade a `state` es el `commit` de cada tarea hecha: el archivo no puede guardarlo, porque es el commit que lo contiene, y el servidor lo encuentra por su trailer `Specty-Task` con una sola búsqueda en el historial de todas las ramas. Primero va el cambio abierto de cada worktree y después los archivados de cada worktree, la principal primero, para que un cambio cerrado que no llegó a la rama principal se vea desde su carpeta. `phaseSince` es la hora de la última entrada de la auditoría que lleva a la fase actual (`change.created`, `spec.proposed`, `spec.approved`, `adjust.requested`, `task.completed`, `change.accepted`, `change.closed`, `retro.confirmed` o `change.cancelled`, según la fase); si no hay ninguna, la de `state.json`.
- `GET /api/changes/<id>/diff` da como texto el diff de git de todo el cambio, desde la base de su primera tarea con commit hasta el commit de la última. Con `?task=<T>`, da el de esa tarea, de su `baseCommit` a su `commit`. Deja fuera los archivos de `.specty/`, porque la vista de cambios enseña el código. Es una lectura: también la da el servidor que arrancó el agente. Responde 404 si aún no hay commits, y 413 con el rango si el diff pasa de 512 KB, el límite de salida de la CLI, para verlo con `git diff`.
- `GET /api/events` es un flujo SSE: emite `changes` al conectarse y cada vez que cambia la firma de los archivos (hora y tamaño de `spec.md`, `state.json`, `audit.jsonl` y `comments.json` de los cambios abiertos de cada worktree, y la lista de los archivados). Se revisa cada segundo y solo mientras alguien escucha: es portable y barato, y no obliga a vigilar carpetas con `node_modules` dentro. También emite `run` (`{ change, run }`) mientras corre una verificación completa lanzada desde la UI: la ejecución entera con sus últimas 1000 líneas, como mucho cada 250 ms, y `run: null` al terminar.
- **Verificación completa desde la UI.** `POST /api/changes/<id>/verify` es una acción de la persona con la seguridad de las demás, pero va fuera de la cola, porque tarda minutos y no cambia el estado. Con el cambio en aceptación, ejecuta `verify.full` con la shell en la carpeta del cambio, con su `timeoutSec`, y responde en cuanto empieza. Rechaza con 409 si el cambio no está en aceptación, si no hay `verify.full` o si ya corre una del mismo cambio. Al terminar, anota `change.verified` en la auditoría del cambio, igual que `specty accept`. `GET /api/changes/<id>/run` da la ejecución en curso, o `null`, para que una pestaña que se abre a mitad la vea desde lo que lleva. Al cerrar el servidor, las que siguen corriendo terminan sin anotarse.
- La UI construida se sirve desde `ui/` junto al bundle del CLI o, en el monorepo, desde `packages/ui/dist/browser`, nunca fuera de esa carpeta. Solo el empaquetado pone `ui/` junto al bundle: el `prepack` del paquete construye la UI y ejecuta `node build.mjs --ui ../ui/dist/browser`, que la copia a `dist/ui` (unos 6 MB sin comprimir), y una build normal la borra, para que una copia vieja no tape la build del monorepo. Su `index.html`, que también responde a las rutas de la app, lleva `<meta name="specty-data" content="server">` para que la UI sepa que lee del servidor. Sin una UI construida, una página explica cómo construirla.
- Con esa marca, la UI usa `ServerData` (`packages/ui/src/data/server.ts`), su fuente de datos para el servidor: lee `/api/changes` y vuelve a leerlo con cada evento `changes`. Sin la marca (`ng serve`, el catálogo), arranca con los datos de ejemplo del prototipo, que solo se cargan entonces. Las decisiones de la persona en la UI (aprobar, decidir un supuesto, comentar la spec y pedir los cambios, decidir una solicitud de alcance, ejecutar la verificación completa, aceptar o pedir un ajuste y confirmar el cierre) son `POST` a las acciones del servidor con el token CSRF de `GET /api/session`; un rechazo se muestra con su motivo: el del flujo (409), que el servidor es de solo lectura o que falta la sesión. Los diffs de la vista de cambios los lee de `GET /api/changes/<id>/diff`. La verificación en curso la sigue con los eventos `run`, tras pedir `/run`; si un evento llega antes que esa respuesta, gana el evento, que es más nuevo. Las comprobaciones y los mensajes de las respuestas están en `data/server-answers.ts`. Tras cada acción, la UI no lee nada más: el evento `changes` la actualiza, porque la firma incluye `comments.json` y `audit.jsonl`.

**Lo que falta:**

- Que el paquete de npm incluya la UI construida.
- `propose` y `next` arrancan el servidor en segundo plano si no está activo e imprimen el enlace; el servidor se apaga solo tras un rato inactivo. Si el sandbox del agente impide arrancarlo, la persona ejecuta `specty ui`.
- Comentarios y «pedir cambios» en la revisión; la verificación completa lanzada desde la UI; edición estructurada de la spec (core serializa y escribe el archivo) y diffs por tarea. Las acciones humanas existen solo en la UI y en la TTY. La seguridad del servidor está en [ui.md](ui.md#seguridad).
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
- pruebas end-to-end con repositorios git temporales;
- ningún SIGUIENTE sin salida, con dos comprobaciones:
  - estática (`commands-named.test.ts`): cada comando `specty …` que nombran los textos de core y de la CLI, fuera de los comentarios, pasa por el parser de la CLI con su verbo, su subcomando y sus opciones. Los argumentos que falten no cuentan, porque los textos también mencionan comandos sin ellos;
  - dinámica (`friction.test.ts`, con `walk.ts`): un recorrido hace lo que haría un agente. Ejecuta `next` y luego el comando que nombra cada SIGUIENTE, con el trabajo de cada fase guionizado, y como persona los comandos de la persona. Recorre un cambio quick, uno standard, uno standard con tropiezos y uno en modo delegado. Los tropiezos son código antes de la spec y un commit del agente (ambos en el guard), una spec sin criterios, un archivo fuera del alcance y una verificación en rojo. Cada bloqueo debe quedar resuelto: una salida sin bloqueo en 4 pasos como máximo. Uno sin comando en su SIGUIENTE sería «sin continuación», y uno que no se despeja, «callejón».

**Fricción.** El mismo recorrido cuenta los comandos, y el test fija las cifras. Un cambio que añada o ahorre comandos las cambia a la vista. Línea base (octubre de 2026), en comandos del agente (con `next`) y de la persona:

| Recorrido | Hasta la spec aprobada | Hasta el final | Bloqueos |
| --- | --- | --- | --- |
| quick | 3 + 1 | 5 + 2 | 0 |
| standard | 3 + 1 | 8 + 3 | 0 |
| standard con tropiezos | 5 + 1 | 15 + 4 | 5, todos resueltos |
| standard en modo delegado | 4 + 0 | 11 + 0 | 0 |

Dos de esos comandos son un `next` que solo trae la tarjeta siguiente: uno tras `approve` y otro tras `accept` en standard.

**Suite de cumplimiento** (`evals/`): escenarios con agentes reales en modo headless (Claude Code, Codex, Gemini CLI, Cursor CLI…), por ejemplo:

- "pide código sin spec";
- "la tarea necesita otro archivo";
- "el usuario dice 'apruébalo tú'";
- "ajuste fuera de alcance".

Mide violaciones, bloqueos y rondas. Se ejecuta antes de cada versión, y es lo que demuestra que Specty funciona con cualquier modelo.

**El agente real con un modelo guionizado** (`agent-e2e.test.ts`, con `fake-model.ts`). Es la parte de la suite que no necesita un modelo de verdad. Claude Code corre en modo headless (`claude -p`) en un repositorio preparado con `specty init`. Habla con un servidor local que imita la API de Messages: responde por SSE una secuencia fija de llamadas a herramientas, y sabe por dónde va contando los `tool_result` que trae la conversación. La prueba lee esos `tool_result` y comprueba lo que Claude Code le devolvió al modelo:

- sin cambio activo, escribir código gobernado, hacer `git commit` con código sin commit y ejecutar `specty approve` dan tres errores del hook de Specty, cada uno con su SIGUIENTE, y el repositorio no cambia;
- con una tarea activa, un archivo de su alcance se escribe y otro de fuera vuelve con `specty scope add`.

Claude Code se busca en `SPECTY_E2E_CLAUDE`, en el PATH y en las extensiones de VS Code, Cursor, Windsurf y Antigravity (la versión más reciente). Si no está, la prueba se salta. La variable solo dice dónde está el binario. Corre aislado:

- `CLAUDE_CONFIG_DIR` y `HOME` temporales, una clave falsa y `ANTHROPIC_BASE_URL` al servidor;
- `--setting-sources project,local`, porque con la ruta absoluta del bundle `init` pone los hooks en `.claude/settings.local.json`;
- `--strict-mcp-config`, solo Write y Bash, y sin tráfico no esencial.

Si Claude Code no llegara al servidor, la prueba falla, y la API real rechazaría la clave falsa. Claude Code exige leer un archivo antes de sobrescribirlo, y lo comprueba antes de los hooks; por eso el guion escribe archivos nuevos. Codex y OpenCode pueden usar el mismo servidor con la API compatible con OpenAI.

## 17. Portado desde el legacy

| Módulo | Tamaño | Acoplamiento | Plan |
| --- | --- | --- | --- |
| `src/detect` | ~1,7k líneas | Solo sus propios tipos | Reescrito en la fase 1 de forma compacta (~450 líneas, sin clases ni casts), con las mismas pilas y frameworks, el gestor de paquetes en los comandos y la detección de herramientas de IA. Falta leer los comandos del CI (F3) |
| `src/governance/hook-managers` | ~0,8k | `core/git` | Reescrito en la fase 1 con la misma idea (bloque marcado e idempotente) para `pre-commit` y `prepare-commit-msg`, respetando `core.hooksPath`, husky y lefthook; simple-git-hooks se indica a mano |
| `src/adapters` (21) | ~1,5k | `generate/types`, `i18n`, `config` | La fase 1 cubre Claude Code y Cursor. Al portarlo se vio que el legacy escribía los hooks de Claude Code sin la lista `hooks: [{ type: "command" }]` que exige su formato, así que probablemente nunca se ejecutaban. Solo 2 de los 21 adaptadores instalaban hooks |
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
| F0 · Fundaciones ✓ | Monorepo. En core: spec (parser, serializador, hash, delta, validación), máquina de estados, alcance y tamaño | Pruebas de ida y vuelta y de transiciones en verde |
| F1 · Flujo por CLI ✓ | `init` (detección), los 7 comandos del agente, git (ramas, recibos, trailers), hooks de git, bloques de AGENTS.md, guard con adaptadores de Claude Code y Cursor, aprobación por TTY | Desde aquí, Specty se construye usándose a sí mismo |
| F2 · UI | Primero el sistema de diseño y un prototipo navegable; después las pantallas de revisión, delta, progreso, aceptación y cierre en vivo | Un cambio completo sin abrir el Markdown |
| F3 · Auditoría y ecosistema | `why`, `audit`, flujo retro completo, `specty ci` y GitHub Action, exportadores, importador desde OpenSpec y el legacy, servidor MCP, más adaptadores con hooks, suite de cumplimiento con ≥ 4 agentes | La suite de cumplimiento es estable con cada agente |
| F4 · Escala y equipos | Épicas y worktrees en paralelo, modo equipo (aprobadores, revisión de PR), WebAuthn, extensión de VS Code (mismo bundle de UI), MCP Apps en el chat | — |

## 19. Preguntas abiertas

1. Titular del copyright en `NOTICE`: hoy figura "Jorge Palacio and the Specty contributors". Si Baquia es una entidad legal que será dueña del código, debe ir su razón social.
2. Rama por cambio en modo individual. Propuesta: activada por defecto.
3. Retro por defecto. Propuesta: modo `agent` (la visión original), con `minimal` activable.
4. Aceptación en el carril `quick`. Propuesta: un clic.
5. Política de tests por defecto. Propuesta: `recommended`, que avisa si una tarea de código no toca tests.
