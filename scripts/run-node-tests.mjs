import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collect(path))
    else if (entry.isFile() && entry.name.endsWith('.node.test.ts')) files.push(path)
  }
  return files
}

const files = (await collect('src')).sort()
if (files.length === 0) {
  console.error('No *.node.test.ts files found under src/')
  process.exit(1)
}
console.log(`Running ${files.length} Node test files`)
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], { stdio: 'inherit' })
if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
