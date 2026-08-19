import { validateRequestBody } from "@/lib/dto/validation";
import {
  validateKeyRequestSchema,
  type SettledKeyValidationState,
  type ValidateKeyResponse,
} from "@/lib/dto/validate-key";
import { getMerchantSession, invalidRequest, unexpectedError } from "@/lib/server/api-route";
import { validateAndSaveProviderKey } from "@/lib/server/provider-key-service";

/**
 * `POST /api/provider/validate-key`
 *
 * Checks the submitted key against the provider and, only if the provider
 * accepts it, stores it for the merchant behind the current session. The key
 * arrives in the body (never a query string, which would land in access logs)
 * and leaves the server again only as the masked hint on a provider config —
 * this route never echoes it back.
 *
 * Both settled outcomes are a 200: "this key is invalid, because …" is the
 * answer to a validation request, not a failure of it, and the settings screen
 * renders it from the `status` discriminator (`lib/dto/validate-key.ts`).
 * Nothing was written in that case.
 */

// The handler reads the session headers and writes to SQLite; it must never be
// statically rendered or cached.
export const dynamic = "force-dynamic";
// better-sqlite3 (native) and node:crypto rule out the edge runtime.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const parsed = await validateRequestBody(validateKeyRequestSchema, request);
  if (!parsed.success) return invalidRequest(parsed.errors);

  const { apiKey, provider } = parsed.data;
  const { merchantId } = getMerchantSession();

  // The save result reports only the chat-capable models, while the settled
  // validation state also carries `modelCount` — the total the key can reach.
  // `onState` is how a route gets hold of it without a second provider call.
  const validation: { state?: SettledKeyValidationState } = {};

  try {
    const saved = await validateAndSaveProviderKey(
      { apiKey, provider, merchantId },
      {
        onState: (state) => {
          if (state.status !== "validating") validation.state = state;
        },
      },
    );

    if (!saved.ok) {
      return Response.json({
        status: "invalid",
        provider: saved.provider,
        reason: saved.reason,
      } satisfies ValidateKeyResponse);
    }

    // The fallback is unreachable — `onState` always fires before the save —
    // but it keeps the response shape independent of the callback.
    const response: ValidateKeyResponse = validation.state ?? {
      status: "valid",
      provider,
      modelCount: saved.models.length,
      models: saved.models,
    };
    return Response.json(response);
  } catch (error) {
    return unexpectedError("POST /api/provider/validate-key", error);
  }
}
