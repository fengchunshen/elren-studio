import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol';
import { readFileSync } from 'node:fs';

export const name = 'elren-canvas-agent';
export const inject = ['agents', 'sessionPersistence', 'llm', 'tools', 'sdkAppStartup', 'loader'];

// All network/model and canvas access stays in the authenticated Python host.
// The runtime receives no supplier credential and has no shell/filesystem tool.
function messagesForProvider(messages) {
  const result = [];
  for (const message of messages) {
    const blocks = message.content || [];
    const content = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const calls = blocks.filter(b => b.type === 'tool-call');
    const outputs = blocks.filter(b => b.type === 'tool-result');
    if (content || calls.length) result.push({ role: message.role, content: content || null,
      ...(calls.length ? { tool_calls: calls.map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: b.arguments } })) } : {}) });
    for (const output of outputs) result.push({ role: 'tool', tool_call_id: output.toolCallId,
      content: output.content.filter(b => b.type === 'text').map(b => b.text).join('\n') });
  }
  return result;
}

export function apply(ctx) {
  const wire = new JsonRpcLineTransport(process.stdin, process.stdout);
  const spec = JSON.parse(readFileSync(process.env.ELREN_AGENT_SPEC, 'utf8'));
  const handles = new Map();
  const opening = new Map();
  let ready = false;
  class CanvasModel extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, contextWindow: 128000 }; }
    async *stream(options) {
      const data = await wire.request('model/call', { messages: messagesForProvider(options.messages), tools: (options.tools || []).map(tool => ({ type: 'function', function: tool })) });
      const message = data.choices[0].message;
      let index = 0;
      if (message.content) {
        yield { type: 'block-start', index, blockType: 'text' };
        yield { type: 'text-delta', index, text: message.content };
        yield { type: 'block-end', index: index++, block: { type: 'text', text: message.content } };
      }
      for (const call of message.tool_calls || []) {
        yield { type: 'block-start', index, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index, id: call.id, name: call.function.name, argumentsDelta: call.function.arguments };
        yield { type: 'block-end', index: index++, block: { type: 'tool-call', id: call.id, name: call.function.name, arguments: call.function.arguments } };
      }
      yield { type: 'finish', reason: { kind: message.tool_calls?.length ? 'tool-calls' : 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['elren'], new CanvasModel());
  for (const tool of spec.tools) ctx.tools.register(defineTool({ ...tool,
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute(args, exec) {
      const value = await wire.request('canvas/tool', { name: tool.name, args, call_id: exec.callId });
      if (exec.signal.aborted) throw new Error('操作已停止');
      return JSON.stringify(value);
    },
  }));
  ctx.on('session/event', (session, event) => wire.notify('session.event', { sessionId: String(session.id), event }));
  ctx.on('agent/status', ({ agent, status }) => wire.notify('session.status', { sessionId: String(agent.session.id), status }));

  async function session(id) {
    if (!ready || id !== spec.session_id) throw new Error('会话不匹配');
    if (handles.has(id)) return handles.get(id);
    if (!opening.has(id)) opening.set(id, (async () => {
      const exists = await ctx.sessionPersistence.stat(id);
      const agentOptions = { provider: 'elren', model: 'canvas-assistant', maxTokens: 8192 };
      const handle = exists
        ? await ctx.agents.resume({ resumeSessionId: id, agentOptions })
        : await ctx.agents.create({ sessionId: id, meta: { cwd: process.cwd() }, agentOptions });
      handles.set(id, handle);
      return handle;
    })());
    try { return await opening.get(id); } finally { opening.delete(id); }
  }
  wire.onRequest(async (method, params) => {
    if (method === 'initialize') { await ctx.get('loader')?.await(); ready = true; return { version: 1 }; }
    if (method === 'session/prompt' || method === 'session/steer') {
      const handle = await session(params.session_id);
      const message = createUserMessage({ content: [{ type: 'text', text: params.text }], source: { kind: 'user' } });
      if (method === 'session/steer') handle.agent.steer(message); else handle.agent.followup(message);
      return { message_id: message.id };
    }
    if (method === 'session/cancel') {
      handles.get(params.session_id)?.agent.cancel({ kind: 'user' });
      return {};
    }
    if (method === 'shutdown') {
      setImmediate(async () => { await wire.flush(); await ctx.root.fiber.dispose(); process.exit(0); });
      return {};
    }
    throw new Error('未知运行时请求');
  });
  ctx.effect(() => { wire.start(); return async () => {
    for (const handle of handles.values()) await handle.dispose();
    wire.close();
  }; }, 'elren.canvas.stdio');
}
