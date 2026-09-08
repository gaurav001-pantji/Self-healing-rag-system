import dotenv from "dotenv";

dotenv.config();

export const AVAILABLE_MODELS = [
  { id: "llama3-8b",     label: "LLaMA 3.1 8B",         description: "Fast (Groq + NVIDIA)" },
  { id: "llama3-70b",    label: "LLaMA 3.1 70B",        description: "Powerful (Groq + NVIDIA)" },
  { id: "llama33-70b",   label: "LLaMA 3.3 70B",        description: "NVIDIA only" },
  { id: "llama4-17b",    label: "LLaMA 4 Maverick 17B",  description: "NVIDIA only" },
  { id: "deepseek",      label: "DeepSeek V4 Flash",     description: "NVIDIA only" },
  { id: "gemma3-12b",    label: "Gemma 3 12B",           description: "NVIDIA only" },
  { id: "gemma3-4b",     label: "Gemma 3 4B",            description: "NVIDIA only" },
  { id: "mistral-7b",    label: "Mistral 7B",             description: "NVIDIA only" },
  { id: "mistral-nemo",  label: "Mistral Nemo 12B",       description: "NVIDIA only" },
];

export const MODEL_MAP: Record<string, { groqModel?: string; nvidiaModel: string }> = {
  "llama3-8b":     { groqModel: "llama-3.1-8b-instant",           nvidiaModel: "meta/llama-3.1-8b-instruct" },
  "llama3-70b":    { groqModel: "llama-3.1-70b-versatile",         nvidiaModel: "meta/llama-3.1-70b-instruct" },
  "llama33-70b":   {                                                nvidiaModel: "meta/llama-3.3-70b-instruct" },
  "llama4-17b":    {                                                nvidiaModel: "meta/llama-4-maverick-17b-128e-instruct" },
  "deepseek":      {                                                nvidiaModel: "deepseek-ai/deepseek-v4-flash" },
  "gemma3-12b":    {                                                nvidiaModel: "google/gemma-3-12b-it" },
  "gemma3-4b":     {                                                nvidiaModel: "google/gemma-3-4b-it" },
  "mistral-7b":    {                                                nvidiaModel: "mistralai/mistral-7b-instruct-v0.3" },
  "mistral-nemo":  {                                                nvidiaModel: "nv-mistralai/mistral-nemo-12b-instruct" },
};

export const config = {
  NVIDIA_API_KEYS: [
    process.env.NVIDIA_API_KEY_PRIMARY || "",
    process.env.NVIDIA_API_KEY_FALLBACK_1 || "",
    process.env.NVIDIA_API_KEY_FALLBACK_2 || "",
  ].filter(Boolean),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  QDRANT_URL: process.env.QDRANT_URL || "http://localhost:6333",
  EMBEDDING_MODEL: "nvidia/nv-embedqa-e5-v5",
  LLM_MODEL: "llama-3.1-8b-instant", // primary: groq, fallback: nvidia
  CONFIDENCE_THRESHOLD: parseFloat(process.env.CONFIDENCE_THRESHOLD || "0.6"),
  CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE || "500", 10),
  CHUNK_OVERLAP: parseInt(process.env.CHUNK_OVERLAP || "50", 10),
  MAX_REFORMULATION_ATTEMPTS: parseInt(process.env.MAX_REFORMULATION_ATTEMPTS || "1", 10),
  SYSTEM_LOG_FILE: "system_logs.json"
};
