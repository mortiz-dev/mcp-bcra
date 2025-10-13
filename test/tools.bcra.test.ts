import { describe, it, expect } from 'vitest'
import { textResponse } from '../src/tools/bcra.js'

describe('bcra tools helper', () => {
  it('textResponse wraps data correctly', () => {
    const data = { foo: 'bar' }
    const res = textResponse(data)
    expect(res).toHaveProperty('content')
    expect(Array.isArray(res.content)).toBe(true)
    expect(res.content[0]).toHaveProperty('type', 'text')
    expect(res.content[0]).toHaveProperty('text')
    expect(JSON.parse(res.content[0].text)).toEqual(data)
  })
})
