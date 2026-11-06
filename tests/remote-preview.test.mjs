import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { RemotePreviewController } from '../src/builder/preview/remotePreviewController.ts'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const state = (revision, busy = false) => ({
  desiredRevision: revision,
  active: busy ? { id: revision, status: 'running' } : null,
  pending: null, lastReady: null, latest: null,
})

test('late responses after switching projects cannot change the current preview', async () => {
  const old = deferred()
  const applied = []
  const controller = new RemotePreviewController({
    get: (id) => id === 1 ? old.promise : Promise.resolve(state('new')),
    update: async () => state('updated'),
  }, (value) => applied.push(value.desiredRevision), assert.fail)
  const starting = controller.start(1)
  await controller.start(2)
  old.resolve(state('old'))
  await starting
  controller.stop()
  assert.deepEqual(applied, ['new'])
})

test('updates received while submitting merge into one next submission', async () => {
  const first = deferred()
  let calls = 0
  const controller = new RemotePreviewController({
    get: async () => state('initial'),
    update: () => ++calls === 1 ? first.promise : Promise.resolve(state('latest')),
  }, () => {}, assert.fail)
  await controller.start(1)
  const pending = controller.update()
  void controller.update()
  void controller.update()
  first.resolve(state('first'))
  await pending
  controller.stop()
  assert.equal(calls, 2)
})

test('an explicit retry arriving during another submission retains force intent', async () => {
  const first = deferred()
  const requests = []
  const controller = new RemotePreviewController({
    get: async () => state('initial'),
    update: (_id, force) => {
      requests.push(force)
      return requests.length === 1 ? first.promise : Promise.resolve(state('retried'))
    },
  }, () => {}, assert.fail)
  await controller.start(1)
  const pending = controller.update()
  void controller.update(true)
  void controller.update()
  first.resolve(state('first'))
  await pending
  controller.stop()
  assert.deepEqual(requests, [false, true])
})

test('polls only while work exists and stops polling after completion', async () => {
  let calls = 0
  const applied = []
  const controller = new RemotePreviewController({
    get: async () => state(++calls === 1 ? 'building' : 'ready', calls === 1),
    update: async () => state('ready'),
  }, (value) => applied.push(value.desiredRevision), assert.fail, 5)
  await controller.start(1)
  await delay(25)
  assert.deepEqual(applied, ['building', 'ready'])
  assert.equal(calls, 2)
  controller.stop()
})

test('an older poll cannot overwrite the result of a more recent update', async () => {
  const oldPoll = deferred()
  let calls = 0
  const applied = []
  const controller = new RemotePreviewController({
    get: () => ++calls === 1 ? Promise.resolve(state('initial', true)) : oldPoll.promise,
    update: async () => state('latest'),
  }, (value) => applied.push(value.desiredRevision), assert.fail, 5)
  await controller.start(1)
  await delay(10)
  await controller.update()
  oldPoll.resolve(state('old'))
  await delay(5)
  controller.stop()
  assert.deepEqual(applied, ['initial', 'latest'])
})

test('request failures are surfaced once without an infinite retry loop', async () => {
  const errors = []
  let calls = 0
  const controller = new RemotePreviewController({
    get: async () => state('initial'),
    update: async () => { calls++; throw new Error('network unavailable') },
  }, () => {}, (error) => errors.push(error.message), 5)
  await controller.start(1)
  await controller.update()
  await delay(15)
  controller.stop()
  assert.equal(calls, 1)
  assert.deepEqual(errors, ['network unavailable'])
})

test('an older failed poll cannot replace a newer successful update with an error', async () => {
  const oldPoll = deferred()
  let calls = 0
  const errors = []
  const controller = new RemotePreviewController({
    get: () => ++calls === 1 ? Promise.resolve(state('initial', true)) : oldPoll.promise,
    update: async () => state('latest'),
  }, () => {}, (error) => errors.push(error.message), 5)
  await controller.start(1)
  await delay(10)
  await controller.update()
  oldPoll.reject(new Error('old request failed'))
  await delay(5)
  controller.stop()
  assert.deepEqual(errors, [])
})

test('a change arriving as a submission settles still schedules the latest update', async () => {
  let calls = 0
  let controller
  controller = new RemotePreviewController({
    get: async () => state('initial'),
    update: async () => state(`v${++calls}`),
  }, (value) => {
    if (value.desiredRevision === 'v1') queueMicrotask(() => void controller.update())
  }, assert.fail)
  await controller.start(1)
  await controller.update()
  await delay(5)
  controller.stop()
  assert.equal(calls, 2)
})
