import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWebSearchPreferences, webSearchPreferenceKey } from '../src/builder/chat/webSearchPreference.ts'

function mockStorage() {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
}

test('联网状态按账号、项目、会话隔离，刷新后恢复原设置', () => {
  const storage = mockStorage()
  const preferences = createWebSearchPreferences(() => storage)
  const key = webSearchPreferenceKey('alice', 110, 7)
  assert.equal(preferences.get(key), false)
  preferences.set(key, true)
  assert.equal(createWebSearchPreferences(() => storage).get(key), true)
  for (const other of [webSearchPreferenceKey('bob', 110, 7), webSearchPreferenceKey('alice', 111, 7), webSearchPreferenceKey('alice', 110, 8)]) {
    assert.equal(preferences.get(other), false)
  }
  preferences.set(key, false)
  assert.equal(createWebSearchPreferences(() => storage).get(key), false)
})

test('首条消息创建会话后迁移草稿设置，新草稿恢复默认关闭', () => {
  const storage = mockStorage()
  const preferences = createWebSearchPreferences(() => storage)
  const draft = webSearchPreferenceKey('alice', 110, -1)
  const conversation = webSearchPreferenceKey('alice', 110, 99)
  preferences.set(draft, true)
  preferences.move(draft, conversation, true)
  assert.equal(preferences.get(conversation), true)
  assert.equal(preferences.get(draft), false)
  assert.equal(createWebSearchPreferences(() => storage).get(conversation), true)
})

test('损坏、缺失或未初始化的设置均默认关闭', () => {
  const storage = mockStorage()
  const preferences = createWebSearchPreferences(() => storage)
  const key = webSearchPreferenceKey('alice', 110, 7)
  for (const value of ['false', '1', 'TRUE', 'invalid']) {
    storage.setItem(key, value)
    assert.equal(preferences.get(key), false)
  }
  assert.equal(webSearchPreferenceKey('', 110, 7), null)
  assert.equal(webSearchPreferenceKey('alice', 0, 7), null)
  assert.equal(preferences.get(null), false)
})

test('浏览器存储被禁用时，仍可在当前页面切换和迁移设置', () => {
  const preferences = createWebSearchPreferences(() => {
    throw new Error('Storage disabled')
  })
  preferences.set('draft', true)
  assert.equal(preferences.get('draft'), true)
  preferences.move('draft', 'conversation', true)
  assert.equal(preferences.get('conversation'), true)
  assert.equal(preferences.get('draft'), false)
})
