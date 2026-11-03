import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const errors = []
function check(ok, message) { if (!ok) errors.push(message) }
const bundle = pkg.dsh?.bundle
check(bundle?.patch === './cordis.patch.yml', 'Native DSH bundle patch must resolve to ./cordis.patch.yml')
check(pkg.name === 'dsh-auto-code-correct', 'Package name must match Cordis bundle name')
for (const path of ['lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'lib/cli.js', 'cordis.patch.yml']) {
  check(existsSync(resolve(path)), 'Missing packaged file: ' + path)
}
check(pkg.exports?.['.']?.default === './lib/index.js', 'Host entry export mismatch')
check(pkg.exports?.['./client']?.default === './lib/client.js', 'Client entry export mismatch')
check(pkg.bin?.['acc-tools'] === './lib/cli.js', 'CLI entry export mismatch')
const patch = readFileSync('cordis.patch.yml', 'utf8')
check(/^\s*name:\s*dsh-auto-code-correct\s*$/m.test(patch), 'Cordis patch must name the installed package')
check((pkg.files ?? []).includes('lib'), 'Published package must include lib directory')
check((pkg.files ?? []).includes('cordis.patch.yml'), 'Published package must include Cordis patch')
if (errors.length) {
  for (const error of errors) console.error('PACKAGE ERROR:', error)
  process.exitCode = 1
} else {
  console.log('Native DSH package contract OK: host, client, CLI, patch, metadata and build outputs')
}
