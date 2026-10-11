/** Protocol fixture reports no secret material over its private readiness channel. */
if (process.env.DEEPSEEK_API_KEY !== 'fixture-only-key') throw new Error('Missing fixture credential')
process.send({ type: 'ready', url: 'http://127.0.0.1:12345/?token=fixture', injections: [] })
process.on('message', message => { if (message.type === 'shutdown') process.disconnect() })
