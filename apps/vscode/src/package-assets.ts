/** Admit only a Client package's explicitly exported image files to the native Webview. */
import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

const extensions = /\.(svg|png|webp|jpg|jpeg)$/i
const inside = (root: string, path: string): boolean => {
  const part = relative(root, path)
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep)
}
const missing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT'

/**
 * Collect public asset references in resolver order without following asset-directory links.
 * @param roots Native-owned node_modules directories, with the active profile first.
 * @param signal View lifetime; no paths from the page are accepted.
 * @returns Document-relative references mapped to canonical image files, never package directories.
 */
export async function collectPackageAssets(roots: readonly string[], signal: AbortSignal): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const owners = new Set<string>()
  const visit = async (root: string, directory: string, prefix: string, name: string): Promise<void> => {
    signal.throwIfAborted()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      signal.throwIfAborted()
      if (entry.isSymbolicLink() || /[\\%#?\0]/.test(entry.name) || entry.name.toLowerCase() === 'node_modules') continue
      const file = join(directory, entry.name)
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) { await visit(root, file, path, name); continue }
      if (!entry.isFile() || !extensions.test(entry.name)) continue
      const canonical = await realpath(file)
      if (!inside(root, canonical)) throw new Error('Package asset leaves its owner')
      const encoded = path.split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g,
        char => '%' + char.charCodeAt(0).toString(16).toUpperCase())).join('/')
      result.set(`plugins/${name}/assets/${encoded}`, canonical)
      if (result.size > 4096) throw new Error('Too many public package assets')
    }
  }
  for (const modules of roots) {
    signal.throwIfAborted()
    let entries
    try { entries = await readdir(modules, { withFileTypes: true }) }
    catch (error) { if (missing(error)) continue; throw error }
    const packages: string[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('@')) {
        for (const child of await readdir(join(modules, entry.name))) packages.push(`${entry.name}/${child}`)
      } else if (!entry.name.startsWith('.')) packages.push(entry.name)
    }
    for (const name of packages) {
      signal.throwIfAborted()
      if (owners.has(name)) continue
      let manifest: unknown
      const directory = join(modules, name)
      try { manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) }
      catch (error) { if (missing(error)) continue; throw error }
      owners.add(name)
      if (typeof manifest !== 'object' || manifest === null || !('dsh' in manifest)
        || typeof manifest.dsh !== 'object' || manifest.dsh === null || !('client' in manifest.dsh)
        || !('name' in manifest) || manifest.name !== name || !('exports' in manifest)
        || typeof manifest.exports !== 'object' || manifest.exports === null
        || !('./assets/*' in manifest.exports) || manifest.exports['./assets/*'] !== './lib/assets/*') continue
      const root = await realpath(directory)
      const assets = join(root, 'lib/assets')
      try {
        if ((await lstat(join(root, 'lib'))).isSymbolicLink() || (await lstat(assets)).isSymbolicLink()) continue
        await visit(root, assets, '', name)
      } catch (error) { if (!missing(error)) throw error }
    }
  }
  return result
}

/** Own a bounded image-only directory: VS Code excludes the resource root itself from admission. */
export class PackageAssetCache {
  readonly directory: string
  private readonly lifetime = new AbortController()
  private readonly signal: AbortSignal
  private readonly files = new Set<string>()
  private bytes = 0
  private work = Promise.resolve()
  private cleanup: Promise<void> | undefined

  /** @param parent Extension-owned storage. @param signal View lifetime. */
  constructor(parent: string, signal: AbortSignal) {
    this.directory = join(parent, 'public-assets-' + randomBytes(16).toString('hex'))
    this.signal = AbortSignal.any([signal, this.lifetime.signal])
  }

  /** @param sources Validated public images. @returns References to copies below the private image root. */
  publish(sources: ReadonlyMap<string, string>): Promise<Map<string, string>> {
    const operation = this.work.then(async () => {
      this.signal.throwIfAborted()
      await mkdir(this.directory, { recursive: true })
      const published = new Map<string, string>()
      for (const [reference, source] of sources) {
        this.signal.throwIfAborted()
        const stat = await lstat(source)
        if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || !extensions.test(source)) throw new Error('Invalid public image')
        const bytes = await readFile(source, { signal: this.signal })
        if (bytes.length > 8 * 1024 * 1024) throw new Error('Public image grew beyond its bound')
        const name = createHash('sha256').update(bytes).digest('hex') + extname(source).toLowerCase()
        const target = join(this.directory, name)
        if (!this.files.has(name)) {
          if (this.files.size >= 4096 || this.bytes + bytes.length > 64 * 1024 * 1024) throw new Error('Public image cache is full')
          await writeFile(target, bytes, { signal: this.signal, flag: 'wx' })
          this.files.add(name)
          this.bytes += bytes.length
        }
        published.set(reference, target)
      }
      this.signal.throwIfAborted()
      return published
    })
    this.work = operation.then(() => {}, () => {})
    return operation
  }

  /** Cancel copies, await their settlement and remove only this view's owned directory. @returns Quiescent cleanup. */
  dispose(): Promise<void> {
    this.lifetime.abort()
    return this.cleanup ??= this.work.then(() => rm(this.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  }
}
