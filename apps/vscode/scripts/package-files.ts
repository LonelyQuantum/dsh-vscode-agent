/** Windows VSIX exclusions for compiler maps and machine-local package-manager files. */

/**
 * Generate VSIX exclusions while retaining Windows dependency launchers.
 * @param binFiles Forward-slash paths relative to staging, enumerated from dependency .bin directories.
 * @returns Newline-terminated vsce ignore rules; POSIX shims are not part of this Windows-only artifact.
 */
export function windowsArtifactIgnores(binFiles: readonly string[]): string {
  return ['**/*.map', '**/.modules.yaml', '**/.pnpm-workspace-state-v1.json',
    ...binFiles.filter(path => !/\.(?:cmd|ps1|exe)$/i.test(path)).sort(), ''].join('\n')
}
