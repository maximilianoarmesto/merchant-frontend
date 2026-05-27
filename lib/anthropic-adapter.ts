import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatAdapter,
  ChatMessage,
  ToolDefinition,
} from "./chat-adapter";

type AnthropicMessageParam = Anthropic.MessageParam;
type AnthropicTool = Anthropic.Tool;
type ContentBlock = Anthropic.ContentBlock;

export interface AnthropicMessageStream
  extends AsyncIterable<Anthropic.MessageStreamEvent> {
  finalMessage(): Promise<Anthropic.Message>;
}

export interface AnthropicClientLike {
  messages: {
    stream: (params: unknown) => AnthropicMessageStream;
  };
}

export type AnthropicClientFactory = (apiKey: string) => AnthropicClientLike;

function splitSystem(messages: ChatMessage[]): {
  system: string | undefined;
  convo: AnthropicMessageParam[];
} {
  const systemTexts: string[] = [];
  const convo: AnthropicMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemTexts.push(m.content);
    } else {
      convo.push({ role: m.role, content: m.content });
    }
  }
  return {
    system: systemTexts.length > 0 ? systemTexts.join("\n\n") : undefined,
    convo,
  };
}

function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as AnthropicTool["input_schema"],
  }));
}

async function runTool(
  tool: ToolDefinition | undefined,
  input: Record<string, unknown>
): Promise<string> {
  if (!tool) return `Error: unknown tool`;
  try {
    const out = await tool.execute(input ?? {});
    return typeof out === "string" ? out : JSON.stringify(out);
  } catch (err) {
    return `Error: ${(err as Error).message ?? String(err)}`;
  }
}

const defaultFactory: AnthropicClientFactory = (apiKey) =>
  new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) as
    unknown as AnthropicClientLike;

export class AnthropicAdapter implements ChatAdapter {
  private readonly factory: AnthropicClientFactory;

  constructor(factory: AnthropicClientFactory = defaultFactory) {
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
    const anthropicTools = tools.length > 0 ? toAnthropicTools(tools) : undefined;
    const { system, convo } = splitSystem(messages);

    return {
      async *[Symbol.asyncIterator]() {
        const client = factory(apiKey);

        for (let turn = 0; turn < 16; turn++) {
          const stream = client.messages.stream({
            model,
            max_tokens: 4096,
            system,
            messages: convo,
            tools: anthropicTools,
          });

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              yield event.delta.text;
            }
          }

          const final = await stream.finalMessage();

          if (final.stop_reason !== "tool_use") {
            return;
          }

          const blocks = final.content as ContentBlock[];
          convo.push({ role: "assistant", content: blocks });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of blocks) {
            if (block.type !== "tool_use") continue;
            const result = await runTool(
              toolMap.get(block.name),
              (block.input ?? {}) as Record<string, unknown>
            );
            const isError = result.startsWith("Error:");
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
              ...(isError ? { is_error: true } : {}),
            });
          }

          if (toolResults.length === 0) return;
          convo.push({ role: "user", content: toolResults });
        }
      },
    };
  }
}
