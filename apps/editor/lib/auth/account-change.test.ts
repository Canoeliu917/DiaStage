import { expect, test } from 'bun:test'
import {
  ACCOUNT_DOCUMENT_ID,
  accountChangeDestination,
  isForeignAccountChange,
} from './account-change'

test('the initiating document ignores its own login broadcast', () => {
  expect(isForeignAccountChange({ sender: ACCOUNT_DOCUMENT_ID })).toBe(false)
  expect(isForeignAccountChange({ sender: 'another-document' })).toBe(true)
  expect(isForeignAccountChange('changed')).toBe(false)
  expect(isForeignAccountChange(null)).toBe(false)
})

test('account changes replace private pages and keep same-account work intact', () => {
  expect(accountChangeDestination('a', 'a', '/scene/abc')).toBeNull()
  expect(accountChangeDestination(null, null, '/')).toBeNull()
  expect(accountChangeDestination('a', 'b', '/scene/abc?workspace=set')).toBe('/scenes')
  expect(accountChangeDestination('a', null, '/scenes')).toBe('/login?next=%2Fscenes')
  expect(accountChangeDestination('a', null, '/photo-stage')).toBe('/login?next=%2Fphoto-stage')
  expect(accountChangeDestination(null, 'b', '/?lit=1')).toBe('/?lit=1')
})
