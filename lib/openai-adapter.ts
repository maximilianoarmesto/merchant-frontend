import OpenAI from "openai";
import type {
  ChatAdapter,
  ChatMessage,
  ToolDefinition,
} from "./chat-adapter";

type OpenAIChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface OpenAIClientLike {
  chat: {
    completions: {
      create: (params: unknown) => Promise<
        AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
      > | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    };
  };
}

export type OpenAIClientFactory = (apiKey: string) => OpenAIClientLike;

type AccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

function toOpenAITools(
  tools: ToolDefinition[]
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
}

async function runTool(
  tool: ToolDefinition | undefined,
  rawArgs: string
): Promise<string> {
  if (!tool) return `Error: unknown tool`;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = rawArgs ? JSON.parse(rawArgs) : {};
  } catch (err) {
    return `Error: invalid JSON arguments: ${(err as Error).message}`;
  }
  try {
    const out = await tool.execute(parsed);
    return typeof out === "string" ? out : JSON.stringify(out);
  } catch (err) {
    return `Error: ${(err as Error).message ?? String(err)}`;
  }
}

const defaultFactory: OpenAIClientFactory = (apiKey) =>
  new OpenAI({ apiKey, dangerouslyAllowBrowser: true }) as OpenAIClientLike;

export class OpenAIAdapter implements ChatAdapter {
  private readonly factory: OpenAIClientFactory;

  constructor(factory: OpenAIClientFactory = defaultFactory) {
    this.factory = factory;
  }

  stream(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    apiKey: string,
    model: string
  ): AsyncIterable<string> {
    const factory = this.factory;
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    const openaiTools = tools.length > 0 ? toOpenAITools(tools) : undefined;
    const convo: OpenAIChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    })) as OpenAIChatMessage[];

    return {
      async *[Symbol.asyncIterator]() {
        const client = factory(apiKey);

        for (let turn = 0; turn < 16; turn++) {
          const completion = await client.chat.completions.create({
            model,
            messages: convo,
            tools: openaiTools,
            stream: true,
          });

          const calls = new Map<number, AccumulatedToolCall>();
          let finishReason: string | null | undefined;
          let assistantText = "";

          for await (const chunk of completion as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
            const choice = chunk.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta;
            if (delta?.content) {
              assistantText += delta.content;
              yield delta.content;
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                const existing = calls.get(idx) ?? {
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  arguments: "",
                };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
                calls.set(idx, existing);
              }
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }

          if (calls.size === 0 || finishReason !== "tool_calls") {
            return;
          }

          const ordered = Array.from(calls.entries())
            .sort(([a], [b]) => a - b)
            .map(([, v]) => v);
          convo.push({
            role: "assistant",
            content: assistantText || null,
            tool_calls: ordered.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.arguments },
            })),
          } as OpenAIChatMessage);

          for (const call of ordered) {
            const result = await runTool(toolMap.get(call.name), call.arguments);
            convo.push({
              role: "tool",
              tool_call_id: call.id,
              content: result,
            } as OpenAIChatMessage);
          }
        }
      },
    };
  }
}
