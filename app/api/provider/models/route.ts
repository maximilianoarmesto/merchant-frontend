import { z } from "zod";

import type { ListModelsResponse } from "@/lib/dto/list-models";
import { optionalProviderSchema } from "@/lib/dto/provider";
import { validate } from "@/lib/dto/validation";
import {
  getMerchantSession,
  invalidRequest,
  jsonError,
  unexpectedError,
} from "@/lib/server/api-route";
import { listChatModels } from "@/lib/server/provider-key-service";
import { hasProviderConfig } from "@/lib/server/provider-config-repository";

/**
 * `GET /api/provider/models`
 *
 * The chat-capable models the current merchant's stored key can reach —
 * embedding, audio, image and moderation models are filtered out, since only
 * chat models are selectable. The key itself is resolved server-side from the
 * session, so this route takes no credential (and would refuse one: a key in a
 * query string ends up in access logs).
 *
 * A merchant who has not stored a key yet gets a 409 rather than an empty list,
 * so the settings screen can tell "no key configured" apart from "this key
 * reaches no chat models". Probing a key *before* saving it needs no route of
 * its own: `POST /api/provider/validate-key` returns the same model list for
 * the key it just checked.
 */

// `getMerchantSession()` swallows the "called outside a request" throw that Next
// uses to detect dynamic rendering, so this GET has to opt out explicitly —
// otherwise it would be prerendered and every merchant would be served the
// build-time merchant's model list.
export const dynamic = "force-dynamic";
// better-sqlite3 (native) and node:crypto rule out the edge runtime.
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("provider") ?? undefined;
  // Wrapped in an object so an unknown provider is reported against the
  // `provider` field rather than the root of the request.
  const parsed = validate(z.object({ provider: optionalProviderSchema }), { provider: requested });
  if (!parsed.success) return invalidRequest(parsed.errors);

  const { provider } = parsed.data;
  const { merchantId } = getMerchantSession();

  try {
    // The only repository call in this layer, and a read: the service reports
    // "no key on file" and "the provider refused the key" with the same
    // `{ ok: false, reason }`, and the two deserve different statuses.
    if (!hasProviderConfig(merchantId, provider)) {
      return jsonError(
        409,
        `No ${provider} API key is configured — add and validate one in Settings first`,
      );
    }

    const result = await listChatModels({ merchantId, provider });
    if (!result.ok) {
      // The stored key was accepted when it was saved and is failing now: the
      // provider is down, or the key has since been revoked. Either way the
      // merchant's next step is to retry or re-validate, not to read a list.
      return jsonError(502, result.reason);
    }

    return Response.json({
      provider: result.provider,
      models: result.models,
    } satisfies ListModelsResponse);
  } catch (error) {
    return unexpectedError("GET /api/provider/models", error);
  }
}
