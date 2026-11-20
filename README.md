[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/vickyair1/solmaris/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/vickyair1/solmaris/reward.svg)](https://make.fun/bounty/gta6-01)

# SOLMARIS — Sun · Streets · Score

A complete, original open-world crime game that plays offline in a desktop browser from its own files. An entry for [make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

Solmaris is a sun-soaked coastal city, and everybody in it owes somebody something. You are **Riko Vale**, a driver for hire with a fast car and a faster reputation. Your fixer **Mara** works the marina — eight jobs stand between you and the big score, and the Vultures want the harbour for themselves. Drive clean or drive loud. Just don't get caught.

## What is in the game

- **A city to explore on foot and by car**: a 7×7 street grid with ~80 buildings, a park, a parking lot with parked cars, a beach, a marina with a pier and boats, palms and streetlights, drifting clouds, zebra crossings at every intersection, and a sun that follows you.
- **A living day**: the clock runs from morning into golden hour and dusk — the sun drops, the sky warms, the shadows stretch. Six named districts (Downtown, The Marina, Northside, West Docks, East Alley, The Beach) show on the HUD as you cross them.
- **Traffic and pedestrians**: 22 cars driving the streets (they turn at intersections and brake for the car ahead), 12 parked cars plus a full parking lot, and 38 pedestrians who stroll the sidewalks and scatter when trouble starts.
- **Cars to steal and drive**: sedans, taxis, sports cars and an armoured truck — arcade handling with handbrake drifts, damage, smoke and explosions. Jacking a moving car is a hold: the driver brakes, Riko works the door, the driver bails and flees, and the law notices if a unit is close.
- **A wanted level and police who respond**: 1–5 stars for stealing, hitting and shooting in public; police cars roll in along the street grid, hunt you down and try to box you in. At 3 stars **Air One**, the police helicopter, joins the chase with a searchlight, and units set **roadblocks** across the road ahead. The **dispatch board** names every responding unit — callsign, distance, status (RAMMING, CLOSING IN, RESPONDING, ROADBLOCK, SPOTLIGHT) — and the IN SIGHT / HIDDEN indicator tells you when you're clear. Break line of sight to cool off — or get busted. Or pay $200 at the **spray garage** to repaint the car and wipe the heat.
- **Missions and a story**: eight jobs for Mara — First Fare, Getaway, Harbor Heat, The Exchange, Night Shift, Rat Trap, Bank Job, The Big Score — with briefings, dialogue cards, beacons, checkpoints, timers, shootouts, escapes and a story-complete ending.
- **An arsenal and a weapon wheel**: five weapons — Fists, the SPARROW 9 pistol, the HORNET SMG, the BULLDOG shotgun and the LONGSHOT rifle — each with its own damage, range, magazine and reload. Buy them at **Harbor Arms** (ammo, vests and medkits too) with cash and respect; swap with **1–5** or open the radial wheel with **Q**.
- **Respect**: every job, fare, carjack and clean getaway earns respect. Rise from NOBODY through RUNNER, HUSTLER and BIG SHOT to KINGPIN — and better guns, garage tiers and the Big Score itself open up along the way.
- **A garage that tunes cars**: **North Garage** sells engine tiers, armour tiers, a turbo and resprays — upgrades live on the car, and the tuned car feels it: faster, tougher, and marked with a star on the vehicle panel.
- **A safehouse**: rest for free (full health and armour), save the game, and park one car in the garage — its paint and upgrades come back exactly as you left them.
- **Side work between jobs**: taxi fares — pull up to a waiting fare, drive them across town, get paid by the distance. Health and armour pickups at the hospital, police HQ, marina, bank, safehouse and garage (armour had no way to be earned before).
- **Combat**: tracers and muzzle flash, fists, armed Vultures with health bars who shoot back, and health that regens after a quiet stretch.
- **A HUD with a minimap**: wanted stars, money, clock, radio station, district name, mission objective with distance, health/armour bars, speed, a vehicle panel (model, condition, gear), and a live round minimap with the mission marker, police blips, the helicopter, pickups, enemies and shop icons.
- **A start screen and a save**: title menu with story intro and controls, pause menu, autosave to localStorage, Continue on return.
- **Synthesized sound**: engine hum, sirens, gunshots, crashes and three radio stations (SOL FM, VOLTAGE, MARINA JAZZ — switch with N), all made live with WebAudio — no audio files, no network.
- **Original everything**: own city, characters, vehicles, names, story, art and sound. No Rockstar / GTA content. Three.js (r160, minified build) is vendored under `game/vendor/`.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: **WASD** move / drive · **Mouse** camera · **Click** shoot · **F** punch · **E** enter/exit car, talk, pick up, open shops · **1–5 / Q** weapons / wheel · **Shift** run · **Space** jump / handbrake · **R** reload · **N** radio · **P** pause · **M** mute.

## Hand it over

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/game/, out/screenshots/ and out/dossier.json
```

## Layout

- `game/` — the playable game: `index.html` and `src/` (one file per system: `config`, `utils`, `textures`, `audio`, `input`, `city`, `effects`, `vehicles`, `pedestrians`, `player`, `police`, `helicopter`, `combat`, `missions`, `weapons`, `respect`, `garage`, `shops`, `pickups`, `activities`, `hud`, `save`, `shots`, `main`), plus vendored `vendor/three.module.min.js`.
- `screenshots/` — 4 real renders of the game's own code: the golden-hour getaway chase with the helicopter (cover), the title screen, the marina shootout, the big score.
- `main.ts` — the handover program; `vendor/makefun-game.ts` is the kit's file, unchanged.
