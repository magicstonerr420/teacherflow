import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'public/export-tools');
await mkdir(destination, { recursive: true });
async function dependency(name, expected, file) {
  const folder = path.join(root, 'node_modules', name);
  const manifest = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
  if (manifest.version !== expected) throw Error(`Update the versioned export tools for ${name} ${manifest.version}.`);
  return (await readFile(path.join(folder, file), 'utf8')).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
}
// Wrap the dependencies' official browser distributions in isolated ES modules.
// No app entry point, hashed shared chunks, global JSZip, or CDN is involved.
const zip = await dependency('jszip', '3.10.2', 'dist/jszip.min.js');
const pptx = await dependency('pptxgenjs', '4.0.1', 'dist/pptxgen.min.js');
const zipModule = `const module = {exports: {}}; const exports = module.exports; const define = undefined;\n${zip}\n`;
await writeFile(path.join(destination, 'jszip-3.10.2.mjs'), `${zipModule}export default module.exports;\n`);
await writeFile(path.join(destination, 'pptxgenjs-4.0.1-jszip-3.10.2.mjs'), `${zipModule}const JSZip = module.exports;\n${pptx}\nexport default PptxGenJS;\n`);

// A separate, self-contained recovery module can rescue an already-open old tab.
// It never imports the application entry point or requests AI generation.
await build({
  configFile: false, root, publicDir: false, logLevel: 'warn',
  resolve: { alias: { '@': path.join(root, 'src') } },
  build: {
    outDir: destination, emptyOutDir: false, minify: true,
    lib: { entry: path.join(root, 'src/lib/recover-presentation.ts'), formats: ['es'], fileName: () => 'recover-presentation-v1.mjs' },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
