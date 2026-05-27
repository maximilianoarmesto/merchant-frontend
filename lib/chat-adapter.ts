export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

export interface ChatAdapter {
  stream(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    apiKey: string,
    model: string
  ): AsyncIterable<string>;
}
