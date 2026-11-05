import { defineConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'

// Resolve the published runtime entry, not the declaration-only subpath.
// This is a tsdown resolution hint; the browser code still bundles the module.
const typertRemoteInfoRuntime = fileURLToPath(
  import.meta.resolve('@deepseek-ai/dsh-typert-protocol/remote-info'),
)
if (!typertRemoteInfoRuntime.endsWith('.js')) {
  throw new Error('Typert remote-info did not resolve to a runnable JavaScript entry')
}

const clientModules = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
]
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      cli: 'src/cli.ts',
      'typert.host': 'src/typert.host.ts',
      'typert.remote-client': 'src/typert.remote-client.ts',
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: true,
    clean: true,
    deps: { neverBundle: [/^@deepseek-ai\//] },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    // The pnpm/tsdown rc.5 subpath can otherwise be left as a CJS external.
    // Alias explicitly to the package's JS runtime entry, not its .d.ts metadata.
    alias: {
      '@deepseek-ai/dsh-typert-protocol/remote-info': typertRemoteInfoRuntime,
    },
    clean: false,
    dts: false,
    deps: {
      neverBundle: clientModules,
      // The DSH Web loader only supplies the modules explicitly externalized above.
      // Typert remote-info is NOT a registered DSH browser loader module.
      // Bundle its resolved JS entry and its schema dependency.
      alwaysBundle: [
        '@deepseek-ai/dsh-typert-protocol',
        '@deepseek-ai/dsh-typert-protocol/remote-info',
        'zod',
      ],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-auto-code-correct", factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
