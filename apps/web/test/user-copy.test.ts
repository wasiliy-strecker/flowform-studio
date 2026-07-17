import { describe, expect, it } from 'vitest'

import { resources } from '../src/i18n'

describe('user-facing copy', () => {
  it('does not contain semicolons in either locale', () => {
    expect(JSON.stringify(resources)).not.toContain(';')
  })
})
