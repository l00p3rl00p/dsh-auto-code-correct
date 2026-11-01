import { defineConfig } from 'tsdown'

const clientModules = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
]
export default defineConfig([
  {
    entry: ['src/index.ts', 'src/cli.ts'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: true,
    clean: true,
    deps: { neverBundle: [/^@deepseek-ai\\//] },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    clean: false,
    dts: false,
    deps: {
      neverBundle: clientModules,
      alwaysBundle: (name: string) => clientModules.includes(name) ? undefined : true,
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-auto-code-correct", factory: (require) => {\\nvar module = { exports: {} };\\nvar exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
