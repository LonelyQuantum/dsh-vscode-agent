/** Credit-controlled raw attachment uploads; ordinary RPC frames retain their smaller bound. */
export const UPLOAD_PATH = '/api/session/uploadFileBinary'
export const UPLOAD_LIMIT = 50 * 1024 * 1024
export const UPLOAD_CHUNK = 64 * 1024

/** Own one request body, allowing only one bounded chunk per native pull. */
export class UploadBody {
  readonly stream: ReadableStream<Uint8Array>
  private pending: { resolve(): void; reject(error: Error): void } | undefined
  private bytes = 0
  private controller!: ReadableStreamDefaultController<Uint8Array>

  /** @param pull Ask the carrier for the next chunk. @param signal Request lifetime. */
  constructor(pull: () => Promise<void>, signal: AbortSignal) {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller
        signal.addEventListener('abort', () => {
          const error = new DOMException('Aborted', 'AbortError')
          this.pending?.reject(error)
          this.pending = undefined
          try { controller.error(error) } catch { /* The fetch may already have closed its body. */ }
        }, { once: true })
      },
      pull: () => new Promise<void>((resolve, reject) => {
        signal.throwIfAborted()
        this.pending = { resolve, reject }
        void pull().catch(reject)
      }),
    }, { highWaterMark: 0 })
  }

  /** Accept a single wire chunk or EOF, rejecting unsolicited and oversized input. @param data Base64, or null for EOF. */
  accept(data: unknown): void {
    const credit = this.pending
    if (!credit) throw new Error('Upload has no pending read')
    if (data === null) {
      this.pending = undefined
      this.controller.close()
      credit.resolve()
      return
    }
    if (typeof data !== 'string' || data.length > Math.ceil(UPLOAD_CHUNK / 3) * 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error('Invalid upload chunk')
    const chunk = Buffer.from(data, 'base64')
    if (!chunk.length || chunk.length > UPLOAD_CHUNK || this.bytes + chunk.length > UPLOAD_LIMIT) throw new Error('Upload too large')
    this.bytes += chunk.length
    this.pending = undefined
    this.controller.enqueue(chunk)
    credit.resolve()
  }
}
