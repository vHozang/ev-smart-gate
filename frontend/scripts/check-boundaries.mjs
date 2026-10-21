import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
const root = resolve('src');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
      ),
    )
  ).flat();
}
const files = (await walk(root)).filter(
  (file) => /\.[jt]sx?$/.test(file) && !file.includes('generated'),
);
const errors = [];
const graph = new Map();
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const from = relative(root, file).replaceAll('\\', '/');
  const imports = [...source.matchAll(/(?:from\s*|import\s*\(|import\s*)['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  const targets = [];
  for (const specifier of imports) {
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) continue;
    const target = specifier.startsWith('@/')
      ? join(root, specifier.slice(2))
      : resolve(dirname(file), specifier);
    const to = relative(root, target).replaceAll('\\', '/');
    if (from.startsWith('shared/') && /^(app|features|pages|layouts|widgets)\//.test(to))
      errors.push(`${from} -> ${to}: shared không import layer trên`);
    if (from.startsWith('features/') && /^(app|pages|layouts|widgets)\//.test(to))
      errors.push(`${from} -> ${to}: feature không import layer trên`);
    if (specifier.startsWith('@/features/')) {
      const segments = specifier.split('/');
      if (segments.length > 3 && from.split('/')[1] !== segments[2])
        errors.push(`${from}: deep import feature ${specifier}`);
    }
    if (
      from.startsWith('pages/') &&
      to.startsWith('pages/') &&
      from.split('/')[1] !== to.split('/')[1]
    )
      errors.push(`${from}: page không import page khác`);
    const candidate = [
      target,
      ...['.ts', '.tsx', '/index.ts', '/index.tsx'].map((suffix) => target + suffix),
    ].find((path) => files.includes(path));
    if (candidate) targets.push(candidate);
  }
  graph.set(file, targets);
  if (
    /\.tsx$/.test(file) &&
    !from.startsWith('app/') &&
    !from.startsWith('features/') &&
    !from.includes('/index.') &&
    from !== 'main.tsx'
  ) {
    const index = join(dirname(file), 'index.ts');
    if (!files.includes(index)) errors.push(`${from}: thiếu index.ts`);
  }
}
const visited = new Set();
const stack = new Set();
function visit(file) {
  if (stack.has(file)) {
    errors.push(`Circular import tại ${relative(root, file)}`);
    return;
  }
  if (visited.has(file)) return;
  stack.add(file);
  for (const dependency of graph.get(file) || []) visit(dependency);
  stack.delete(file);
  visited.add(file);
}
for (const file of files) visit(file);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Đã kiểm tra boundaries, exports và circular imports: ${files.length} files.`);
