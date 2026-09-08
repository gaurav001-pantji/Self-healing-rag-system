import { computeConfidenceScore } from "../generation/llm";

export class ConfidenceScorer {
  public static async getConfidence(query: string, chunkText: string): Promise<number> {
    return await computeConfidenceScore(query, chunkText);
  }
}
