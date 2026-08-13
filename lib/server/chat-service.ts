import "server-only";

import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

import { getCurrentMerchantId } from "@/lib/config/server";
import type {
  ChatError,
  ChatErrorAction,
  ChatErrorCode,
  ChatRequest,
  ChatResponse,
  ChatResult,
  ChatToolInvocation,
  ChatUsage,
} from "@/lib/dto/chat";
import { DEFAULT_PROVIDER, type Provider } from "@/lib/models/provider-config";
import {
  COMMERCE_TOOLS,
  executeCommerceTool,
  type CommerceToolContext,
} from "@/lib/server/commerce-tools";
import {
  createOpenAIClient,
  describeOpenAIError,
  openAIErrorStatus,
  resolveModel,
} from "@/lib/server/openai";
import { getProviderConfig } from "@/lib/server/provider-config-repository";

/**
 * Orchestrates one chat turn for the merchant assistant.
 *
 * The shape of a turn: load the merchant's stored key and model server-side,
 * hand OpenAI the read-only commerce tools from
 * `lib/server/commerce-tools.ts`, and run the tool loop until the model stops
 * asking for data and answers.
 *
 * Two properties this module exists to guarantee:
 *
 * 1. **Read-only.** The only tools ever passed to OpenAI are `COMMERCE_TOOLS`,
 *    and the only thing a tool call can reach is `executeCommerceTool`. There
 *    is no path from a model turn to a write — not to the catalog or checkout
 *    services, and not to the merchant's own provider config.
 * 2. **No silent credential failure.** A key that OpenAI refuses mid-chat
 *    (revoked, expired, permissions narrowed since it was validated) comes back
 *    as `{ ok: false, error: { code: "key_rejected", action: "revalidate_key" } }`
 *    so the chat UI can send the merchant to Settings, rather than surfacing a
 *    generic failure or an empty answer. Nothing here re-validates or rewrites
 *    the stored key — validation stays explicit, in
 *    `lib/server/provider-key-service.ts`.
 */

/** Default ceiling on tool round-trips before the model must answer. */
export const DEFAULT_MAX_TOOL_ROUNDS = 4;

export const DEFAULT_SYSTEM_PROMPT = [
  "You are the merchant's commerce assistant inside their store dashboard.",
  "You answer questions about their own catalog and orders using the provided tools.",
  "",
  "Rules:",
  "- Always call a tool to get real data. Never invent products, orders, prices or stock levels.",
  "- You have read-only access. You cannot create, update, cancel or delete products or orders,",
  "  and no tool exists for it. If asked to change something, say plainly that you can only read,",
  "  and point the merchant at the relevant dashboard page.",
  "- If a tool reports an error or returns nothing, say so instead of guessing.",
  "- Amounts come with a currency code; include it when you quote a figure.",
  "- Be concise and concrete: lead with the numbers the merchant asked for.",
].join("\n");

export interface RunChatOptions extends CommerceToolContext {
  /** Defaults to `request.merchantId`, then to the configured merchant. */
  merchantId?: string;
  /** Tool round-trips allowed before the model is forced to answer. */
  maxToolRounds?: number;
  /** Replaces `DEFAULT_SYSTEM_PROMPT`; the read-only framing is yours to keep. */
  systemPrompt?: string;
}

function chatError(
  code: ChatErrorCode,
  action: ChatErrorAction,
  provider: Provider,
  message: string,
): { ok: false; error: ChatError } {
  return { ok: false, error: { error: message, code, action, provider } };
}

/**
 * Maps a provider failure onto the structured error the chat UI reacts to.
 *
 * 401/403 is the case this whole result type exists for: the key was accepted
 * when the merchant saved it and is being refused now, so the remedy is a
 * re-validation, not a retry.
 */
function toChatError(error: unknown, provider: Provider): { ok: false; error: ChatError } {
  const status = openAIErrorStatus(error);
  const message = describeOpenAIError(error);

  // No status: the call never got an answer (timeout, network, abort).
  if (status === undefined) return chatError("provider_unavailable", "retry", provider, message);

  if (status === 401 || status === 403) {
    return chatError(
      "key_rejected",
      "revalidate_key",
      provider,
      `${message}. The stored key may have been revoked or expired — re-validate it in Settings.`,
    );
  }
  if (status === 404) {
    return chatError(
      "model_unavailable",
      "select_model",
      provider,
      `${message}. The selected model is not available to this key — pick another in Settings.`,
    );
  }
  if (status === 429) return chatError("provider_rate_limited", "retry", provider, message);
  if (status >= 500) return chatError("provider_unavailable", "retry", provider, message);

  return chatError("provider_error", "none", provider, message);
}

function isFunctionToolCall(
  call: ChatCompletionMessageToolCall,
): call is Extract<ChatCompletionMessageToolCall, { type: "function" }> {
  return call.type === "function";
}

/** The model's arguments, kept for the UI only when they parsed as an object. */
function reportedArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function addUsage(
  total: ChatUsage | null,
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined,
): ChatUsage | null {
  if (!usage) return total;
  return {
    promptTokens: (total?.promptTokens ?? 0) + usage.prompt_tokens,
    completionTokens: (total?.completionTokens ?? 0) + usage.completion_tokens,
    totalTokens: (total?.totalTokens ?? 0) + usage.total_tokens,
  };
}

/**
 * Runs a chat turn with the merchant's stored key, model and commerce tools.
 *
 * Resolves to `{ ok: true, response }` with the assistant's answer and the
 * reads it made, or `{ ok: false, error }` — never throws for a provider or
 * credential failure. Streaming is not handled here; the route layer owns it.
 */
export async function runChatCompletion(
  request: ChatRequest,
  options: RunChatOptions = {},
): Promise<ChatResult> {
  const provider = request.provider ?? DEFAULT_PROVIDER;
  const merchantId = options.merchantId ?? request.merchantId ?? getCurrentMerchantId();

  const config = getProviderConfig(merchantId, provider);
  if (!config) {
    return chatError(
      "key_missing",
      "configure_key",
      provider,
      `No ${provider} API key is configured — add and validate one in Settings before chatting.`,
    );
  }

  const client = createOpenAIClient(config.apiKey);
  const model = resolveModel(request.model, config.selectedModel);
  const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const toolContext: CommerceToolContext = { auth: options.auth, signal: options.signal };

  // The system prompt is prepended even when the caller sent one of their own:
  // it carries the read-only framing, so it is not the client's to drop.
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
    ...request.messages.map((message) => ({ role: message.role, content: message.content })),
  ];

  const toolCalls: ChatToolInvocation[] = [];
  let usage: ChatUsage | null = null;

  for (let round = 0; round <= maxToolRounds; round += 1) {
    // On the final round tools are withdrawn, so the model has no choice but to
    // answer with what it already gathered — the loop always terminates.
    const toolsExhausted = round === maxToolRounds;

    let completion;
    try {
      completion = await client.chat.completions.create(
        {
          model,
          messages,
          tools: COMMERCE_TOOLS,
          tool_choice: toolsExhausted ? "none" : "auto",
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxTokens !== undefined
            ? { max_completion_tokens: request.maxTokens }
            : {}),
          stream: false,
        },
        { signal: options.signal },
      );
    } catch (error) {
      return toChatError(error, provider);
    }

    usage = addUsage(usage, completion.usage);

    const choice = completion.choices[0];
    if (!choice) {
      return chatError(
        "provider_error",
        "none",
        provider,
        `${provider} returned no completion choices`,
      );
    }

    const requestedCalls = (choice.message.tool_calls ?? []).filter(isFunctionToolCall);
    if (requestedCalls.length === 0) {
      return {
        ok: true,
        response: {
          message: { role: "assistant", content: choice.message.content ?? "" },
          model: completion.model,
          finishReason: choice.finish_reason ?? null,
          usage,
          toolCalls,
        } satisfies ChatResponse,
      };
    }

    // The assistant turn must be replayed verbatim: OpenAI rejects a `tool`
    // message that does not answer a tool call it can see in the history.
    messages.push(choice.message as ChatCompletionAssistantMessageParam);

    for (const call of requestedCalls) {
      const outcome = await executeCommerceTool(
        call.function.name,
        call.function.arguments,
        toolContext,
      );
      toolCalls.push({
        name: call.function.name,
        arguments: reportedArguments(call.function.arguments),
        ok: outcome.ok,
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(outcome.payload),
      });
    }
  }

  // Unreachable: the final round withdraws the tools, so it always returns above.
  return chatError(
    "provider_error",
    "none",
    provider,
    "The assistant kept requesting data and never produced an answer",
  );
}

export const chatService = {
  run: runChatCompletion,
  tools: COMMERCE_TOOLS,
} as const;
