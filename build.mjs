// Сборка: сервер и мини-апп одним инструментом (esbuild).
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/web', { recursive: true });

await build({
  entryPoints: ['server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/server.js',
  external: ['pg'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

await build({
  entryPoints: ['web/src/main.tsx'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'dist/web/app.js',
  minify: true,
  jsx: 'automatic',
  loader: { '.svg': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
});

copyFileSync('web/index.html', 'dist/web/index.html');
copyFileSync('web/styles.css', 'dist/web/styles.css');
console.log('build ok');
