# AGENTS.md

## Code Design

* Keep the codebase highly cohesive and loosely coupled.
* Each component, Hook, and module should have a clear and focused responsibility.
* Communicate between modules through explicit interfaces, props, and types.
* Avoid depending on the internal implementation of other modules.
* Prefer composition and responsibility-based separation over large, generic abstractions.
* Keep changes scoped to the module that owns the relevant functionality whenever possible.

## React Components

* Avoid oversized React components.
* When a React component approaches or exceeds 2,500 lines, prioritize breaking it down instead of continuing to add code.
* Split components by responsibility into subcomponents, custom Hooks, business logic modules, state modules, or utility functions.
* Refactoring should improve responsibility boundaries, not merely reduce the line count.
* Do not move an oversized component into an equally oversized custom Hook.
* Keep rendering, business logic, state management, and side effects separated where practical.

## Documentation
* Store documents created during requirement clarification and alignment in ./doc/draft/.
* Before starting the actual implementation, store the final confirmed technical specification in ./doc/spec/.
* After completing the task, document the verified technical facts of the implementation by module in ./doc/design/.
* Documentation should reflect confirmed information. Do not present assumptions, proposals, or unimplemented ideas as established technical facts.
