import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, llm, llmJSON } from "./llm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnthropicResponse(
  text: string,
  inputTokens = 10,
  outputTokens = 20
) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      content: [{ text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  } as unknown as Response;
}

function makeOpenAIResponse(
  text: string,
  promptTokens = 10,
  completionTokens = 20
) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    }),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Environment reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_MODEL", "");
  vi.stubEnv("OPENAI_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getConfig()
// ---------------------------------------------------------------------------

describe("getConfig()", () => {
  it("returns anthropic provider when ANTHROPIC_API_KEY is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

    const config = getConfig();

    expect(config.provider).toBe("anthropic");
    expect(config.apiKey).toBe("sk-ant-test");
  });

  it("returns openai provider when OPENAI_API_KEY is set", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");

    const config = getConfig();

    expect(config.provider).toBe("openai");
    expect(config.apiKey).toBe("sk-openai-test");
  });

  it("prefers anthropic when both keys are set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");

    const config = getConfig();

    expect(config.provider).toBe("anthropic");
    expect(config.apiKey).toBe("sk-ant-test");
  });

  it("throws a clear error when neither key is set", () => {
    expect(() => getConfig()).toThrowError(
      /No LLM API key found\. Set ANTHROPIC_API_KEY or OPENAI_API_KEY/
    );
  });

  it("uses the default anthropic model when ANTHROPIC_MODEL is not set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

    const config = getConfig();

    expect(config.model).toBe("claude-sonnet-4-20250514");
  });

  it("uses a custom anthropic model when ANTHROPIC_MODEL is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-3-haiku-20240307");

    const config = getConfig();

    expect(config.model).toBe("claude-3-haiku-20240307");
  });

  it("uses the default openai model when OPENAI_MODEL is not set", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");

    const config = getConfig();

    expect(config.model).toBe("gpt-4o");
  });

  it("uses a custom openai model when OPENAI_MODEL is set", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("OPENAI_MODEL", "gpt-4-turbo");

    const config = getConfig();

    expect(config.model).toBe("gpt-4-turbo");
  });
});

// ---------------------------------------------------------------------------
// llm() — request format and error handling
// ---------------------------------------------------------------------------

describe("llm() — Anthropic", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  });

  it("calls the Anthropic messages endpoint", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeAnthropicResponse("Hello"));
    vi.stubGlobal("fetch", mockFetch);

    await llm("system prompt", "user prompt");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("sends the correct Anthropic request headers", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeAnthropicResponse("Hello"));
    vi.stubGlobal("fetch", mockFetch);

    await llm("system prompt", "user prompt");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("sends the correct Anthropic request body shape", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-3-opus-20240229");
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeAnthropicResponse("Hello"));
    vi.stubGlobal("fetch", mockFetch);

    await llm("sys", "user msg", 1024);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.model).toBe("claude-3-opus-20240229");
    expect(body.max_tokens).toBe(1024);
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "user msg" }]);
  });

  it("extracts text from Anthropic multi-part content array", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        content: [{ text: "Part1 " }, { text: "Part2" }],
        usage: { input_tokens: 5, output_tokens: 15 },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await llm("s", "p");

    expect(result.text).toBe("Part1 Part2");
  });

  it("returns token usage from Anthropic response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeAnthropicResponse("ok", 42, 99));
    vi.stubGlobal("fetch", mockFetch);

    const result = await llm("s", "p");

    expect(result.usage).toEqual({ input_tokens: 42, output_tokens: 99 });
  });

  it("falls back to zero usage when Anthropic response has no usage field", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ content: [{ text: "hi" }] }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await llm("s", "p");

    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it("throws when Anthropic API returns a non-ok status", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429, "rate limit exceeded"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(llm("s", "p")).rejects.toThrowError(
      /Anthropic API error \(429\): rate limit exceeded/
    );
  });

  it("throws when Anthropic API returns a 500 error", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(500, "internal server error"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(llm("s", "p")).rejects.toThrowError(/Anthropic API error \(500\)/);
  });
});

describe("llm() — OpenAI", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
  });

  it("calls the OpenAI chat completions endpoint", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeOpenAIResponse("Hello"));
    vi.stubGlobal("fetch", mockFetch);

    await llm("system prompt", "user prompt");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("sends the correct OpenAI request headers", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeOpenAIResponse("Hello"));
    vi.stubGlobal("fetch", mockFetch);

    await llm("system prompt", "user prompt");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBe("Bearer sk-openai-test");
    // Anthropic-specific header must NOT be present
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("sends the correct OpenAI request body shape", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-4-turbo");
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeOpenAIResponse("Hello"));
    vi.stubGlobal("fetch", mockFetch);

    await llm("sys", "user msg", 2048);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.model).toBe("gpt-4-turbo");
    expect(body.max_tokens).toBe(2048);
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "user msg" },
    ]);
  });

  it("extracts text from the OpenAI choices array", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeOpenAIResponse("Generated text"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await llm("s", "p");

    expect(result.text).toBe("Generated text");
  });

  it("returns token usage mapped from OpenAI field names", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeOpenAIResponse("ok", 30, 60));
    vi.stubGlobal("fetch", mockFetch);

    const result = await llm("s", "p");

    // OpenAI uses prompt_tokens / completion_tokens; we map to input/output
    expect(result.usage).toEqual({ input_tokens: 30, output_tokens: 60 });
  });

  it("falls back to zero usage when OpenAI response has no usage field", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        choices: [{ message: { content: "hi" } }],
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await llm("s", "p");

    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it("throws when OpenAI API returns a non-ok status", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(401, "invalid api key"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(llm("s", "p")).rejects.toThrowError(
      /OpenAI API error \(401\): invalid api key/
    );
  });

  it("throws when OpenAI API returns a 503 error", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(503, "service unavailable"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(llm("s", "p")).rejects.toThrowError(/OpenAI API error \(503\)/);
  });
});

// ---------------------------------------------------------------------------
// llmJSON() — JSON cleaning and parsing
// ---------------------------------------------------------------------------

describe("llmJSON()", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  });

  function stubLLMResponse(text: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(makeAnthropicResponse(text, 5, 10))
    );
  }

  it("parses clean JSON with no fences", async () => {
    stubLLMResponse('{"key": "value"}');

    const { data, usage } = await llmJSON<{ key: string }>("s", "p");

    expect(data).toEqual({ key: "value" });
    expect(usage).toEqual({ input_tokens: 5, output_tokens: 10 });
  });

  it("strips ```json fences before parsing", async () => {
    stubLLMResponse('```json\n{"result": 42}\n```');

    const { data } = await llmJSON<{ result: number }>("s", "p");

    expect(data).toEqual({ result: 42 });
  });

  it("strips plain ``` fences before parsing", async () => {
    stubLLMResponse('```\n{"items": [1, 2, 3]}\n```');

    const { data } = await llmJSON<{ items: number[] }>("s", "p");

    expect(data).toEqual({ items: [1, 2, 3] });
  });

  it("handles ```json fence without newline after language tag", async () => {
    stubLLMResponse('```json{"compact": true}```');

    const { data } = await llmJSON<{ compact: boolean }>("s", "p");

    expect(data).toEqual({ compact: true });
  });

  it("handles leading/trailing whitespace around the JSON", async () => {
    stubLLMResponse("   \n  {\"spaced\": true}  \n  ");

    const { data } = await llmJSON<{ spaced: boolean }>("s", "p");

    expect(data).toEqual({ spaced: true });
  });

  it("returns an array when the LLM response is a JSON array", async () => {
    stubLLMResponse('```json\n[1, 2, 3]\n```');

    const { data } = await llmJSON<number[]>("s", "p");

    expect(data).toEqual([1, 2, 3]);
  });

  it("throws a SyntaxError when the response is not valid JSON", async () => {
    stubLLMResponse("This is not JSON at all");

    await expect(llmJSON("s", "p")).rejects.toThrow(SyntaxError);
  });

  it("throws when JSON is truncated / malformed", async () => {
    stubLLMResponse('{"key": "value"');

    await expect(llmJSON("s", "p")).rejects.toThrow(SyntaxError);
  });

  it("throws when fences are stripped but remaining content is still not JSON", async () => {
    stubLLMResponse("```json\nsorry, I cannot generate JSON for that\n```");

    await expect(llmJSON("s", "p")).rejects.toThrow(SyntaxError);
  });

  it("returns usage from the underlying llm() call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(makeAnthropicResponse('{"x": 1}', 111, 222))
    );

    const { usage } = await llmJSON("s", "p");

    expect(usage).toEqual({ input_tokens: 111, output_tokens: 222 });
  });

  it("preserves nested objects after fence stripping", async () => {
    const nested = { a: { b: { c: [true, false, null] } } };
    stubLLMResponse("```json\n" + JSON.stringify(nested) + "\n```");

    const { data } = await llmJSON("s", "p");

    expect(data).toEqual(nested);
  });
});
