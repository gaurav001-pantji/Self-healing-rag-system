import fs from "fs";
import path from "path";
import { ChunkRecord, dbInstance } from "../storage/vector_db";
import { getEmbedding, reformulateQuery } from "../generation/llm";
import { ConfidenceScorer } from "./confidence";
import { HybridSearch } from "./hybrid_search";

export interface HealingLog {
  id: string;
  query: string;
  strategy: "direct" | "reformulated" | "hybrid";
  confidence: number;
  timestamp: string;
  reformulated_query?: string;
}

const LOG_FILE = path.join(process.cwd(), "self_healing_rag_logs.json");

export class SelfHealingRetriever {
  private logs: HealingLog[] = [];

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    try {
      if (fs.existsSync(LOG_FILE)) {
        this.logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
      }
    } catch (e) {
      console.error("Error loading self-healing logs:", e);
      this.logs = [];
    }
  }

  private saveLogs() {
    try {
      fs.writeFileSync(LOG_FILE, JSON.stringify(this.logs, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving self-healing logs:", e);
    }
  }

  public getLogs(): HealingLog[] {
    return this.logs;
  }

  public clearLogs() {
    this.logs = [];
    this.saveLogs();
  }

  public async retrieve(
    query: string,
    k = 5,
    threshold = 0.6,
    onProgress?: (msg: string, pct: number) => void,
    skipConfidence = false
  ): Promise<{
    chunks: ChunkRecord[];
    confidence: number;
    strategy: "direct" | "reformulated" | "hybrid";
    reformulated_query?: string;
  }> {
    const timestamp = new Date().toISOString();
    const logId = Math.random().toString(36).substring(2, 9);

    if (dbInstance.getTotalChunksCount() === 0) {
      const logItem: HealingLog = {
        id: logId,
        query,
        strategy: "direct",
        confidence: 0,
        timestamp,
      };
      this.logs.push(logItem);
      this.saveLogs();
      return { chunks: [], confidence: 0, strategy: "direct" };
    }

    onProgress?.("Searching Document Database...", 10);
    let queryVector: number[];
    try {
      queryVector = await getEmbedding(query);
    } catch (err) {
      console.error("Embedding generation failed, falling back to keyword-only direct strategy:", err);
      const kwChunks = dbInstance.keywordSearch(query, k);
      return {
        chunks: kwChunks.map((c) => c.chunk),
        confidence: 0.3,
        strategy: "direct",
      };
    }

    const initialResults = dbInstance.similaritySearch(queryVector, k);

    if (initialResults.length === 0) {
      const logItem: HealingLog = {
        id: logId,
        query,
        strategy: "direct",
        confidence: 0,
        timestamp,
      };
      this.logs.push(logItem);
      this.saveLogs();
      return { chunks: [], confidence: 0, strategy: "direct" };
    }

    if (skipConfidence) {
      const logItem: HealingLog = {
        id: logId,
        query,
        strategy: "direct",
        confidence: 1.0,
        timestamp,
      };
      this.logs.push(logItem);
      this.saveLogs();

      return {
        chunks: initialResults.map((r) => r.chunk),
        confidence: 1.0,
        strategy: "direct",
      };
    }

    onProgress?.("Evaluating Search Quality...", 25);
    const topChunkText = initialResults[0].chunk.payload.text;
    const initialConfidence = await ConfidenceScorer.getConfidence(query, topChunkText);

    if (initialConfidence >= threshold) {
      const logItem: HealingLog = {
        id: logId,
        query,
        strategy: "direct",
        confidence: initialConfidence,
        timestamp,
      };
      this.logs.push(logItem);
      this.saveLogs();

      return {
        chunks: initialResults.map((r) => r.chunk),
        confidence: initialConfidence,
        strategy: "direct",
      };
    }

    console.log(`Self-Healing triggered! Low confidence (${initialConfidence} < ${threshold}) for query: "${query}"`);
    onProgress?.("Low confidence score. Reformulating Query...", 40);

    let reformulated: string;
    try {
      reformulated = await reformulateQuery(query);
      console.log(`Query reformulated to: "${reformulated}"`);
    } catch (err) {
      console.error("Query reformulation failed, continuing with original query", err);
      reformulated = query;
    }

    let reformulatedVector: number[];
    try {
      reformulatedVector = await getEmbedding(reformulated);
    } catch (err) {
      reformulatedVector = queryVector;
    }

    const reformulatedResults = dbInstance.similaritySearch(reformulatedVector, k);

    let reformulatedConfidence = 0;
    if (reformulatedResults.length > 0) {
      const newTopChunkText = reformulatedResults[0].chunk.payload.text;
      reformulatedConfidence = await ConfidenceScorer.getConfidence(reformulated, newTopChunkText);
    }

    if (reformulatedConfidence >= threshold && reformulatedResults.length > 0) {
      const logItem: HealingLog = {
        id: logId,
        query,
        strategy: "reformulated",
        confidence: reformulatedConfidence,
        timestamp,
        reformulated_query: reformulated,
      };
      this.logs.push(logItem);
      this.saveLogs();

      return {
        chunks: reformulatedResults.map((r) => r.chunk),
        confidence: reformulatedConfidence,
        strategy: "reformulated",
        reformulated_query: reformulated,
      };
    }

    console.log(`Self-healing Phase 2: Hybrid Search fallback for query: "${query}"`);
    onProgress?.("Still low confidence. Switching to Hybrid Search...", 60);
    const hybridResults = await HybridSearch.search(reformulated, k, reformulatedVector);

    let hybridConfidence = 0;
    if (hybridResults.length > 0) {
      hybridConfidence = hybridResults[0].score;
    } else {
      return {
        chunks: initialResults.map((r) => r.chunk),
        confidence: initialConfidence,
        strategy: "direct",
      };
    }

    const logItem: HealingLog = {
      id: logId,
      query,
      strategy: "hybrid",
      confidence: hybridConfidence,
      timestamp,
      reformulated_query: reformulated,
    };
    this.logs.push(logItem);
    this.saveLogs();

    return {
      chunks: hybridResults.map((r) => r.chunk),
      confidence: hybridConfidence,
      strategy: "hybrid",
      reformulated_query: reformulated,
    };
  }
}

export const retrieverInstance = new SelfHealingRetriever();
