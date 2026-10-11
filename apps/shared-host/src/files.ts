/** Private discovery files and credential-free native launch records. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, mkdir, readFile, realpath, chmod } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { record, SHARED_PROTOCOL, type SharedLaunch, type Endpoint } from './protocol.ts'

const execute = promisify(execFile)

/**
 * Prepare only the owned control subdirectory; refuse links and non-private POSIX ownership.
 * Windows ACLs replace inherited access on this subdirectory, not the user's Harness home.
 * @param home Existing, explicitly selected Harness home.
 * @returns Canonical control directory.
 */
export async function controlDirectory(home: string): Promise<string> {
  const root = await realpath(home)
  const directory = join(root, '.shared-host')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Shared backend control directory must not be a link')
  if (process.platform === 'win32') {
    // A protected, exact DACL removes pre-existing broad grants as well as inheritance.
    const script = "$ErrorActionPreference='Stop';$p=$env:DSH_SHARED_CONTROL_DIRECTORY;"
      + "$a=[System.IO.Directory]::GetAccessControl($p,'Access,Owner');$i=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;"
      + "if(-not $a.GetOwner([System.Security.Principal.SecurityIdentifier]).Equals($i)){throw 'Unexpected control directory owner'};"
      + '$a.SetAccessRuleProtection($true,$false);foreach($r in @($a.Access)){$a.RemoveAccessRuleSpecific($r)};'
      + "$r=New-Object System.Security.AccessControl.FileSystemAccessRule($i,'FullControl','ContainerInherit,ObjectInherit','None','Allow');"
      + '$a.AddAccessRule($r);[System.IO.Directory]::SetAccessControl($p,$a)'
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, env: { ...process.env, DSH_SHARED_CONTROL_DIRECTORY: directory } })
  } else {
    if (info.uid !== process.getuid?.()) throw new Error('Shared backend control directory has a different owner')
    await chmod(directory, 0o700)
  }
  return directory
}

/** Read bounded private JSON without following a planted file link. @param path Owned record. @returns Parsed JSON or absence. */
export async function readRecord(path: string): Promise<unknown> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new Error('Invalid shared backend record')
    if (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)) {
      throw new Error('Shared backend record must be owner-only')
    }
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error('Shared backend record is unreadable')
  }
}

/** Validate native launcher fields. @param value Disk input. @returns Validated launch record. */
export function parseLaunch(value: unknown): SharedLaunch {
  if (!record(value) || value.protocol !== SHARED_PROTOCOL || typeof value.version !== 'string'
    || typeof value.node !== 'string' || !isAbsolute(value.node)
    || typeof value.runtime !== 'string' || !isAbsolute(value.runtime)
    || (value.primaryRuntime !== undefined && (typeof value.primaryRuntime !== 'string' || !isAbsolute(value.primaryRuntime)))
    || (value.pnpm !== undefined && (typeof value.pnpm !== 'string' || !isAbsolute(value.pnpm)))
    || (value.nodeBin !== undefined && (typeof value.nodeBin !== 'string' || !isAbsolute(value.nodeBin)))) {
    throw new Error('Invalid shared backend launcher; rebuild or reinstall the native client')
  }
  return { protocol: SHARED_PROTOCOL, version: value.version, node: value.node, runtime: value.runtime,
    ...(typeof value.primaryRuntime === 'string' ? { primaryRuntime: value.primaryRuntime } : {}),
    ...(typeof value.pnpm === 'string' ? { pnpm: value.pnpm } : {}),
    ...(typeof value.nodeBin === 'string' ? { nodeBin: value.nodeBin } : {}) }
}

/** Validate loopback discovery data. @param value Disk input. @returns Endpoint, or absence. */
export function parseEndpoint(value: unknown): Endpoint | undefined {
  if (value === undefined) return undefined
  if (!record(value) || value.protocol !== SHARED_PROTOCOL || typeof value.version !== 'string'
    || typeof value.port !== 'number' || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535
    || typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid < 1
    || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error('Invalid shared backend endpoint')
  return { protocol: value.protocol, version: value.version, port: value.port, pid: value.pid, token: value.token }
}

/**
 * Atomically publish private control data.
 * @param path Owned destination.
 * @param value Record to persist.
 * @returns Durable write completion.
 */
export async function writeRecord(path: string, value: object): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(value) + '\n', { mode: 0o600, dirMode: 0o700 })
}
