/** Validation of complete captured versions received from the owned runtime. */

/** Read-only text pair; null distinguishes a missing side from an empty file. */
export interface CapturedPair { display: string; before: string | null; after: string | null }

/**
 * Admit complete captured text without reconstructing hunks or reading today's files.
 * @param value Decoded Host response.
 * @returns Bounded complete pair.
 */
export function capturedPair(value: unknown): CapturedPair {
  if (typeof value !== 'object' || value === null) throw new Error('invalid-capture')
  const row = value as Record<string, unknown>
  if (row.kind === 'binary' || row.kind === 'oversized') throw new Error(row.kind)
  if (row.kind !== 'text' || typeof row.display !== 'string' || row.display.length > 4096
    || !(row.before === null || typeof row.before === 'string') || !(row.after === null || typeof row.after === 'string')) {
    throw new Error('invalid-capture')
  }
  if (Buffer.byteLength(row.before ?? '') + Buffer.byteLength(row.after ?? '') > 4 * 1024 * 1024) throw new Error('oversized')
  return { display: row.display, before: row.before, after: row.after }
}
