import { chatRequestSchema, type ChatError, type ChatErrorCode } from "@/lib/dto/chat";
import { validateRequestBody } from "@/lib/dto/validation";
import { getMerchantSession, invalidRequest, unexpectedError } from "@/lib/server/api-route";
import { runChatCompletion } from "@/lib/server/chat-service";

/**
 * `POST /api/chat`
 *
 * One turn of the merchant assistant: the body carries the conversation so far
 * plus the merchant's new message, and the response is the assistant's answer
 * along with the commerce reads it made on the way.
 *
 * The browser never talks to OpenAI. It has no key to talk with: the key is
 * stored encrypted per merchant, resolved from the session inside
 * `runChatCompletion`, and the request DTO has no field to carry one.
 *
 * A failed turn answers with the `ChatError` shape — `error` plus a `code` and
 * an `action` — so the chat UI can prompt "re-validate your key in Settings"
 * when a stored key stops working mid-chat, instead of string-matching a
 * message. `ChatError` extends the app's shared error payload, so a client that
 * only reads `error` still works.
 */

// Reads the session headers and the merchant's stored key; never cacheable.
export const dynamic = "force-dynamic";
// better-sqlite3 (native) and node:crypto rule out the edge runtime.
export const runtime = "nodejs";

/**
 * HTTP status for a chat failure. The credential and model cases are 409: the
 * request was well-formed and will keep failing until the merchant fixes their
 * configuration, which is what `action` tells the UI to ask for.
 */
const ERROR_STATUS: Record<ChatErrorCode, number> = {
  key_missing: 409,
  key_rejected: 409,
  model_unavailable: 409,
  provider_rate_limited: 429,
  provider_unavailable: 503,
  provider_error: 502,
};

function chatErrorResponse(error: ChatError): Response {
  return Response.json(error, { status: ERROR_STATUS[error.code] });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await validateRequestBody(chatRequestSchema, request);
  if (!parsed.success) return invalidRequest(parsed.errors);

  if (parsed.data.stream) {
    return invalidRequest([
      { path: "stream", message: "Streaming responses are not supported yet" },
    ]);
  }

  const session = getMerchantSession();

  try {
    const result = await runChatCompletion(
      // A `merchantId` in the body is not authoritative — the session decides
      // whose catalog, orders and API key this turn runs against.
      { ...parsed.data, merchantId: session.merchantId },
      {
        merchantId: session.merchantId,
        // Replays the caller's own credentials on the commerce reads the
        // assistant makes, so it can only ever see this merchant's data.
        auth: session,
        // An abandoned request (merchant navigated away) cancels the provider
        // call instead of running the tool loop to completion.
        signal: request.signal,
      },
    );

    return result.ok ? Response.json(result.response) : chatErrorResponse(result.error);
  } catch (error) {
    return unexpectedError("POST /api/chat", error);
  }
}
