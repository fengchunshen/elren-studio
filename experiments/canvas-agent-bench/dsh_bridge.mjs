// Experimental Elren-owned adapter, NOT an upstream SDK fix or production endpoint.
// Stdio only, single synthetic project, text inputs only. Reuses the real DSH core.
import { pathToFileURL } from 'node:url';
const checkout = process.env.DSH_CHECKOUT;
const { createUserMessage } = await import(pathToFileURL(`${checkout}/packages/llm/llm/lib/index.js`));
const { JsonRpcLineTransport } = await import(pathToFileURL(`${checkout}/packages/sdk/protocol/lib/index.js`));

export const name = 'elren-bench-sdk-bridge';
export const inject = ['agents', 'sessionPersistence', 'sdkAppStartup', 'loader'];

export function apply(ctx) {
  const transport = new JsonRpcLineTransport(process.stdin, process.stdout);
  const handles = new Map();
  const opening = new Map();
  let options;
  let shuttingDown = false;
  ctx.on('session/event', (session, event) => {
    transport.notify('session.event', { sessionId: String(session.id), event });
  });
  ctx.on('agent/status', ({ agent, status }) => {
    transport.notify('session.status', { sessionId: String(agent.session.id), status });
  });

  async function session(id) {
    if (!options || shuttingDown) throw new Error('Bridge is not accepting prompts');
    if (handles.has(id)) return handles.get(id);
    if (!opening.has(id)) {
      opening.set(id, (async () => {
        const exists = (await ctx.sessionPersistence.stat(id)) !== undefined;
        const agentOptions = { provider: options.provider, model: options.model, maxTokens: options.maxTokens };
        const handle = exists
          ? await ctx.agents.resume({ resumeSessionId: id, agentOptions })
          : await ctx.agents.create({ sessionId: id, meta: { cwd: options.cwd }, agentOptions });
        handles.set(id, handle);
        return handle;
      })());
    }
    try { return await opening.get(id); }
    finally { opening.delete(id); }
  }

  transport.onRequest(async (method, params) => {
    if (method === 'session/capabilities') return { adapter: 'elren-bench-adapter-v1', methods: ['session/prompt','session/steer'] };
    if (method === 'initialize') {
      await ctx.get('loader')?.await();
      options = params;
      return { serverInfo: { name: 'deepseek-harness-sdk-runtime', version: 'elren-bench-adapter-v1' } };
    }
    if (method === 'session/prompt' || method === 'session/steer') {
      const handle = await session(params.sessionId);
      if (params.contentBlocks.some(block => block.type !== 'text')) throw new Error('Text-only benchmark adapter');
      const message = createUserMessage({ content: params.contentBlocks, source: { kind: 'user' } });
      if (method === 'session/steer') handle.agent.steer(message);
      else handle.agent.followup(message);
      return { messageId: message.id };
    }
    if (method === 'shutdown') {
      shuttingDown = true;
      setImmediate(async () => {
        await transport.flush();
        await ctx.root.fiber.dispose();
        process.exit(0);
      });
      return {};
    }
    throw new Error(`Unsupported benchmark method: ${method}`);
  });
  ctx.effect(() => {
    transport.start();
    return async () => {
      for (const handle of handles.values()) await handle.dispose();
      transport.close();
    };
  }, 'elren.bench.stdio');
}
