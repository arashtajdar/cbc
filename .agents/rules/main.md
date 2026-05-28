---
trigger: always_on
glob:
description:
---

# CBC Project Guidelines

## 1. Native ES6 Module Imports
Because this project runs in a native browser environment without a bundler (like Webpack or Vite), you cannot use "bare specifiers". 
**Rule:** When importing Three.js, you MUST use the CDN URL instead of a bare module:
`import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';`
(Do not use `import * as THREE from 'three';`)

## 2. Global State & Scoping
- **No Global Pollution**: Do not attach game logic, states, or engines to the global `window` object (e.g., avoid `window.engine`, `window.launcherState`, `window.activeGame`).
- **Encapsulation**: Use ES6 `export` and `import` to share singletons (like `SceneManager` or `LauncherState`) and utility functions across the application.
- **Read-Only Imports**: Remember that ES6 imported bindings are read-only. If you need to mutate a variable (like clearing a callback array or nullifying an animation frame ID), you must call an exported modifier function from the owning module rather than assigning it directly in the importing module.

## 3. Minigame Architecture
- Game modules should reside in `src/games/`.
- Each game should be an ES6 class module exposing standard lifecycle methods: `.init()`, `.update(delta, inputs)`, and `.destroy()`.
- The `SceneManager` handles the primary `requestAnimationFrame` loop and safely mounts/dismounts games to prevent memory leaks in Three.js.

## 4. Temporary Files Cleanup
- If you create temporary helper scripts (like `refactor_ui.js` or data parsers) to perform mass code replacements or analysis, you **MUST** always delete those temporary files when you are finished using them. Keep the project workspace pristine.
