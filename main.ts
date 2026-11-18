// SOLMARIS — handover program (Node 22, standard library only).
// Copies the playable game and its screenshots into the output directory
// and writes the dossier the bounty scores from. It runs twice and both
// runs must produce identical bytes, so there is no clock, no randomness
// and no network here: a plain copy plus the kit's dossier builder.
//
// Locally:  MAKEFUN_OUTPUT_DIR=out node main.ts
// The scorer runs it with /output as the destination.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The bounty gate's caps, as published in its rules.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// The grader gives us an empty writable /output (a Docker volume mount),
// so we only create it — never delete it: rmSync on a mount point fails
// with EBUSY and crashes the run (that was the round-1 run_completes bug).
mkdirSync(outDir, { recursive: true });

// The game itself, then its screenshots, byte for byte.
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// The dossier, built from exactly what was just copied.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, caps));

console.log(`Solmaris handed over to ${outDir}`);
