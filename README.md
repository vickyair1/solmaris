[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/vickyair1/solmaris/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/vickyair1/solmaris/reward.svg)](https://make.fun/bounty/gta6-01)

# SOLMARIS — Sun · Streets · Score

A complete, original open-world crime game that plays offline in a desktop browser from its own files. An entry for [make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

Solmaris is a sun-soaked coastal city, and everybody in it owes somebody something. You are **Riko Vale**, a driver for hire with a fast car and a faster reputation. Your fixer **Mara** works the marina — five jobs stand between you and the big score, and the Vultures want the harbour for themselves. Drive clean or drive loud. Just don't get caught.

## What is in the game

- **A city to explore on foot and by car**: a 7×7 street grid with ~80 buildings, a park, a parking lot, a beach, a marina with a pier and boats, palms and streetlights, drifting clouds and a sun that follows you.
- **Traffic and pedestrians**: 16 cars driving the streets (they turn at intersections and brake for the car ahead), 10 parked cars, and 26 pedestrians who stroll the sidewalks and scatter when trouble starts.
- **Cars to steal and drive**: sedans, taxis, sports cars and an armoured truck — arcade handling with handbrake drifts, damage, smoke and explosions.
- **A wanted level and police who respond**: 1–5 stars for stealing, hitting and shooting in public; police cars roll in along the street grid, hunt you down and try to box you in. Break line of sight to cool off — or get busted.
- **Missions and a story**: five jobs for Mara — First Fare, Getaway, Harbor Heat, The Exchange, The Big Score — with briefings, beacons, checkpoints, a timer, and a story-complete ending.
- **Combat**: a pistol with tracers and muzzle flash, fists, armed Vultures with health bars who shoot back, and health that regens after a quiet stretch.
- **A HUD with a minimap**: wanted stars, money, clock, mission objective with distance, health/armour bars, speed, and a live round minimap with the mission marker, police blips and enemies.
- **A start screen and a save**: title menu with story intro and controls, pause menu, autosave to localStorage, Continue on return.
- **Synthesized sound**: engine hum, sirens, gunshots, crashes and a bass loop, all made live with WebAudio — no audio files, no network.
- **Original everything**: own city, characters, vehicles, names, story, art and sound. No Rockstar / GTA content. Three.js (r160, minified build) is vendored under `game/vendor/`.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: **WASD** move / drive · **Mouse** camera · **Click** shoot · **F** punch · **E** enter/exit car, talk, pick up · **Shift** run · **Space** jump / handbrake · **R** reload · **P** pause · **M** mute.

## Hand it over

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/game/, out/screenshots/ and out/dossier.json
```

## Layout

- `game/` — the playable game: `index.html` and `src/` (one file per system: `config`, `utils`, `textures`, `audio`, `input`, `city`, `effects`, `vehicles`, `pedestrians`, `player`, `police`, `combat`, `missions`, `hud`, `save`, `shots`, `main`), plus vendored `vendor/three.module.min.js`.
- `screenshots/` — 4 real renders of the game's own code: the getaway chase (cover), the title screen, the marina shootout, the big score.
- `main.ts` — the handover program; `vendor/makefun-game.ts` is the kit's file, unchanged.
