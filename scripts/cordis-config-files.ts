/** Cordis Loader configuration discovery and checkout-link resolution. */

import { execFileSync } from 'node:child_process'
import { globSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

/**
 * Return repository-relative Cordis Loader YAML paths under `root`.
 *
 * Translation consistency records are YAML sidecars, never Loader inputs.
 *
 * @param root Repository root to scan.
 * @returns Sorted slash-normalized repository-relative Loader configuration paths.
 */
export function cordisConfigFiles(root: string): string[] {
  return globSync(['**/*cordis*.yml', '**/*cordis*.yaml'], {
    cwd: root,
    exclude: ['.claude/**', 'node_modules/**', 'vendor/**', '**/*.i18n.yaml'],
  }).map(file => file.replaceAll('\\', '/')).sort()
}

/**
 * Read working-tree Loader configs, following Git-indexed symlink stubs when
 * `core.symlinks=false`. Ordinary YAML scalars never become file references.
 * Link chains must resolve to files inside the repository; cycles and escapes fail.
 * @param root Repository root with a resolved Git index.
 * @returns A reader accepting repository-relative configuration paths.
 */
export function cordisConfigReader(root: string): (file: string) => string {
  const index = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const links = new Set(index.split('\0').flatMap((entry) => {
    const match = /^120000 [0-9a-f]+ 0\t(.+)$/.exec(entry)
    return match?.[1] === undefined ? [] : [match[1]]
  }))
  const base = realpathSync(root)
  const contained = (path: string): string => {
    const rel = relative(base, path).replaceAll('\\', '/')
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`Cordis config link escapes repository: ${path}`)
    return rel
  }
  return (file) => {
    let path = resolve(base, file)
    const seen = new Set<string>()
    while (true) {
      const rel = contained(path)
      if (seen.has(rel)) throw new Error(`Cordis config link cycle: ${file}`)
      seen.add(rel)
      contained(realpathSync(dirname(path)))
      const stat = lstatSync(path)
      const target = stat.isSymbolicLink() ? readlinkSync(path) : links.has(rel) ? readFileSync(path, 'utf8') : undefined
      if (target === undefined) {
        contained(realpathSync(path))
        return readFileSync(path, 'utf8')
      }
      if (!target || /[\r\n\0]/.test(target)) throw new Error(`Invalid Cordis config link target: ${rel}`)
      path = resolve(dirname(path), target)
    }
  }
}
