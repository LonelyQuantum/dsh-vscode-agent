/** Private loopback control messages; product requests still use the existing authenticated Gateway. */
import type { RawData } from 'ws'
export const SHARED_PROTOCOL = 1
/** Maximum complete boot graph or control message admitted by either peer. */
export const MAX_CONTROL_BYTES = 16 * 1024 * 1024
/** Native client identity; browser pages never hold a backend lease. */
export type ClientRole = 'desktop' | 'vscode'
/** Commands cannot run arbitrary code or select another filesystem path. */
export type ControlAction = 'inspect-quit' | 'inspect-update' | 'lock-update' | 'unlock-update' | 'release' | 'release-exclusive'
/** Boot information remains in the native carrier, except for the public Client graph. */
export interface SharedReady { url: string; injections: unknown[]; pid: number }
/** Authenticated endpoint persisted only inside the user-private control directory. */
export interface Endpoint { protocol: number; version: string; port: number; token: string; pid: number }
/** Desktop-owned launch facts contain paths and versions, never environment credentials. */
export interface DesktopLaunch {
  protocol: number
  version: string
  node: string
  runtime: string
  primaryRuntime: string
  pnpm?: string
  nodeBin?: string
}
/** Narrow a JSON object at the control/file parser. @param value Parsed input. @returns Whether it is an object map. */
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Decode bounded WebSocket bytes. @param data Complete control frame. @returns UTF-8 JSON text. */
export function controlText(data: RawData): string {
  return (Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)).toString('utf8')
}
