#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  isConversationRequest,
  trimConversationPayload
} = require('../main-world-performance.js');

function chain(count) {
  const mapping = {};
  for (let i = 0; i < count; i += 1) {
    const id = 'n' + i;
    mapping[id] = {
      id,
      parent: i ? 'n' + (i - 1) : null,
      children: i + 1 < count ? ['n' + (i + 1)] : [],
      message: { id: 'm' + i, author: { role: i % 2 ? 'assistant' : 'user' } }
    };
  }
  return { id: 'conversation', current_node: 'n' + (count - 1), mapping, title: 'fixture' };
}

{
  const input = chain(300);
  const result = trimConversationPayload(input);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.originalNodes, 300);
  assert.strictEqual(result.retainedNodes, 81);
  assert.strictEqual(result.payload.current_node, 'n299');
  assert.strictEqual(result.payload.mapping.n0.parent, null);
  assert.deepStrictEqual(result.payload.mapping.n0.children, ['n220']);
  assert.strictEqual(result.payload.mapping.n220.parent, 'n0');
  assert.ok(result.payload.mapping.n299);
  assert.ok(!result.payload.mapping.n219);
  assert.strictEqual(input.mapping.n220.parent, 'n219', 'input payload must not be mutated');
}

{
  const input = chain(120);
  const result = trimConversationPayload(input);
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.payload, input);
}

{
  const input = chain(220);
  input.mapping.altA = { id: 'altA', parent: 'n10', children: ['altB'], message: {} };
  input.mapping.altB = { id: 'altB', parent: 'altA', children: [], message: {} };
  input.mapping.n10.children.push('altA');
  const result = trimConversationPayload(input);
  assert.strictEqual(result.changed, true);
  assert.ok(!result.payload.mapping.altA);
  assert.ok(!result.payload.mapping.altB);
  assert.ok(result.payload.mapping.n219);
}

{
  const malformed = { mapping: {}, current_node: 'missing' };
  const result = trimConversationPayload(malformed);
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.payload, malformed);
}

assert.strictEqual(
  isConversationRequest('https://chatgpt.com/backend-api/conversation/abc', { method: 'GET' }),
  true
);
assert.strictEqual(
  isConversationRequest('https://chatgpt.com/backend-api/conversation/abc?foo=1', {}),
  true
);
assert.strictEqual(
  isConversationRequest('https://chatgpt.com/backend-api/conversation/abc', { method: 'POST' }),
  false
);
assert.strictEqual(
  isConversationRequest('https://chatgpt.com/backend-api/conversations?offset=0', {}),
  false
);

console.log('Long Chat Window behavior tests passed.');
