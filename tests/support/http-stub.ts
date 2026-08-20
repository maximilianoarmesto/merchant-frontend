/**
 * A throwaway HTTP server the tests point the app's outbound calls at.
 *
 * Real servers rather than a patched `fetch`: the OpenAI SDK, the commerce
 * client's header forwarding and its GET-only contract only hold if they hold
 * on the wire, so the assertions are made against what a server actually
 * received.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

/** One request a stub received, in the shape the assertions want to read. */
export interface RecordedRequest {
  method: string;
  /** Path with the stub's base prefix (e.g. `/v1`) stripped off. */
  path: string;
  query: Record<string, string>;
  /** Lowercased header names, as Node reports them. */
  headers: Record<string, string>;
  rawBody: string;
  /** Parsed `rawBody`, or `null` when it was absent or not JSON. */
  body: unknown;
}

/** What a stub answers with. `body` is JSON-encoded unless it is a string. */
export interface StubReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Drop the connection without answering, so the caller sees a transport
   * failure rather than an HTTP status. This is the "the provider was
   * unreachable" case, which has to be told apart from a rejected key.
   */
  destroy?: boolean;
}

export type StubHandler = (
  request: RecordedRequest,
) => StubReply | undefined | Promise<StubReply | undefined>;

export class HttpStub {
  readonly requests: RecordedRequest[] = [];

  private handler: StubHandler = () => ({
    status: 404,
    body: { detail: "no stub handler was installed for this request" },
  });

  private constructor(
    private readonly server: Server,
    readonly url: string,
    private readonly basePath: string,
  ) {}

  /**
   * Starts a stub listening on a loopback port. `basePath` is stripped from
   * recorded paths, so an OpenAI stub records `/models`, not `/v1/models`.
   */
  static async start(basePath = ""): Promise<HttpStub> {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const { port } = server.address() as AddressInfo;
    const stub = new HttpStub(server, `http://127.0.0.1:${port}${basePath}`, basePath);

    server.on("request", (incoming, response) => {
      void stub.handle(incoming, response);
    });

    return stub;
  }

  /** Installs the handler used for subsequent requests. */
  respond(handler: StubHandler): void {
    this.handler = handler;
  }

  /** Answers everything with one reply. */
  respondWith(reply: StubReply): void {
    this.respond(() => reply);
  }

  /**
   * Answers each request with the next reply in `replies`, then repeats the
   * last one. This is how a multi-round chat turn gets scripted.
   */
  respondInSequence(replies: StubReply[]): void {
    if (replies.length === 0) throw new Error("respondInSequence needs at least one reply");
    let index = 0;
    this.respond(() => replies[Math.min(index++, replies.length - 1)]!);
  }

  get lastRequest(): RecordedRequest {
    const request = this.requests.at(-1);
    if (!request) throw new Error("the stub received no requests");
    return request;
  }

  /** Requests whose path ends with `suffix` — e.g. `/products`. */
  requestsFor(suffix: string): RecordedRequest[] {
    return this.requests.filter((request) => request.path.endsWith(suffix));
  }

  /** Forgets recorded requests. Called between tests, not between rounds. */
  reset(): void {
    this.requests.length = 0;
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    this.server.close();
    await once(this.server, "close");
  }

  private async handle(incoming: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const requestUrl = new URL(incoming.url ?? "/", "http://127.0.0.1");
    const recorded: RecordedRequest = {
      method: incoming.method ?? "GET",
      path: requestUrl.pathname.startsWith(this.basePath)
        ? requestUrl.pathname.slice(this.basePath.length)
        : requestUrl.pathname,
      query: Object.fromEntries(requestUrl.searchParams),
      headers: Object.fromEntries(
        Object.entries(incoming.headers).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.join(", ") : (value ?? ""),
        ]),
      ),
      rawBody,
      body: parseJson(rawBody),
    };
    this.requests.push(recorded);

    const reply = (await this.handler(recorded)) ?? { status: 204 };
    if (reply.destroy) {
      response.socket?.destroy();
      return;
    }

    const payload =
      reply.body === undefined
        ? ""
        : typeof reply.body === "string"
          ? reply.body
          : JSON.stringify(reply.body);

    response.writeHead(reply.status ?? 200, {
      "content-type": "application/json",
      ...reply.headers,
    });
    response.end(payload);
  }
}

function parseJson(raw: string): unknown {
  if (raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
