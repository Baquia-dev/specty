# Specty for VS Code

[Specty](https://github.com/Baquia-dev/specty) enforces spec-driven development with any AI coding agent. This extension brings the change you work on into VS Code.

*En español más abajo.*

## What it does

- **Status bar**: the change of the folder, its phase and whether it waits for you (`Specty: Review · waiting for you`). In a folder without a change of its own, how many changes are open and how many wait for you. Its tooltip lists every open change, with the folder it lives in. It updates when a change's `state.json` changes, when the window gets the focus back and when `specty.path` changes.
- **Specty: Open the UI** (or a click on the status bar): starts `specty ui` in the folder, once per window, and opens its link in your browser. The server stops when the window closes.

## Requirements

- The `specty` command, in a version whose `specty --json status` gives the open changes as data: `npm install -g @baquia-dev/specty@latest`.
- macOS or Linux. On Windows, Node does not start npm's `.cmd` files without a shell; it is not supported yet.
- A trusted workspace: the extension runs `specty`, so it does not start in Restricted Mode.

## Setting

- `specty.path` (default `specty`): the command to run, as a path or a name on the `PATH`. It is a setting of the machine: a repository's `.vscode/settings.json` cannot change it.

## Limits

The UI the extension opens only reads: its server has no terminal, so a person's decisions (approve, accept, close) are disabled, as with a server an agent starts. To decide from the UI, run `specty ui` in your terminal; deciding from VS Code comes later.

## Build and install

From the repository:

```sh
pnpm --filter specty-vscode package
code --install-extension packages/vscode/dist/specty.vsix
```

`package` bundles the extension and writes `dist/specty.vsix`; it does not publish it. In Cursor, Windsurf or Antigravity, use their own command, or *Extensions: Install from VSIX…*.

---

# Specty para VS Code

[Specty](https://github.com/Baquia-dev/specty) hace cumplir el desarrollo guiado por especificaciones con cualquier agente de IA. Esta extensión trae a VS Code el cambio en el que trabajas.

## Qué hace

- **Barra de estado**: el cambio de la carpeta, su fase y si te espera (`Specty: Revisión · te espera`). En una carpeta sin cambio propio, cuántos cambios hay abiertos y cuántos te esperan. Su tooltip lista los cambios abiertos, con la carpeta de cada uno. Se actualiza cuando cambia el `state.json` de un cambio, cuando la ventana recupera el foco y cuando cambia `specty.path`.
- **Specty: Abrir la UI** (o un clic en la barra de estado): arranca `specty ui` en la carpeta, una vez por ventana, y abre su enlace en el navegador. El servidor se detiene al cerrar la ventana.

## Requisitos

- El comando `specty`, en una versión cuyo `specty --json status` da los cambios abiertos como datos: `npm install -g @baquia-dev/specty@latest`.
- macOS o Linux. En Windows, Node no lanza los `.cmd` de npm sin una shell; aún no se admite.
- Un espacio de trabajo de confianza: la extensión ejecuta `specty`, así que no arranca en el modo restringido.

## Ajuste

- `specty.path` (por defecto `specty`): el comando que se ejecuta, como ruta o como nombre del `PATH`. Es un ajuste de la máquina: el `.vscode/settings.json` de un repositorio no puede cambiarlo.

## Límites

La UI que abre la extensión solo lee: su servidor no tiene terminal, así que las decisiones de la persona (aprobar, aceptar, cerrar) aparecen desactivadas, como con un servidor que arranca un agente. Para decidir desde la UI, ejecuta `specty ui` en tu terminal; decidir desde VS Code llegará más adelante.

## Construir e instalar

Desde el repositorio:

```sh
pnpm --filter specty-vscode package
code --install-extension packages/vscode/dist/specty.vsix
```

`package` empaqueta la extensión y escribe `dist/specty.vsix`; no la publica. En Cursor, Windsurf o Antigravity, usa su propio comando o *Extensions: Install from VSIX…*.
