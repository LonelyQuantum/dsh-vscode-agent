/** Local publication checks; Marketplace account ownership and editor acceptance remain manual requirements. */

/** Packaged disclosures and runtime entries required for a community preview. */
export const RELEASE_FILES = ['package.json', 'README.md', 'README.zh.md', 'CHANGELOG.md', 'PRIVACY.md',
  'LICENSE', 'THIRD_PARTY_NOTICES.md', 'resources/marketplace.png', 'extension.cjs', 'host.mjs', 'runtime.json',
  'runtime/pnpm-lock.yaml', 'runtime/node_modules/@deepseek-ai/dsh/lib/profile-boot.js',
  'runtime/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'] as const

/**
 * Inspect a disk manifest before packaging or preparing a Marketplace upload.
 * @param value Parsed manifest JSON.
 * @param marketplace Whether a non-placeholder publisher is required.
 * @returns Actionable local errors, never a claim of Marketplace account verification.
 */
export function manifestProblems(value: unknown, marketplace: boolean): string[] {
  if (typeof value !== 'object' || value === null) return ['Extension manifest must be an object']
  const manifest = value as Record<string, unknown>
  const problems: string[] = []
  if (typeof manifest.publisher !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(manifest.publisher)) problems.push('Set a valid publisher ID')
  if (marketplace && manifest.publisher === 'dsh-local') problems.push('Replace dsh-local with your registered Marketplace publisher ID')
  if (manifest.preview !== true) problems.push('Keep this community preview marked preview')
  if (typeof manifest.displayName !== 'string' || !manifest.displayName.includes('Community')) problems.push('Identify the extension as a community build')
  if (manifest.icon !== 'resources/marketplace.png') problems.push('Include the generated PNG Marketplace icon')
  const repository = manifest.repository
  if (typeof repository !== 'object' || repository === null || !('url' in repository)
    || typeof repository.url !== 'string' || !repository.url.startsWith('https://github.com/')) problems.push('Declare the public source repository')
  if (typeof manifest.homepage !== 'string' || !manifest.homepage.startsWith('https://')) problems.push('Declare an HTTPS homepage')
  return problems
}

/**
 * Check the file list selected by vsce, including its ignore rules.
 * @param files Forward-slash package-relative filenames.
 * @returns Missing deliverables or excluded local-state filenames, without reading secret values.
 */
export function artifactProblems(files: readonly string[]): string[] {
  const present = new Set(files)
  return [
    ...RELEASE_FILES.filter(file => !present.has(file)).map(file => `Missing release file: ${file}`),
    ...files.filter(file => /(^|\/)(?:\.git|\.shared-host)\//.test(file)
      || /(^|\/)(?:\.env(?:\.(?:local|production|development))?|development\.json)$/.test(file)
      || /(^|\/)(?:\.modules\.yaml|\.pnpm-workspace-state-v1\.json)$/.test(file)
      || file.endsWith('.map')).map(file => `Local state or debug artifact must not ship: ${file}`),
  ]
}
