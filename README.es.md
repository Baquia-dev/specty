# Specty

[English](https://github.com/Baquia-dev/specty/blob/main/README.md)

**Desarrollo guiado por especificaciones, de obligado cumplimiento, para cualquier agente de IA.**

> **Beta pública, 0.1.0.** Specty funciona en macOS, Linux y Windows. Sus comandos, su API y sus formatos de archivo aún pueden cambiar antes de la 1.0.

Specty hace cumplir el desarrollo guiado por especificaciones cuando se programa con agentes de IA. Ningún agente escribe código sin una spec aprobada por una persona, cada tarea queda en un commit trazable y cualquier cambio, del agente o manual, se puede rastrear hasta la spec que lo justifica. Funciona dentro del chat de tu agente: esta versión ofrece Claude Code y Antigravity, y Codex, OpenCode, Cursor y Devin (Windsurf) llegarán más adelante. No necesita claves de API: Specty no llama a ningún modelo por su cuenta.

## Por qué

- Los agentes escriben código de inmediato a partir de prompts vagos. Después nadie sabe qué se hizo, dónde ni por qué.
- Escribir specs a mano es tedioso, y quien las escribe omite detalles que el modelo sí podría explicitar.
- Las reglas en prosa son obediencia blanda: el modelo se las salta, sobre todo cuando el flujo lo bloquea sin ofrecerle un camino legítimo.
- Cada herramienta espera su propia configuración, y una mala configuración hace que el agente pierda contexto.
- Los cambios manuales y los del agente se mezclan sin registro, y auditarlos después es imposible.

Con Specty:

- **Mantienes el control.** Nada se codifica sin tu aprobación, y siempre sabes en qué fase está cada cambio y qué sigue.
- **El agente pierde menos contexto.** Recibe solo lo que necesita para la tarea actual.
- **Menos iteraciones.** Las dudas y las suposiciones se resuelven antes de escribir código.

## Requisitos

- Node.js 22 o posterior.
- git.
- Un agente de IA que pueda ejecutar comandos de terminal.

## Instalación

```sh
npm install -g @baquia-dev/specty
```

O ejecútalo sin instalarlo: `npx -y @baquia-dev/specty <comando>`.

> Usa siempre el nombre completo, `@baquia-dev/specty`: `npx specty` ejecuta otro paquete.

## Poner Specty en un repositorio

En la raíz de un repositorio de git:

```sh
specty init
```

`init` pregunta en qué idioma trabaja Specty (español o inglés) y con qué agentes trabajas. Detecta el stack, el gestor de paquetes y los comandos del proyecto, los ejecuta para comprobar que funcionan y pregunta solo lo que falta. Después escribe, y hace commit de:

- `.specty/config.yaml`, la configuración;
- los bloques de Specty en `AGENTS.md`, las instrucciones que lee cada agente;
- el guard y los hooks de cada agente que elegiste;
- los hooks de git (`pre-commit` y `prepare-commit-msg`).

Termina con `specty doctor`, que comprueba la configuración y los hooks; ejecútalo de nuevo cuando quieras.

- `specty init --dry-run` lista lo que crearía o cambiaría, sin escribir nada. Antes de cambiar un archivo que ya existe, `init` guarda una copia.
- `--language <es|en>`, `--tools <lista>` (`claude-code`, `antigravity` o `claude-code,antigravity`) y `--git-flow <specty|github|trunk|gitflow>` responden de antemano a sus preguntas, y `--mcp` registra además el servidor MCP de Specty.
- `specty uninstall` quita lo que instaló Specty; `specty uninstall --dry-run` solo lo lista.

## Tu primer cambio, de punta a punta

1. **Pide un cambio a tu agente**, en su chat, como siempre. `AGENTS.md` le dice que ejecute `specty next` antes de tocar código y que siga su salida hasta la línea `SIGUIENTE:` (`NEXT:` en inglés).
2. **El agente redacta la spec.** Crea el cambio con `specty new "<título>"`, que tiene su propia rama y su propia carpeta, una worktree de git en `.worktrees/<id>`, para que varios cambios avancen en paralelo. En `.specty/changes/<id>/spec.md` escribe el objetivo, lo que queda fuera de alcance, los supuestos, los criterios de aceptación, los archivos, las tareas y los riesgos, y la envía con `specty propose`. Specty la valida, calcula su tamaño, recomienda el esfuerzo del modelo y, si es demasiado grande, pide dividirla en una épica.
3. **Tú la apruebas**, con `specty approve` en tu terminal o en la UI local (`specty ui`), donde también puedes confirmar supuestos, comentar y editar. El agente no puede hacerlo por ti: su guard bloquea tus comandos (`approve`, `accept`, `close`…), y estos piden una terminal real.
4. **El agente la implementa, tarea por tarea.** `specty task done <id>` comprueba que la tarea solo tocó sus archivos, ejecuta `specty check` y la verificación de la tarea, y hace el commit de la tarea. Si el agente necesita un archivo fuera de la tarea, lo pide con `specty scope add`, y decides tú. Con `policy.tests: contract`, los tests de una funcionalidad van primero: el agente los escribe y tú los apruebas antes del código.
5. **Aceptas el resultado** con `specty accept`, o pides ajustes, que el agente registra con `specty adjust`. Las tareas nuevas vuelven a aprobación, mostrando solo lo que cambió.
6. **Cierre.** El agente redacta el resumen del cierre, tú lo confirmas con `specty close`, y Specty incorpora el cambio a tu rama principal y lo archiva con su registro de auditoría.

Mientras el cambio te espera, el agente ejecuta `specty wait`, que vuelve en cuanto decides. Si alguien hace commit de código sin spec, los hooks de git detienen el commit hasta documentarlo con `specty retro`.

Si prefieres que el agente avance solo en un repositorio, `specty delegate on` le delega tus decisiones tras una advertencia que confirmas en tu terminal, y `specty delegate off` te las devuelve. Cada acción delegada queda en la auditoría como del agente.

## Carriles

Cada cambio sigue un carril, que se elige con `specty new --kind <carril>`:

| Carril | Cuándo | En qué se diferencia del flujo estándar |
| --- | --- | --- |
| `quick` | Hasta 3 archivos, sin rutas sensibles | Spec mínima (objetivo, archivos y una tarea, por defecto); aprobación y aceptación con un clic; cierre automático |
| `standard` | Por defecto | El flujo completo |
| `spike` | Incertidumbre técnica | Una rama `spike/<id>` que no se fusiona; termina en una decisión (un ADR o una spec de seguimiento) |
| `retro` | Código escrito sin spec, a mano o por un agente sin hooks | Documenta cambios ya hechos; la persona confirma; el commit queda permitido |
| `epic` | Alcance `XL` | Sin tareas: cortes verticales con sus dependencias, y cada uno es un cambio hijo con su propia carpeta (`specty new --epic <id> --slice C1`) |

Specty decide si un cambio cabe en `quick`: si la spec supera sus límites, `propose` la rechaza y pide pasar a `standard`.

## UI local

```sh
specty ui
```

`specty ui` sirve en `localhost` los cambios de todas las worktrees (en el puerto 4173, o en el siguiente libre; con `--port <puerto>` prueba otro primero) y abre tu navegador con un enlace que lleva un token de sesión (`--no-open` para no abrirlo). Sigue hasta Ctrl+C.

- **Bandeja:** primero lo que espera tu decisión, luego los cambios activos por fase y después los recientes.
- **Cada cambio:** pestañas Spec, Progreso, Aceptación e Historial, para revisar la spec, confirmar supuestos, comentar, editar, aprobar y aceptar.
- **Más páginas:** las épicas como un tablero de cortes, la trazabilidad de un archivo o una línea, la memoria de Specty, las sesiones de los agentes, un panel con lo que se hizo en un periodo y la configuración de `.specty/config.yaml` y del modo delegado.

La UI solo toma decisiones si la arrancas desde una terminal interactiva. Arrancada por un agente, es de solo lectura, porque el agente vería el enlace con su token.

## Agentes

Specty hace cumplir el flujo por capas:

| Capa | Qué hace | ¿Se puede evadir? |
| --- | --- | --- |
| 1. Instrucciones (`AGENTS.md` y la salida de Specty) | Guían al agente | Sí |
| 2. Los hooks del agente (el guard) | Bloquea las escrituras fuera del alcance de la tarea, el `git commit` directo, los comandos de la persona y la edición de los archivos de Specty y de los hooks de cada agente, con el motivo y el siguiente paso válido; tras cada comando de shell, avisa de lo que cambió sin permiso | Sí, con una shell indirecta; el aviso llega con el cambio ya hecho |
| 3. Hooks de git | Bloquean los commits sin recibo ni spec | Sí, con `--no-verify` |
| 4. CI (`specty ci` como check obligatorio) | Rechaza los commits que no se pueden rastrear hasta un cambio aprobado | Solo copiando a mano los trailers |

Lo que Specty hace con cada agente que ofrece esta versión (`specty init --tools <lista>` lo instala):

| Agente | Guard | Aviso tras cada comando | Tarjeta tras compactar | Worktree por nombre | Cortes en subagentes | Fin de turno | Exclusión | Permisos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | sí | sí | sí | sí | sí | sí | sí | sí |
| Antigravity | sí | indirecto | indirecto | indirecto | sí | sí | sí | sí |

Antigravity es la app y también su CLI, `agy`. Codex, OpenCode, Cursor y Devin (Windsurf) llegarán más adelante: Specty ya tiene su guard, pero esta versión no los ofrece, así que `init` ni los detecta ni los instala.

- **Guard:** juzga cada acción del agente antes de que ocurra.
- **Aviso tras cada comando:** tras cada comando de shell, Specty juzga lo que cambió con las mismas reglas y avisa al agente, así que también ve lo que escriben scripts y generadores.
- **Tarjeta tras compactar:** cuando el agente compacta su contexto, recibe de nuevo la tarjeta del cambio actual.
- **Worktree por nombre:** la conversación pasa a la carpeta del cambio (con `EnterWorktree` en Claude Code, con `specty enter <id>` en los demás).
- **Cortes en subagentes:** los cortes listos de una épica van a subagentes en paralelo, cada uno en la carpeta de su corte.
- **Fin de turno:** cuando el agente termina su turno, se ejecuta `specty check` y, si falla, el agente recibe el informe y sigue.
- **Exclusión:** el agente no lee dependencias, artefactos de build ni código generado (lo prepara `specty check --install`).
- **Permisos:** los permisos propios de la herramienta dejan la decisión a Specty.

*sí* funciona como en Claude Code; *indirecto* va por otro evento de la herramienta, un poco más tarde; *no posible* quiere decir que la herramienta no tiene nada que Specty pueda usar. Cómo se hace cada capacidad indirecta, y por qué no se puede cada una de las no posibles, está en [ARCHITECTURE §10](https://github.com/Baquia-dev/specty/blob/main/docs/ARCHITECTURE.md#10-cumplimiento-por-capas).

Cualquier otro agente (GitHub Copilot, Aider, Zed, Cline, Continue…) tiene las capas 1, 3 y 4: las instrucciones, los hooks de git y la CI.

Specty no protege contra personas o agentes que se propongan evadirlo con acceso de escritura al repositorio: la CI es la garantía final.

## CI

`specty ci` comprueba que cada commit de un pull request o de un push se pueda rastrear hasta un cambio aprobado: que cada commit de código gobernado nombre su cambio, que el commit de cada tarea lleve una aprobación válida para su spec y que ningún spike llegue a la rama de destino. En GitHub Actions lee el evento por su cuenta. La Action de la raíz de este repositorio lo ejecuta:

```yaml
on: [pull_request]

jobs:
  specty:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: Baquia-dev/specty@v0.1.0 # ejecuta @baquia-dev/specty@0.1.0; o pon el input `version`
```

Fuera de GitHub Actions, `--base <ref>` dice dónde empiezan los commits (por defecto, la rama de destino). `specty check --install` también puede escribir una plantilla de workflow de CI que lo ejecuta en los pull requests, y `specty check --all` ejecuta las verificaciones de calidad sobre todo lo que sigue git ([las verificaciones](https://github.com/Baquia-dev/specty/blob/main/docs/checks.md)).

## MCP

`specty mcp` sirve los comandos del agente como herramientas MCP por stdio (`specty_next`, `specty_new`, `specty_propose`, `specty_task_done`, `specty_scope_add`, `specty_check`…), con la misma salida y las mismas reglas que la CLI. Tus decisiones no tienen herramienta, tampoco en modo delegado. `specty init --mcp` registra el servidor en la configuración de proyecto de cada agente. Es opcional: cada herramienta MCP ocupa contexto en cada turno, y la CLI ya hace lo mismo.

En los anfitriones que admiten MCP Apps, el cambio se ve también en el chat, en solo lectura: la pestaña del paso en que va el agente (Spec, Progreso o Aceptación). Las decisiones siguen siendo tuyas, en tu terminal o en `specty ui`.

## Exportar e importar

- `specty export [id] --to <openspec|speckit|kiro>` escribe la spec de un cambio, el activo por defecto, en formato OpenSpec, GitHub Spec Kit o Kiro, en `.specty/exports/<formato>` o en la carpeta de `--out <carpeta>`.
- `specty import [carpeta]` trae un cambio de OpenSpec (de `openspec/changes/`) como borrador; sin carpeta, lista los que hay.

## Más comandos

- `specty status`: los cambios abiertos y las decisiones pendientes.
- `specty why <ruta>[:<línea>]`: el cambio, la tarea y los criterios de los que viene un archivo o una línea.
- `specty audit [id]`: el informe de un cambio, con sus tareas y su cronología.
- `specty check`: las verificaciones de calidad sobre lo que cambió.
- `specty stats`: el panel de la UI, en la terminal.
- `specty memory`: la memoria de Specty, con pendientes, mejoras, recordatorios y decisiones.
- `specty prune`: quita las carpetas de los cambios terminados y las ramas ya incorporadas.
- `specty --help` y `specty <comando> --help`: todos los comandos y sus opciones.

## Documentación

- [Producto](https://github.com/Baquia-dev/specty/blob/main/PRODUCT.md)
- [Arquitectura](https://github.com/Baquia-dev/specty/blob/main/docs/ARCHITECTURE.md)
- [Formatos de archivo](https://github.com/Baquia-dev/specty/blob/main/docs/formats.md)
- [Verificaciones de `specty check`](https://github.com/Baquia-dev/specty/blob/main/docs/checks.md)
- [UI](https://github.com/Baquia-dev/specty/blob/main/docs/ui.md)
- [Decisiones (ADR)](https://github.com/Baquia-dev/specty/tree/main/docs/decisions)

## Licencia

Specty se licencia bajo [Apache-2.0](https://github.com/Baquia-dev/specty/blob/main/LICENSE) (ver [NOTICE](https://github.com/Baquia-dev/specty/blob/main/NOTICE)). Lo que Specty genera en tu repositorio se licencia bajo MIT-0: puedes usarlo, modificarlo y redistribuirlo sin atribución ([ADR 0008](https://github.com/Baquia-dev/specty/blob/main/docs/decisions/0008-licencia-apache.md)).
