/**
 * The module `npm test` passes to `node --import`. It does two things, in this
 * order, and both have to happen before a test file is loaded.
 *
 * **1. Module resolution.** It registers hooks that teach Node what the app's
 * sources normally get from the Next.js bundler:
 *
 * - the `@/*` path alias declared in tsconfig.json,
 * - extensionless specifiers, both for TypeScript sources (`@/lib/...`) and for
 *   Next.js's own subpaths (`next/headers` → `next/headers.js`),
 * - the `server-only` marker, redirected to its own no-op build. That package
 *   throws on import by default and is silent only under the `react-server`
 *   export condition — but turning that condition on globally swaps `react` for
 *   a subset build that refuses to load outside Next.js, so pointing at the
 *   no-op file directly is the only combination in which a `server-only` module
 *   and `next/headers` can load in the same process.
 *
 * **2. The test environment.** It then awaits `./env.ts`, which starts the stub
 * OpenAI/catalog/checkout servers and exports their URLs into `process.env`.
 * Node finishes every `--import` module before evaluating the entry point, so
 * this is what guarantees `lib/config/server.ts` — which reads the environment
 * once, at import time — is pointed at the stubs rather than at production.
 * Top-level `await` inside a test file's own import graph would not be enough:
 * a synchronous sibling import is evaluated without waiting for an async one.
 *
 * `npm test` also supplies `--experimental-transform-types`, because the
 * sources use constructor parameter properties, which Node cannot strip without
 * transforming.
 */
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** The `server-only` guard is a build-time marker; under test it is a no-op. */
const SERVER_ONLY_NOOP = path.join(ROOT, "node_modules", "server-only", "empty.js");

function firstExistingFile(candidates) {
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

function resolveAlias(specifier) {
  const base = path.join(ROOT, specifier.slice("@/".length));
  return firstExistingFile([
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ]);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: pathToFileURL(SERVER_ONLY_NOOP).href, shortCircuit: true };
    }

    if (specifier.startsWith("@/")) {
      const resolved = resolveAlias(specifier);
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // `next/headers` and friends are only importable extensionless under a
      // bundler; retry the way Next.js's own package exports spell them.
      if (error?.code === "ERR_MODULE_NOT_FOUND" && !path.extname(specifier)) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw error;
    }
  },
});

// Resolves to the same module instance a test file gets from
// `@/tests/support/env`, so the stubs it starts are the ones the tests drive.
await import("./env.ts");
