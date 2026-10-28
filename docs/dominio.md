# Glosario del dominio

Términos de Specty que un agente podría nombrar mal, de los más concretos a los más comunes. Las tarjetas traen la definición de los que usa su texto, como mucho 3 y en este orden ([formats.md §6](formats.md#6-configyaml)).

- **Corte** (`Slice`): una parte de una épica que se entrega como un cambio propio.
- **Épica**: un cambio sin tareas que avanza por sus cortes.
- **Carril** (`ChangeKind`): el tipo de cambio: quick, standard, spike, retro o epic.
- **Ampliación** (`ScopeRequest`): pedir tocar un archivo fuera del alcance de la tarea.
- **Incorporación** (`IntegrationState`): traer la rama destino al cambio al cerrarlo.
- **Recibo** (`Receipt`): lo que deja Specty para que el pre-commit acepte su commit.
- **Bloqueo** (`LockHolder`): qué comando está cambiando un cambio; uno a la vez.
- **Test aprobado** (`lockedTests`): un test que aprobó la persona, o el rojo de un bug; solo cambia con un desbloqueo.
- **Ciclo de tests** (`TestCycle`): con `contract`, el de una feature (gate 2) o el de un bug (su rojo se bloquea solo).
- **Modo delegado** (`Delegation`): el agente aprueba, acepta y cierra por la persona.
- **Retro-spec**: la spec que documenta después cambios hechos sin spec.
- **Hallazgo**: lo que una tarea aprendió (`task done --finding`) para las siguientes.
- **Guard** (`GuardDecision`): el hook que decide si la fase permite cada acción del agente.
- **Supuesto** (`Assumption`): lo que la spec da por cierto; con impacto alto, lo confirma la persona.
- **Criterio** (`Criterion`): un resultado observable con id `ACn`, que su test lleva en el nombre.
- **Fase** (`Phase`): el punto del flujo de un cambio, de draft a done o cancelled.
- **Tarjeta**: la salida de un comando para el agente, que acaba en SIGUIENTE.
