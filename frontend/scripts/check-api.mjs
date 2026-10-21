import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'evsg-fe-contract-'));
try {
  const output = join(directory, 'runtime.d.ts');
  const generated = spawnSync(
    process.execPath,
    ['node_modules/openapi-typescript/bin/cli.js', '../docs/openapi.json', '-o', output],
    { encoding: 'utf8' },
  );
  if (generated.status !== 0) throw new Error(generated.stderr || generated.stdout);
  const current = await readFile('src/shared/api/generated/runtime.d.ts', 'utf8');
  if (
    current.replaceAll('\r\n', '\n') !== (await readFile(output, 'utf8')).replaceAll('\r\n', '\n')
  )
    throw new Error('DTO drift: chạy npm run api:generate và review contract.');
  console.log('DTO khớp OpenAPI snapshot của API v1 hiện có.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
