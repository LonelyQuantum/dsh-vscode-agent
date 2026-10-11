/** Decode the runtime's complete multi-frame, packed Session log for artifact qualification. */
import { readFile } from 'node:fs/promises'
import { parseSessionLog } from '@deepseek-ai/dsh-llm-replay'
import { scanZstdFrames, decompressZstdFrame } from '@deepseek-ai/dsh-session-persistence-jsonl/src/zstd.ts'
export { generationLogPath } from '@deepseek-ai/dsh-session-persistence-jsonl/src/format.ts'
export { compressZstdFrame } from '@deepseek-ai/dsh-session-persistence-jsonl/src/zstd.ts'

/**
 * Read a settled test-owned log using the same compression and Session row readers as DSH.
 * @param path Plain or Zstandard Session log path.
 * @returns Restored semantic events.
 */
export async function readSessionLog(path: string): Promise<ReturnType<typeof parseSessionLog>> {
  const raw = await readFile(path)
  if (!path.endsWith('.zstd')) return parseSessionLog(raw.toString('utf8'))
  const scan = scanZstdFrames(raw)
  if (scan.tornStart !== undefined) throw new Error('Test Session log has an incomplete frame')
  const frames = await Promise.all(scan.frames.map(({ start, end }) => decompressZstdFrame(raw.subarray(start, end))))
  return parseSessionLog(Buffer.concat(frames).toString('utf8'))
}
