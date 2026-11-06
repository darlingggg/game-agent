import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive, nextTick, watchEffect } from 'vue'
import { appendMessageText, liveToolParts, restoreMessageTools, settleTools, summarizeTools, upsertTool } from '../src/builder/chat/toolInvocations.ts'

test('工具乱序完成只更新对应行，保持参数、图片和展开状态', () => {
  const message = { content: '开始。', tools: [], imageTasks: [{ taskId: 1, toolCallId: 'b' }] }
  upsertTool(message, { toolCallId: 'a', name: 'get_file_content', args: { path: 'a.vue' } })
  upsertTool(message, { toolCallId: 'b', name: 'generate_image' })
  message.tools[1].expanded = true
  upsertTool(message, { toolCallId: 'b', status: 'succeeded', result: { url: 'b.png' } })
  upsertTool(message, { toolCallId: 'a', status: 'failed', error: '失败' })
  upsertTool(message, { toolCallId: 'a', status: 'running' })
  assert.equal(message.tools[0].args.path, 'a.vue')
  assert.equal(message.tools[1].expanded, true)
  assert.equal(message.tools[1].imageTasks[0].taskId, 1)
  assert.equal(message.tools.length, 2)
  assert.equal(message.tools[0].status, 'failed')
  assert.equal(summarizeTools(message.tools).failed, 1)
})

test('文本与工具按开始位置穿插，同一位置的并行工具保持开始顺序', () => {
  const tools = [
    { toolCallId: 'b', sequence: 2, textOffset: 3 },
    { toolCallId: 'a', sequence: 1, textOffset: 3 },
    { toolCallId: 'c', sequence: 3, textOffset: 6 },
  ]
  const parts = liveToolParts('先看。再改。完成。', tools)
  assert.deepEqual(
    parts.map((part) => part.text ?? part.tools.map((tool) => tool.toolCallId)),
    ['先看。', ['a', 'b'], '再改。', ['c'], '完成。'],
  )
})

test('连续调用跨轮次与空白合并，正文分隔后独立成组', () => {
  const tools = [
    { toolCallId: 'list', sequence: 1, textOffset: 0 },
    { toolCallId: 'read', sequence: 2, textOffset: 2 },
    { toolCallId: 'write', sequence: 3, textOffset: 6 },
  ]
  const parts = liveToolParts('\n\n准备修改完成', tools)
  assert.deepEqual(
    parts.map((part) => part.text ?? part.tools.map((tool) => tool.toolCallId)),
    [['list', 'read'], '准备修改', ['write'], '完成'],
  )
})

test('追加工具和更新状态不改变分组标识，不丢失单条详情或修改原始记录', () => {
  const first = { toolCallId: 'read', sequence: 1, textOffset: 0, status: 'running', expanded: true }
  const tools = [first]
  const original = liveToolParts('', tools)[0]
  first.status = 'succeeded'
  tools.push({ toolCallId: 'search', sequence: 2, textOffset: 0, status: 'failed' })
  const group = liveToolParts('', tools)[0]
  assert.equal(group.id, original.id)
  assert.equal(original.tools.length, 1)
  assert.equal(group.tools.length, 2)
  assert.equal(group.tools[0], first)
  assert.equal(group.tools[0].expanded, true)
  assert.equal(group.tools[1].status, 'failed')
})

test('大量同批调用只生成一个工具组，历史记录按 sequence 排序', () => {
  const tools = Array.from({ length: 100 }, (_, index) => ({
    toolCallId: `tool-${index + 1}`,
    sequence: index + 1,
    textOffset: 0,
  })).reverse()
  const parts = liveToolParts('完成', tools)
  assert.equal(parts.length, 2)
  assert.equal(parts[0].tools.length, 100)
  assert.equal(parts[0].tools[0].toolCallId, 'tool-1')
  assert.equal(parts[0].tools.at(-1).toolCallId, 'tool-100')
  assert.equal(parts[1].text, '完成')
  assert.equal(tools[0].toolCallId, 'tool-100')
})

test('停止只终止运行中工具，保留已经完成的结果', () => {
  const message = {
    content: '',
    tools: [
      { toolCallId: 'a', status: 'succeeded', result: '已保存' },
      { toolCallId: 'b', status: 'running' },
    ],
  }
  settleTools(message, 'cancelled')
  assert.equal(message.tools[0].status, 'succeeded')
  assert.equal(message.tools[0].result, '已保存')
  assert.equal(message.tools[1].status, 'cancelled')
  assert.equal(message.toolSummary.cancelled, 1)
})

test('多轮流式正文与工具增量穿插，空白不分组，历史重建结果一致', () => {
  const message = { content: '', parts: [], tools: [] }
  const append = (text) => appendMessageText(message, text)
  const start = (id) => upsertTool(message, { toolCallId: id, name: 'get_file_content' })
  append('先')
  append('看。')
  start('a')
  start('b')
  append('\n\n')
  start('c')
  append('再改。')
  start('d')
  append('完成。')
  const parts = message.parts
  assert.deepEqual(
    parts.map((part) => part.text ?? part.tools.map((tool) => tool.toolCallId)),
    ['先看。', ['a', 'b', 'c'], '再改。', ['d'], '完成。'],
  )
  assert.deepEqual(parts, liveToolParts(message.content, message.tools))
  const history = { content: message.content }
  restoreMessageTools(history, [...message.tools].reverse())
  assert.deepEqual(history.parts, parts)
  assert.equal(history.toolsLoaded, true)
})

test('正文与终态更新保持已有片段和工具组引用，工具只追加一次', () => {
  const message = { content: '', parts: [], tools: [] }
  appendMessageText(message, '准备。')
  const firstText = message.parts[0]
  const a = upsertTool(message, { toolCallId: 'a', name: 'search_web', args: { query: '文档' } })
  const parts = message.parts
  const group = parts[1]
  const groupTools = group.tools
  a.expanded = true
  for (let index = 0; index < 1000; index++) appendMessageText(message, '字')
  const tail = parts[2]
  assert.equal(tail.text.length, 1000)
  assert.equal(parts.length, 3)
  upsertTool(message, { toolCallId: 'a', status: 'failed', error: '请求失败' })
  upsertTool(message, { toolCallId: 'a', status: 'running', sequence: 99, textOffset: 999 })
  assert.equal(message.parts, parts)
  assert.equal(parts[0], firstText)
  assert.equal(parts[1], group)
  assert.equal(group.tools, groupTools)
  assert.equal(parts[2], tail)
  assert.equal(groupTools[0], a)
  assert.equal(a.expanded, true)
  assert.equal(a.status, 'failed')
  assert.equal(a.textOffset, 3)
  assert.equal(a.sequence, 1)
  assert.equal(message.tools.length, 1)
  assert.deepEqual(message.toolSummary, { total: 1, running: 0, succeeded: 0, failed: 1, cancelled: 0 })
})

test('新工具在末尾文本中的指定位置插入，同位置调用合并', () => {
  const message = { content: '', parts: [], tools: [] }
  appendMessageText(message, '先看。完成。')
  upsertTool(message, { toolCallId: 'a', name: 'get_file_content', textOffset: 3 })
  upsertTool(message, { toolCallId: 'b', name: 'get_file_content', textOffset: 3 })
  assert.deepEqual(
    message.parts.map((part) => part.text ?? part.tools.map((tool) => tool.toolCallId)),
    ['先看。', ['a', 'b'], '完成。'],
  )
  assert.deepEqual(message.parts, liveToolParts(message.content, message.tools))
})

test('恢复快照后继续增量更新，保留已有工具展开状态且重放事件不重复', () => {
  const message = { content: '', parts: [], tools: [] }
  appendMessageText(message, '先看。')
  const a = upsertTool(message, { toolCallId: 'a', name: 'get_file_content' })
  a.expanded = true
  // 重连先补齐漏掉的正文，再恢复包含期间新增工具的快照。
  appendMessageText(message, '再改。')
  restoreMessageTools(message, [
    { ...a, status: 'succeeded' },
    { ...a, toolCallId: 'b', sequence: 2, textOffset: 6, expanded: false },
  ])
  const parts = message.parts
  assert.equal(message.tools[0], a)
  assert.equal(a.expanded, true)
  upsertTool(message, { toolCallId: 'b', status: 'succeeded' })
  upsertTool(message, { toolCallId: 'b', status: 'succeeded' })
  appendMessageText(message, '完成。')
  assert.equal(message.parts, parts)
  assert.equal(message.tools.length, 2)
  assert.equal(message.parts.length, 5)
  assert.deepEqual(message.parts, liveToolParts(message.content, message.tools))
  assert.deepEqual(message.toolSummary, summarizeTools(message.tools))
})

test('Vue 响应式下工具状态、图片任务和正文都更新同一份片段记录', async () => {
  const message = reactive({ content: '', parts: [], tools: [], imageTasks: [] })
  upsertTool(message, { toolCallId: 'a', name: 'generate_image' })
  let displayedStatus
  const stop = watchEffect(() => {
    displayedStatus = message.parts[0].tools[0].status
  })
  upsertTool(message, { toolCallId: 'a', status: 'succeeded' })
  await nextTick()
  assert.equal(displayedStatus, 'succeeded')
  message.tools[0].imageTasks = [{ taskId: 42 }]
  assert.equal(message.parts[0].tools[0].imageTasks[0].taskId, 42)
  appendMessageText(message, '已完成')
  appendMessageText(message, '。')
  assert.equal(message.parts[1].text, '已完成。')
  stop()
})

test('大量流式批次的增量结果与按位置完整重建一致', () => {
  const message = { content: '', parts: [], tools: [] }
  for (let index = 0; index < 100; index++) {
    appendMessageText(message, index % 3 === 0 ? `阶段${index}🎮。` : '\n')
    upsertTool(message, { toolCallId: `tool-${index}`, name: 'get_file_content' })
    if (index % 2 === 0) upsertTool(message, { toolCallId: `tool-${index}`, status: 'succeeded' })
    assert.deepEqual(message.parts, liveToolParts(message.content, message.tools))
    assert.deepEqual(message.toolSummary, summarizeTools(message.tools))
  }
})
