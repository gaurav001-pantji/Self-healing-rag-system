export interface DocumentMetadata {
  id: string;
  name: string;
  size: number;
  chunksCount: number;
  uploadTime: string;
}

export interface ChunkPayload {
  text: string;
  source_file: string;
  page_number: number;
  section_title: string;
  chunk_index: number;
}

export interface SystemLog {
  id: string;
  query: string;
  strategy: "direct" | "reformulated" | "hybrid";
  confidence: number;
  timestamp: string;
  reformulated_query?: string;
}

export interface SystemMetrics {
  documents_indexed: number;
  total_chunks: number;
  queries_handled: number;
  self_heals_triggered: number;
  avg_confidence: number;
  confidence_history: SystemLog[];
}

export interface HealthStatus {
  status: string;
  vector_db: {
    status: string;
    collection: string;
    total_chunks: number;
    total_documents: number;
  };
  embedding_model: {
    status: string;
    model: string;
  };
  llm: {
    status: string;
    model: string;
  };
  self_healing_enabled: boolean;
  timestamp: string;
}

export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export interface QueryResponse {
  answer: string;
  sources: string[];
  grounding_score: number;
  is_hallucinated: boolean;
  verified_claims: string[];
  unverified_claims: string[];
  strategy: "direct" | "reformulated" | "hybrid";
  confidence: number;
  reformulated_query?: string;
  deep_research?: boolean;
  research_steps?: string[];
  chunks: ChunkPayload[];
}
