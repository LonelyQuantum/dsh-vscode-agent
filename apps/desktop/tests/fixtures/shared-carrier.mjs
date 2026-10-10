/** Independent native-client process for cross-process shared-backend startup tests. */
const { acquireSharedHost } = await import(process.argv[2])
let acquiring
let stopped = false
const stop = async () => {
  stopped = true
  const client = await acquiring?.catch(() => undefined)
  await client?.close()
  if (process.connected) process.disconnect()
}
process.once('disconnect', () => { void stop() })
process.on('message', message => {
  if (message.type === 'release') { void stop(); return }
  if (message.type !== 'acquire' || acquiring || stopped) return
  acquiring = acquireSharedHost(message.options)
  void acquiring.then(async client => {
    if (stopped) { await client.close(); return }
    process.send?.({ type: 'ready', pid: client.ready.pid })
  }).catch(() => { process.send?.({ type: 'failed' }); void stop() })
})
process.send?.({ type: 'waiting' })
