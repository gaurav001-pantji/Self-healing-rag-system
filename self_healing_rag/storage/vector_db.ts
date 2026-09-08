import fs from "fs";
import path from "path";

export interface ChunkPayload {
  text: string;
  source_file: string;
  page_number: number;
  section_title: string;
  chunk_index: number;
  doc_id: string;
}

export interface ChunkRecord {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}

export interface DocumentMetadata {
  id: string;
  name: string;
  size: number;
  chunksCount: number;
  uploadTime: string;
}

const DB_FILE = path.join(process.cwd(), "self_healing_rag_vectors.json");
const DOC_METADATA_FILE = path.join(process.cwd(), "self_healing_rag_docs.json");

export class VectorDB {
  private chunks: ChunkRecord[] = [];
  private documents: DocumentMetadata[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        this.chunks = JSON.parse(raw);
      }
      if (fs.existsSync(DOC_METADATA_FILE)) {
        const raw = fs.readFileSync(DOC_METADATA_FILE, "utf-8");
        this.documents = JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error loading vector database files:", e);
      this.chunks = [];
      this.documents = [];
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.chunks, null, 2), "utf-8");
      fs.writeFileSync(DOC_METADATA_FILE, JSON.stringify(this.documents, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving vector database files:", e);
    }
  }

  public addDocument(doc: DocumentMetadata, newChunks: ChunkRecord[]) {
    this.deleteDocument(doc.id, false);

    this.documents.push(doc);
    this.chunks.push(...newChunks);
    this.save();
  }

  public deleteDocument(docId: string, shouldSave = true) {
    this.documents = this.documents.filter((d) => d.id !== docId);
    this.chunks = this.chunks.filter((c) => c.payload.doc_id !== docId);
    if (shouldSave) {
      this.save();
    }
  }

  public getDocuments(): DocumentMetadata[] {
    return this.documents;
  }

  public getTotalChunksCount(): number {
    return this.chunks.length;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  public similaritySearch(queryVector: number[], k = 5): Array<{ chunk: ChunkRecord; score: number }> {
    if (this.chunks.length === 0) return [];

    const results = this.chunks.map((chunk) => {
      const score = this.cosineSimilarity(queryVector, chunk.vector);
      const normalizedScore = (score + 1) / 2;
      return { chunk, score: normalizedScore };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  public keywordSearch(query: string, k = 5): Array<{ chunk: ChunkRecord; score: number }> {
    if (this.chunks.length === 0) return [];

    const queryTerms = query.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (queryTerms.length === 0) {
      const backupTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
      queryTerms.push(...backupTerms);
    }

    const results = this.chunks.map((chunk) => {
      const text = chunk.payload.text.toLowerCase();
      let matchCount = 0;
      queryTerms.forEach((term) => {
        const regex = new RegExp(`\\b${term}\\b`, "g");
        const matches = text.match(regex);
        if (matches) {
          matchCount += matches.length;
        }
      });

      const wordCount = chunk.payload.text.split(/\s+/).length || 1;
      const score = matchCount / wordCount;
      return { chunk, score };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  public getChunksByDocId(docId: string): ChunkRecord[] {
    return this.chunks.filter(c => c.payload.doc_id === docId);
  }

  public isHealthy(): boolean {
    return true;
  }
}

export const dbInstance = new VectorDB();
