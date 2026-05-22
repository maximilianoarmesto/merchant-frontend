import { getAvailableModels, STATIC_MODELS } from "../model-catalog";

type FetchMock = jest.Mock<Promise<{ ok: boolean; json?: () => Promise<unknown> }>>;

function mockFetchOk(body: unknown): FetchMock {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockFetchFail(): FetchMock {
  return jest.fn().mockResolvedValue({ ok: false });
}

function mockFetchError(): FetchMock {
  return jest.fn().mockRejectedValue(new Error("network error"));
}

function setFetch(mock: FetchMock) {
  (global as unknown as Record<string, unknown>)["fetch"] = mock;
  return mock;
}

beforeEach(() => {
  delete (global as unknown as Record<string, unknown>)["fetch"];
});

afterEach(() => {
  delete (global as unknown as Record<string, unknown>)["fetch"];
});

// AC: getAvailableModels(provider, apiKey?) returns a list of model IDs for the given provider
describe("getAvailableModels returns model IDs (ac-a1e807f73d71)", () => {
  it("returns an array of strings for openai without a key", async () => {
    const models = await getAvailableModels("openai");
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    models.forEach((m) => expect(typeof m).toBe("string"));
  });

  it("returns an array of strings for anthropic without a key", async () => {
    const models = await getAvailableModels("anthropic");
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    models.forEach((m) => expect(typeof m).toBe("string"));
  });

  it("returns fetched model IDs for openai when key provided and fetch succeeds", async () => {
    const fetchMock = mockFetchOk({
      data: [{ id: "gpt-4o" }, { id: "gpt-4-turbo" }, { id: "text-embedding-3-small" }],
    });
    setFetch(fetchMock);

    const models = await getAvailableModels("openai", "sk-test");
    expect(models).toContain("gpt-4o");
    expect(models).toContain("gpt-4-turbo");
  });
});

// AC: Static fallback list is used if no key is provided or the API call fails
describe("static fallback (ac-4f42dc9f2d57)", () => {
  it("uses static list for openai when no key", async () => {
    const models = await getAvailableModels("openai");
    expect(models).toEqual(STATIC_MODELS["openai"]);
  });

  it("uses static list for anthropic when no key", async () => {
    const models = await getAvailableModels("anthropic");
    expect(models).toEqual(STATIC_MODELS["anthropic"]);
  });

  it("uses static list for openai when fetch returns non-ok response", async () => {
    setFetch(mockFetchFail());
    const models = await getAvailableModels("openai", "sk-test");
    expect(models).toEqual(STATIC_MODELS["openai"]);
  });

  it("uses static list for openai when fetch throws", async () => {
    setFetch(mockFetchError());
    const models = await getAvailableModels("openai", "sk-test");
    expect(models).toEqual(STATIC_MODELS["openai"]);
  });

  it("uses static list for anthropic when fetch throws", async () => {
    setFetch(mockFetchError());
    const models = await getAvailableModels("anthropic", "sk-ant-test");
    expect(models).toEqual(STATIC_MODELS["anthropic"]);
  });
});

// AC: Model list is fetched from OpenAI /v1/models and filtered to chat-capable models
describe("OpenAI /v1/models fetch and chat filter (ac-1d4b0eff85af)", () => {
  it("fetches from the correct OpenAI endpoint", async () => {
    const fetchMock = mockFetchOk({ data: [{ id: "gpt-4o" }] });
    setFetch(fetchMock);

    await getAvailableModels("openai", "sk-test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer sk-test" } })
    );
  });

  it("filters out non-chat models (embedding, tts, whisper, dall)", async () => {
    const fetchMock = mockFetchOk({
      data: [
        { id: "gpt-4o" },
        { id: "gpt-4-turbo" },
        { id: "gpt-3.5-turbo" },
        { id: "text-embedding-3-small" },
        { id: "tts-1" },
        { id: "whisper-1" },
        { id: "dall-e-3" },
        { id: "gpt-3.5-turbo-instruct" },
      ],
    });
    setFetch(fetchMock);

    const models = await getAvailableModels("openai", "sk-test");

    expect(models).toContain("gpt-4o");
    expect(models).toContain("gpt-4-turbo");
    expect(models).toContain("gpt-3.5-turbo");
    expect(models).not.toContain("text-embedding-3-small");
    expect(models).not.toContain("tts-1");
    expect(models).not.toContain("whisper-1");
    expect(models).not.toContain("dall-e-3");
    expect(models).not.toContain("gpt-3.5-turbo-instruct");
  });

  it("falls back to static list if fetched list is empty after filtering", async () => {
    const fetchMock = mockFetchOk({
      data: [{ id: "text-embedding-3-small" }, { id: "dall-e-3" }],
    });
    setFetch(fetchMock);

    const models = await getAvailableModels("openai", "sk-test");
    expect(models).toEqual(STATIC_MODELS["openai"]);
  });
});

// AC: Anthropic model list is fetched (or served from static list if no public endpoint is available)
describe("Anthropic model fetch (ac-c0f5067599a7)", () => {
  it("fetches from Anthropic API when key is provided and endpoint responds", async () => {
    const fetchMock = mockFetchOk({
      data: [{ id: "claude-opus-4" }, { id: "claude-sonnet-4" }],
    });
    setFetch(fetchMock);

    const models = await getAvailableModels("anthropic", "sk-ant-test");
    expect(models).toContain("claude-opus-4");
    expect(models).toContain("claude-sonnet-4");
  });

  it("uses Anthropic-specific auth headers", async () => {
    const fetchMock = mockFetchOk({ data: [{ id: "claude-opus-4" }] });
    setFetch(fetchMock);

    await getAvailableModels("anthropic", "sk-ant-test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "sk-ant-test" }),
      })
    );
  });

  it("falls back to static list when Anthropic endpoint is unavailable", async () => {
    setFetch(mockFetchFail());

    const models = await getAvailableModels("anthropic", "sk-ant-test");
    expect(models).toEqual(STATIC_MODELS["anthropic"]);
  });
});

// AC: Function is unit-testable with a mocked fetch
describe("unit-testable with mocked fetch (ac-ecd61a209d8b)", () => {
  it("accepts a mock for global fetch without any module-level setup", async () => {
    const mockFetch = mockFetchOk({ data: [{ id: "gpt-4o" }, { id: "gpt-4" }] });
    setFetch(mockFetch);

    const models = await getAvailableModels("openai", "sk-test");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(models).toContain("gpt-4o");
    expect(models).toContain("gpt-4");
  });

  it("works with anthropic provider via mocked fetch", async () => {
    const mockFetch = mockFetchOk({
      data: [{ id: "claude-sonnet-4-5" }, { id: "claude-haiku-3-5" }],
    });
    setFetch(mockFetch);

    const models = await getAvailableModels("anthropic", "sk-ant-test");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(models).toContain("claude-sonnet-4-5");
    expect(models).toContain("claude-haiku-3-5");
  });
});
