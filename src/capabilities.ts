/** ACC capability definitions: authoritative IDs, groups, and command hints. */
export type Language = 'python' | 'rust' | 'typescript'
export type CapabilityGroup = 'autoCorrect' | 'languageServer' | 'hygiene'
export interface Capability {
  readonly id: string
  readonly label: string
  readonly group: CapabilityGroup
  readonly language?: Language
  readonly executable: string
  readonly description: string
}
export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'ruff-fix',
    label: 'Ruff lint autofix',
    group: 'autoCorrect',
    language: 'python',
    executable: 'ruff',
    description: 'Fix Python lint diagnostics',
  },
  {
    id: 'ruff-format',
    label: 'Ruff formatter',
    group: 'autoCorrect',
    language: 'python',
    executable: 'ruff',
    description: 'Format Python files',
  },
  {
    id: 'ruff-verify',
    label: 'Ruff lint check',
    group: 'autoCorrect',
    language: 'python',
    executable: 'ruff',
    description: 'Verify Python lint',
  },
  {
    id: 'ty',
    label: 'ty',
    group: 'autoCorrect',
    language: 'python',
    executable: 'ty',
    description: 'Python type verification',
  },
  {
    id: 'ty-lsp',
    label: 'ty language server',
    group: 'languageServer',
    language: 'python',
    executable: 'ty',
    description: 'Python code navigation using the installed ty server',
  },
  {
    id: 'rustfmt',
    label: 'rustfmt',
    group: 'autoCorrect',
    language: 'rust',
    executable: 'rustfmt',
    description: 'Format Rust',
  },
  {
    id: 'clippy-fix',
    label: 'Clippy autofix',
    group: 'autoCorrect',
    language: 'rust',
    executable: 'cargo-clippy',
    description: 'Fix Rust lint',
  },
  {
    id: 'cargo-check',
    label: 'Cargo check',
    group: 'autoCorrect',
    language: 'rust',
    executable: 'cargo',
    description: 'Verify Rust compilation',
  },
  {
    id: 'clippy-verify',
    label: 'Clippy lint',
    group: 'autoCorrect',
    language: 'rust',
    executable: 'cargo-clippy',
    description: 'Verify Rust lint',
  },
  {
    id: 'rust-analyzer',
    label: 'rust-analyzer LSP',
    group: 'languageServer',
    language: 'rust',
    executable: 'rust-analyzer',
    description: 'Rust code navigation',
  },
  {
    id: 'eslint-fix',
    label: 'ESLint autofix',
    group: 'autoCorrect',
    language: 'typescript',
    executable: 'eslint',
    description: 'Fix TypeScript lint',
  },
  {
    id: 'prettier',
    label: 'Prettier',
    group: 'autoCorrect',
    language: 'typescript',
    executable: 'prettier',
    description: 'Format TypeScript',
  },
  {
    id: 'eslint-verify',
    label: 'ESLint lint',
    group: 'autoCorrect',
    language: 'typescript',
    executable: 'eslint',
    description: 'Verify TypeScript lint',
  },
  {
    id: 'typescript-check',
    label: 'TypeScript compiler',
    group: 'autoCorrect',
    language: 'typescript',
    executable: 'tsc',
    description: 'Check TypeScript types',
  },
  {
    id: 'typescript-lsp',
    label: 'TypeScript LSP',
    group: 'languageServer',
    language: 'typescript',
    executable: 'typescript-language-server',
    description: 'TypeScript code navigation',
  },
  {
    id: 'shellcheck',
    label: 'ShellCheck for staged shell scripts',
    group: 'hygiene',
    executable: 'shellcheck',
    description: 'Validate staged shell scripts when explicitly enabled',
  },
  {
    id: 'git-diff',
    label: 'Git whitespace and conflict checks',
    group: 'hygiene',
    executable: 'git',
    description: 'Check staged diff',
  },
  {
    id: 'gitleaks',
    label: 'Gitleaks',
    group: 'hygiene',
    executable: 'gitleaks',
    description: 'Scan staged changes for secrets',
  },
  {
    id: 'large-files',
    label: 'Large-file detection',
    group: 'hygiene',
    executable: 'git',
    description: 'Reject staged oversized blobs',
  },
  {
    id: 'dependency-audit',
    label: 'Dependency vulnerability scan',
    group: 'hygiene',
    executable: 'npm',
    description: 'Optional project dependency audit',
  },
  {
    id: 'license-audit',
    label: 'License review',
    group: 'hygiene',
    executable: 'license-checker',
    description: 'Optional dependency license review',
  },
  {
    id: 'history-secrets',
    label: 'Historical secret scan',
    group: 'hygiene',
    executable: 'gitleaks',
    description: 'Manual historical audit',
  },
]
export const LANGUAGE_EXTENSIONS: Readonly<Record<Language, readonly string[]>> = {
  python: ['.py'],
  rust: ['.rs'],
  typescript: ['.ts', '.tsx'],
}
export function languageForExtension(extension: string): Language | undefined {
  return (Object.keys(LANGUAGE_EXTENSIONS) as Language[]).find((lang) =>
    LANGUAGE_EXTENSIONS[lang].includes(extension),
  )
}

/** Runtime capability admission; called by both the UI model and execution path. */
export function capabilityEnabled(
  language: Language | undefined,
  capabilityId: string,
  languages: Readonly<Record<Language, boolean>>,
  toggles: Readonly<Record<string, boolean>>,
): boolean {
  if (language === undefined || languages[language] !== true) return false
  return toggles[capabilityId] !== false
}
