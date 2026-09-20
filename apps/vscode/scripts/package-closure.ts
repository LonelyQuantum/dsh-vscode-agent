/** Workspace packages required by both the Host and the dynamically loaded Client. */
export interface RuntimePackage {
  directory: string
  manifest: {
    name: string
    version: string
    os?: string[]
    cpu?: string[]
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    dsh?: { client?: { inject?: string[] } }
  }
}

/**
 * Select workspace dependencies, peers, and browser injection dependencies; npm resolves external packages.
 * @param available Workspace manifests keyed by package name.
 * @param roots Application entry packages.
 * @returns A stable, cycle-safe package list.
 */
export function runtimeClosure(available: ReadonlyMap<string, RuntimePackage>, roots: readonly string[]): RuntimePackage[] {
  const selected = new Map<string, RuntimePackage>()
  const visit = (name: string): void => {
    if (selected.has(name)) return
    const entry = available.get(name)
    if (!entry) throw new Error(`VS Code runtime package is missing: ${name}`)
    selected.set(name, entry)
    const manifest = entry.manifest
    const compatible = (values: string[] | undefined, current: string): boolean =>
      values === undefined || (!values.includes(`!${current}`) && (values.every(value => value.startsWith('!')) || values.includes(current)))
    for (const dependency of new Set([
      ...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {}),
      ...manifest.dsh?.client?.inject ?? [],
    ])) if (available.has(dependency)) visit(dependency)
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      const optional = available.get(dependency)?.manifest
      if (optional && compatible(optional.os, process.platform) && compatible(optional.cpu, process.arch)) visit(dependency)
    }
  }
  for (const root of roots) visit(root)
  return [...selected.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}
