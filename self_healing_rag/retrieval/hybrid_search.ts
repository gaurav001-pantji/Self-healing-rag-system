import { ChunkRecord, dbInstance } from "../storage/vector_db";
import { getEmbedding } from "../generation/llm";
import { ConfidenceScorer } from "./confidence";

export class HybridSearch {
  public static async search(
    query: string,
    k = 5,
    queryVector?: number[]
  ): Promise<Array<{ chunk: ChunkRecord; score: number }>> {
    const vector = queryVector || (await getEmbedding(query));

    const vectorResults = dbInstance.similaritySearch(vector, k * 2);
    const keywordResults = dbInstance.keywordSearch(query, k * 2);

    const rrfMap = new Map<string, { chunk: ChunkRecord; rrfScore: number; vectorRank: number; keywordRank: number }>();

    const kRRF = 60;

    vectorResults.forEach((res, rank) => {
      const id = `${res.chunk.payload.doc_id}_${res.chunk.payload.chunk_index}`;
      rrfMap.set(id, {
        chunk: res.chunk,
        rrfScore: 1 / (kRRF + rank + 1),
        vectorRank: rank + 1,
        keywordRank: -1,
      });
    });

    keywordResults.forEach((res, rank) => {
      const id = `${res.chunk.payload.doc_id}_${res.chunk.payload.chunk_index}`;
      if (rrfMap.has(id)) {
        const item = rrfMap.get(id)!;
        item.rrfScore += 1 / (kRRF + rank + 1);
        item.keywordRank = rank + 1;
      } else {
        rrfMap.set(id, {
          chunk: res.chunk,
          rrfScore: 1 / (kRRF + rank + 1),
          vectorRank: -1,
          keywordRank: rank + 1,
        });
      }
    });

    const mergedList = Array.from(rrfMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, k);

    const reranked = await Promise.all(
      mergedList.map(async (item) => {
        const confidence = await ConfidenceScorer.getConfidence(query, item.chunk.payload.text);
        return {
          chunk: item.chunk,
          score: confidence,
        };
      })
    );

    reranked.sort((a, b) => b.score - a.score);
    return reranked;
  }
}
