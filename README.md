# Meadow Waltz

A cozy low-poly third-person exploration prototype built with Three.js, TypeScript, and Rapier.

Meadow Waltz is an early-stage browser game about moving through a small, colorful world. The current prototype includes an animated character, responsive movement and jumping, a smooth follow camera, physics, environmental audio, dynamic shadows, and a meadow populated with deterministic procedural decorations.

## Current features

- Third-person walking, running, turning, and jumping
- Animated FBX character with state-based animation transitions
- Rapier character controller, gravity, ground collision, slopes, and autostep
- Smooth frame-rate-independent follow camera
- Low-poly vegetation distributed with a seeded random generator
- Directional lighting with stabilized shadow mapping
- Background music, footsteps, and jump sound effects
- Optional debug GUI with FPS, audio, player, shadow, and physics controls
- Hot-module-reload cleanup for rendering, physics, input, audio, and debug state

## Tech stack

- [Three.js](https://threejs.org/) for rendering, animation, and scene management
- [Rapier](https://rapier.rs/) for physics and character movement
- [Howler.js](https://howlerjs.com/) for audio playback
- [lil-gui](https://lil-gui.georgealways.com/) for runtime debug controls
- [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/) for development and builds

## Getting started

The project uses Yarn Classic and includes a Yarn v1 lockfile.

```sh
yarn install
yarn dev
```

Open the local URL printed by Vite. Browser audio may remain suspended until the first keyboard, mouse, or touch interaction.

To create and preview a production build:

```sh
yarn build
yarn preview
```

## Controls

| Input | Action |
| --- | --- |
| `W`, `A`, `S`, `D` | Move |
| Left `Shift` | Run |
| `Space` | Jump |

## Debug mode

Append `?debug` to the application URL:

```text
http://localhost:5173/?debug
```

Debug mode enables the runtime GUI and Rapier wireframe rendering. The GUI exposes rendering FPS, audio controls, player state and movement speeds, and shadow settings.

## Project structure

```text
src/
├── main.ts                 Application composition and lifecycle
├── Engine.ts               Render loop, camera, renderer, and timing
├── Entity.ts               Base entity lifecycle
├── EntityManager.ts        Scene attachment, updates, and removal
├── LoaderManager.ts        Typed model, texture, and sound registry
├── PhysicsManager.ts       Rapier world lifecycle and simulation
├── AudioManager.ts         Sound playback and debug controls
├── DebugManager.ts         Debug GUI and rendering statistics
└── entities/
    ├── Ground/             Terrain and procedural decoration
    ├── Player/             Character movement and presentation
    ├── FollowCamera.ts
    ├── Sun.ts
    └── Tree.ts

public/
├── models/                 GLB and FBX assets
├── textures/
└── audio/
```

## Project status

Meadow Waltz is currently a gameplay and engine prototype rather than a complete game. The foundational systems are in place for expanding the world with interaction, exploration objectives, collectibles, farming, or other cozy-game mechanics.

## Assets and licensing

All assets were downloaded from [OpenGameArt](https://opengameart.org/), with the models created by [Quaternius](https://quaternius.com/). They are released under the [CC0 license](https://creativecommons.org/publicdomain/zero/1.0/) and are free to use in both personal and commercial projects.

The repository does not currently include a project license.
