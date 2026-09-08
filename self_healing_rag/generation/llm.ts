import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { config, MODEL_MAP, AVAILABLE_MODELS } from "../config";

const TOKEN_FILE = path.join(process.cwd(), "token_usage.json");

interface Provider {
  name: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

let selectedModelId = "llama3-8b";

export function getModelCatalog() { return AVAILABLE_MODELS; }
export function getCurrentModel() { return selectedModelId; }

function buildProviders(): Provider[] {
  const mc = MODEL_MAP[selectedModelId];
  if (!mc) throw new Error(`Unknown model: ${selectedModelId}`);
  const list: Provider[] = [];
  if (config.GROQ_API_KEY && mc.groqModel) {
    list.push({
      name: "groq",
      apiKey: config.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
      model: mc.groqModel,
    });
  }
  config.NVIDIA_API_KEYS.forEach((key, i) => {
    list.push({
      name: `nvidia-${i + 1}`,
      apiKey: key,
      baseURL: "https://integrate.api.nvidia.com/v1",
      model: mc.nvidiaModel,
    });
  });
  return list;
}

export function setModel(modelId: string) {
  if (!MODEL_MAP[modelId]) throw new Error(`Unknown model: ${modelId}`);
  selectedModelId = modelId;
  providers = buildProviders();
  providerIndex = 0;
  llmClient = null;
  console.log(`Model switched to ${modelId}: ${providers.map(p => p.name + "/" + p.model).join(" → ")}`);
}

let providers = buildProviders();
let providerIndex = 0;
let llmClient: OpenAI | null = null;

export function getLLMProvider(): Provider {
  if (providerIndex >= providers.length) {
    providerIndex = 0;
    throw new Error("All API providers exhausted.");
  }
  return providers[providerIndex];
}

export function rotateProvider() {
  providerIndex++;
  llmClient = null;
  if (providerIndex < providers.length) {
    console.log(`Rotating to ${providers[providerIndex].name}...`);
  } else {
    providers = buildProviders();
    providerIndex = 0;
    console.warn("All providers exhausted, resetting rotation.");
  }
}

export function getLLMClient(): OpenAI {
  if (!llmClient) {
    const p = getLLMProvider();
    if (!p.apiKey) {
      throw new Error(`API key missing for ${p.name}.`);
    }
    llmClient = new OpenAI({
      apiKey: p.apiKey,
      baseURL: p.baseURL,
      timeout: 120000,
    });
  }
  return llmClient;
}

export function getNvidiaClient(): OpenAI {
  const key = config.NVIDIA_API_KEYS[0];
  if (!key) throw new Error("NVIDIA_API_KEY missing for embeddings.");
  return new OpenAI({
    apiKey: key,
    baseURL: "https://integrate.api.nvidia.com/v1",
    timeout: 120000,
  });
}

let tokenDaily: string;
let tokenEntries: { tokens: number; time: number }[] = [];
const TOKEN_LIMIT = 100000;
const TOKEN_WINDOW = 60_000;
const TOKEN_WARN_AT = 0.8;

function loadTokenUsage() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
      if (raw.date === new Date().toISOString().slice(0, 10)) {
        tokenEntries = raw.entries || [];
        tokenDaily = raw.date;
        return;
      }
    }
  } catch (e) {}
  tokenDaily = new Date().toISOString().slice(0, 10);
  tokenEntries = [];
}

function saveTokenUsage() {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ date: tokenDaily, entries: tokenEntries }), "utf-8");
  } catch (e) {}
}

function trackTokens(used: number) {
  const today = new Date().toISOString().slice(0, 10);
  if (tokenDaily !== today) {
    tokenDaily = today;
    tokenEntries = [];
  }
  const now = Date.now();
  tokenEntries.push({ tokens: used, time: now });
  const cutoff = now - TOKEN_WINDOW;
  tokenEntries = tokenEntries.filter(e => e.time >= cutoff);
  saveTokenUsage();
}

export function getTokenUsage(): { current: number; limit: number; pct: number; today: number } {
  const cutoff = Date.now() - TOKEN_WINDOW;
  const windowTokens = tokenEntries.filter(e => e.time >= cutoff).reduce((s, e) => s + e.tokens, 0);
  const todayTotal = tokenEntries.reduce((s, e) => s + e.tokens, 0);
  return { current: windowTokens, limit: TOKEN_LIMIT, pct: windowTokens / TOKEN_LIMIT, today: todayTotal };
}

loadTokenUsage();

export async function autoThrottle() {
  const { pct, today } = getTokenUsage();
  if (pct >= TOKEN_WARN_AT) {
    const delay = Math.min(5000, (pct - TOKEN_WARN_AT) * 60000);
    console.warn(`Token ${(pct * 100).toFixed(0)}% in 60s window — throttling ${delay}ms (today: ${today})`);
    await new Promise(r => setTimeout(r, delay));
  }
}

export async function executeWithFallback<T>(fn: () => Promise<T>): Promise<T> {
  await autoThrottle();
  try {
    return await fn();
  } catch (err: any) {
    if (err.status === 429 || err.status === 503 || err.message?.includes("limit reached") || err.message?.includes("ResourceExhausted")) {
      console.warn("API limit reached. Rotating API key...");
      try {
        rotateProvider();
        return await fn();
      } catch (rotationErr) {
        throw err;
      }
    }
    throw err;
  }
}

export function sanitizeJson(raw: string): string {
  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    return raw.substring(jsonStart);
  }
  return raw;
}

export async function getEmbedding(text: string): Promise<number[]> {
  return executeWithFallback(async () => {
    const openai = getNvidiaClient();
    
    const response = await openai.embeddings.create({
      model: config.EMBEDDING_MODEL,
      input: text,
      encoding_format: "float",
      input_type: "passage",
      truncate: "END"
    } as any);

    if (!response.data || response.data.length === 0) {
      throw new Error("Embedding response empty or invalid from Nvidia API.");
    }

    return response.data[0].embedding;
  });
}

export async function reformulateQuery(question: string, model?: string): Promise<string> {
  try {
    return await executeWithFallback(async () => {
      const openai = getLLMClient();
      const p = getLLMProvider();
      const prompt = `Rewrite the following user search question to be more specific, descriptive, and detailed for document vector search retrieval. Expand acronyms, add synonyms, and clarify intent if possible. Return ONLY the rewritten query text. Do not add quotes or introduction.

Original Question: "${question}"`;

      const response = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: p.model,
        chat_template_kwargs: { thinking: false }
      } as any);

      trackTokens((response as any).usage?.total_tokens || 100);
      return response.choices[0]?.message?.content?.trim() || question;
    });
  } catch (err: any) {
    console.error("Failed to reformulate query. Falling back to original question.", err);
    return question;
  }
}

export async function generateAnswer(question: string, context: string, model?: string): Promise<string> {
  try {
    return await executeWithFallback(async () => {
      const openai = getLLMClient();
      const p = getLLMProvider();
      let prompt = "";
      
      if (!context || context.trim() === "") {
        prompt = `You are LEINA, a helpful, polite, and intelligent AI assistant for Larsen & Toubro. Answer the user's question concisely. Provide only the most important and useful information without unnecessary conversational filler. Keep your response as short as possible while fully answering the question.

CRITICAL INSTRUCTION: If the user asks for a "diagram", "structure", "pipeline", "flowchart", or "visual", YOU MUST ONLY OUTPUT a Mermaid.js code block (enclosed in \`\`\`mermaid ... \`\`\`). Do not output conversational text. Just the mermaid block.
IMPORTANT MERMAID RULES:
1. USE ONLY standard ASCII arrows (--> or ==>) for connections. DO NOT use unicode arrows (like ⟶ or →).
2. Avoid special characters in node labels.
Example:
\`\`\`mermaid
graph TD
  A[Start] --> B[Process]
\`\`\`

User Question:
${question}`;
      } else {
        prompt = `You are LEINA, an advanced AI assistant for Larsen & Toubro. 
CRITICAL INSTRUCTION: If the user asks for a "diagram", "structure", "pipeline", "flowchart", or "visual", YOU MUST ONLY OUTPUT a Mermaid.js code block (enclosed in \`\`\`mermaid ... \`\`\`). Do not output conversational text. Just the mermaid block.
IMPORTANT MERMAID RULES:
1. USE ONLY standard ASCII arrows (--> or ==>) for connections. DO NOT use unicode arrows (like ⟶ or →).
2. Avoid special characters in node labels.
Example:
\`\`\`mermaid
graph TD
  A[Start] --> B[Process]
\`\`\`

If the user is NOT asking for a diagram, answer their question concisely. 
You are provided with some Grounding Context from the user's documents below. 
If the Grounding Context contains relevant information, USE IT to answer the question.
If the Grounding Context is irrelevant or doesn't contain the answer, simply answer the question using your general knowledge, just like a helpful AI assistant. DO NOT say "I cannot find the answer in the document".

Context:
${context}

Question:
${question}

Answer:`;
      }

      const response = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: p.model,
        temperature: 0.1,
        chat_template_kwargs: { thinking: false }
      } as any);

      trackTokens((response as any).usage?.total_tokens || 300);
      return response.choices[0]?.message?.content?.trim() || "No answer generated.";
    });
  } catch (err: any) {
    console.error("Failed to generate answer. All API providers exhausted.", err);
    return "I am currently experiencing heavy traffic and my API limits have been exhausted. Please try again in a few minutes.";
  }
}

export async function computeConfidenceScore(query: string, chunkText: string): Promise<number> {
  try {
    return await executeWithFallback(async () => {
      const openai = getLLMClient();
      const p = getLLMProvider();
      const response = await openai.chat.completions.create({
        messages: [
          { 
            role: "user", 
            content: `Evaluate how relevant the following text chunk is to answering the search query. 
Reply with a JSON object containing a single float key "score" between 0.0 (completely irrelevant) and 1.0 (contains the perfect direct answer).

Query: "${query}"
Chunk: "${chunkText}"` 
          }
        ],
        model: p.model,
        response_format: { type: "json_object" },
      });

      trackTokens((response as any).usage?.total_tokens || 100);
      const rawContent = response.choices[0]?.message?.content?.trim() || '{"score":0}';
      const cleanContent = sanitizeJson(rawContent);
      const data = JSON.parse(cleanContent);
      return typeof data.score === "number" ? data.score : 0;
    });
  } catch (err: any) {
    console.error("Confidence scorer failed completely, returning fallback score 0.5", err);
    return 0.5;
  }
}

export async function deepResearch(
  question: string,
  initialContext: string,
  searchFn?: (query: string) => Promise<{ context: string }>
): Promise<{ answer: string; steps: string[] }> {
  const steps: string[] = [];

  steps.push("Generating initial answer...");
  const initialAnswer = await generateAnswer(question, initialContext);

  if (!searchFn) {
    steps.push("Analyzing answer for improvement...");
    const critiquePrompt = `Review the following answer for accuracy, completeness, and clarity. Identify specific shortcomings or missing details. Then rewrite a final, improved version that addresses those gaps.

Question: "${question}"
Initial Answer: "${initialAnswer}"

Return ONLY the final improved answer, no commentary.`;

    const refinedAnswer = await executeWithFallback(async () => {
      const openai = getLLMClient();
      const p = getLLMProvider();
      const resp = await openai.chat.completions.create({
        messages: [{ role: "user", content: critiquePrompt }],
        model: p.model,
        temperature: 0.2,
      } as any);
      trackTokens((resp as any).usage?.total_tokens || 100);
      return resp.choices[0]?.message?.content?.trim() || initialAnswer;
    });

    steps.push("Refined answer via self-critique.");
    return { answer: refinedAnswer, steps };
  }

  steps.push("Identifying knowledge gaps...");
  const gapPrompt = `Given this question and answer, identify 1-2 specific knowledge gaps or uncertainties. What additional information would make the answer more complete and accurate? Return ONLY 1-2 short follow-up search queries, one per line, no numbering.

Question: "${question}"
Answer: "${initialAnswer}"`;

  const gapResult = await executeWithFallback(async () => {
    const openai = getLLMClient();
    const p = getLLMProvider();
    const resp = await openai.chat.completions.create({
      messages: [{ role: "user", content: gapPrompt }],
      model: p.model,
      temperature: 0.1,
    } as any);
    trackTokens((resp as any).usage?.total_tokens || 100);
    return resp.choices[0]?.message?.content?.trim() || "";
  });

  const followUps = gapResult.split("\n").filter(l => l.trim()).slice(0, 2);
  let extraContext = "";

  for (const q of followUps) {
    steps.push(`Searching: "${q}"`);
    const result = await searchFn(q);
    if (result.context) extraContext += "\n" + result.context;
  }

  steps.push("Generating refined answer...");
  const combinedContext = initialContext + extraContext;
  const refinedAnswer = await generateAnswer(question, combinedContext);

  return { answer: refinedAnswer, steps };
}
