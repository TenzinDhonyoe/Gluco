#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');
const EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);
const ROUTE_CALL_REGEX = /router\.(?:push|replace|navigate|dismissTo)\(\s*(?:\{\s*pathname\s*:\s*['"`]([^'"`]+)['"`]|['"`]([^'"`]+)['"`])/g;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function toRoutePath(filePath) {
  const rel = path.relative(APP_DIR, filePath).replace(/\\/g, '/');
  const noExt = rel.replace(/\.[^.]+$/, '');
  const segments = noExt.split('/');

  if (segments[segments.length - 1] === 'index') {
    segments.pop();
  }
  if (segments.length === 0) return '/';
  return `/${segments.join('/')}`;
}

function normalizeRoute(route) {
  if (!route.startsWith('/')) return null;
  if (route.includes('${')) return null;

  let out = route.split('?')[0].trim();
  if (!out) return null;
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function main() {
  if (!fs.existsSync(APP_DIR)) {
    console.error('Missing app directory.');
    process.exit(1);
  }

  const appFiles = walk(APP_DIR);
  const knownRoutes = new Set(appFiles.map(toRoutePath));

  const failures = [];

  for (const file of appFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(ROOT, file).replace(/\\/g, '/');

    let match;
    while ((match = ROUTE_CALL_REGEX.exec(source)) !== null) {
      const rawRoute = match[1] || match[2];
      const route = normalizeRoute(rawRoute);
      if (!route) continue;
      if (!knownRoutes.has(route)) {
        failures.push({ file: relFile, route });
      }
    }
  }

  if (failures.length > 0) {
    console.error('Route integrity check failed. Missing route files for:');
    for (const failure of failures) {
      console.error(`- ${failure.route} (referenced in ${failure.file})`);
    }
    process.exit(1);
  }

  console.log(`Route integrity check passed (${knownRoutes.size} routes scanned).`);
}

main();
