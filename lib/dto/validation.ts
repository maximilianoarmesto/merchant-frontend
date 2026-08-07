import { z } from "zod";

/** A single failed field, addressed by its dotted path (`""` for the root). */
export interface FieldError {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FieldError[] };

/** Flattens a ZodError into a list the API layer can return verbatim. */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/** Validates `input` against `schema` without throwing. */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: toFieldErrors(result.error) };
}

/**
 * Reads and validates a JSON request body. A malformed body is reported the
 * same way a schema violation is, so callers have a single error path.
 */
export async function validateRequestBody<S extends z.ZodType>(
  schema: S,
  request: Request,
): Promise<ValidationResult<z.output<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      errors: [{ path: "", message: "Request body must be valid JSON" }],
    };
  }
  return validate(schema, body);
}

/** Error payload shared by every route in this app. */
export const apiErrorSchema = z.object({
  error: z.string(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
