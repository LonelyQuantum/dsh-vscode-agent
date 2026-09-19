/** Protocol-only child; shutdown ownership is independent of the Cordis graph. */
process.on('message', message => {
  if (message?.type === 'shutdown') process.disconnect()
})
process.send({ type: 'ready', url: 'http://127.0.0.1:12345/?token=test-only', injections: [] })
