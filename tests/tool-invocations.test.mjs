import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liveToolParts, settleTools, summarizeTools, upsertTool } from '../src/builder/chat/toolInvocations.ts'

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
  assert.deepEqual(parts.map((part) => part.text ?? part.tool.toolCallId), ['先看。', 'a', 'b', '再改。', 'c', '完成。'])
})

test('停止只终止运行中工具，保留已经完成的结果', () => {
  const message = { content: '', tools: [{ toolCallId: 'a', status: 'succeeded', result: '已保存' }, { toolCallId: 'b', status: 'running' }] }
  settleTools(message, 'cancelled')
  assert.equal(message.tools[0].status, 'succeeded')
  assert.equal(message.tools[0].result, '已保存')
  assert.equal(message.tools[1].status, 'cancelled')
  assert.equal(message.toolSummary.cancelled, 1)
})
