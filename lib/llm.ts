/**
 * LLM Provider Abstraction
 * Supports Anthropic (Claude) and OpenAI with a unified interface.
 * Users provide their own API key via environment variables.
 */

export type LLMProvider = "anthropic" | "openai";

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface LLMResponse {
  text: string;
  usage: TokenUsage;
}

const ZERO_USAGE: TokenUsage = { input_tokens: 0, output_tokens: 0 };

function getConfig(): LLMConfig {
  // Prefer Anthropic, fall back to OpenAI
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o",
    };
  }
  throw new Error(
    "No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your .env.local file."
  );
}

async function callAnthropic(
  config: LLMConfig,
  system: string,
  prompt: string,
  maxTokens: number = 4096
): Promise<LLMResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    text: data.content?.map((c: any) => c.text || "").join("") || "",
    usage: data.usage
      ? {
          input_tokens: data.usage.input_tokens ?? 0,
          output_tokens: data.usage.output_tokens ?? 0,
        }
      : { ...ZERO_USAGE },
  };
}

async function callOpenAI(
  config: LLMConfig,
  system: string,
  prompt: string,
  maxTokens: number = 4096
): Promise<LLMResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: data.usage
      ? {
          input_tokens: data.usage.prompt_tokens ?? 0,
          output_tokens: data.usage.completion_tokens ?? 0,
        }
      : { ...ZERO_USAGE },
  };
}

/**
 * Send a prompt to the configured LLM provider.
 */
export async function llm(
  system: string,
  prompt: string,
  maxTokens: number = 4096
): Promise<LLMResponse> {
  const config = getConfig();

  if (config.provider === "anthropic") {
    return callAnthropic(config, system, prompt, maxTokens);
  } else {
    return callOpenAI(config, system, prompt, maxTokens);
  }
}

/**
 * Send a prompt and parse the response as JSON. Returns both the parsed
 * result and the raw token usage so callers can persist it.
 */
export async function llmJSON<T = any>(
  system: string,
  prompt: string,
  maxTokens: number = 4096
): Promise<{ data: T; usage: TokenUsage }> {
  const response = await llm(system, prompt, maxTokens);
  const cleaned = response.text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  return { data: JSON.parse(cleaned) as T, usage: response.usage };
}

export { getConfig };
