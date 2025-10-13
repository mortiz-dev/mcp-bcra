import { describe, it, expect } from 'vitest'
import createServer from '../src/server.js'

describe('server factory', () => {
  it('createServer returns a server-like object', () => {
    const server = createServer()
    expect(server).toBeTruthy()
    // the SDK server exposes a `tool` method used to register tools
    expect(typeof server.tool).toBe('function')
    // connect is a method on the real server; we don't call it here
    expect(typeof server.connect).toBe('function')
  })
})
