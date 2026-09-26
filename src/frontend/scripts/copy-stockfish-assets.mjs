import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = resolve(frontendDirectory, 'node_modules/stockfish/bin');
const outputDirectory = resolve(frontendDirectory, 'public/stockfish');
const engineFiles = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(engineFiles.map((file) => copyFile(resolve(sourceDirectory, file), resolve(outputDirectory, file))));