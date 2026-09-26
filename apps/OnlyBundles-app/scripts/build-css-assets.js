#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { resolveCssImports } from './build-css-assets/css-imports.js';
import { createTargets } from './build-css-assets/targets.js';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

for (const { source, target } of createTargets(ROOT_DIR)) {
  if (!existsSync(source)) {
    throw new Error(`Missing CSS source: ${relative(ROOT_DIR, source)}`);
  }

  const css = `${resolveCssImports(source, readFileSync(source, 'utf-8')).trimEnd()}\n`;
  writeFileSync(target, css, 'utf-8');
  console.log(`Built ${relative(ROOT_DIR, target)}`);
}
