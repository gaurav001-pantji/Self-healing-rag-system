import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { config } from "./self_healing_rag/config";
import { dbInstance, DocumentMetadata, ChunkRecord } from "./self_healing_rag/storage/vector_db";
import { DocumentParser } from "./self_healing_rag/parsers/ragflow_parser";
import { SemanticChunker } from "./self_healing_rag/parsers/chunker";
import { retrieverInstance } from "./self_healing_rag/retrieval/self_healing";
import { getEmbedding, generateAnswer, getTokenUsage, setModel, getCurrentModel, getModelCatalog, deepResearch } from "./self_healing_rag/generation/llm";
import { GroundingChecker } from "./self_healing_rag/generation/grounding";

const rateLimits = new Map<string, number[]>();
const RATE_WINDOW = 60_000;
const RATE_MAX = 100;

function rateLimit(req: any, res: any, next: any) {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  if (!rateLimits.has(ip)) rateLimits.set(ip, []);
  const timestamps = rateLimits.get(ip)!;
  const windowStart = now - RATE_WINDOW;
  while (timestamps.length && timestamps[0] < windowStart) timestamps.shift();
  if (timestamps.length >= RATE_MAX) {
    return res.status(429).json({ error: "Too many requests. Please wait and try again." });
  }
  timestamps.push(now);
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

    app.use("/api", rateLimit);

  app.get("/api/health", (req, res) => {
    const hasNvidia = config.NVIDIA_API_KEYS.some(Boolean);
    const tokenInfo = getTokenUsage();
    res.json({
      status: "healthy",
      vector_db: {
        status: dbInstance.isHealthy() ? "connected" : "unreachable",
        collection: "documents",
        total_chunks: dbInstance.getTotalChunksCount(),
        total_documents: dbInstance.getDocuments().length,
      },
      embedding_model: {
        status: hasNvidia ? "ready" : "api_key_missing (cannot ingest)",
        model: config.EMBEDDING_MODEL,
      },
      llm: {
        status: hasNvidia ? "ready" : "api_key_missing",
        model: config.LLM_MODEL,
      },
      token_usage: {
        last_60s: tokenInfo.current,
        limit: tokenInfo.limit,
        percent: tokenInfo.pct,
      },
      self_healing_enabled: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/documents", (req, res) => {
    try {
      const docs = dbInstance.getDocuments();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/documents/:id", (req, res) => {
    try {
      const docId = req.params.id;
      dbInstance.deleteDocument(docId);
      res.json({ status: "deleted", id: docId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ingest", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const hasNvidia = config.NVIDIA_API_KEYS.some(Boolean);
      if (!hasNvidia) {
        return res.status(503).json({
          error: "NVIDIA API Key is required for generating embeddings to ingest documents.",
        });
      }

      const { buffer, originalname, size, mimetype } = req.file;

      console.log(`Ingesting document: ${originalname} (${size} bytes)`);
      const parsedDoc = await DocumentParser.parseFile(originalname, buffer, mimetype);

      const chunks = SemanticChunker.chunkDocument(parsedDoc);
      console.log(`Extracted ${chunks.length} chunks from ${originalname}`);

      if (chunks.length === 0) {
        return res.status(400).json({ error: "No valid text chunks could be extracted from this document." });
      }

      const docId = Math.random().toString(36).substring(2, 9);
      const chunkRecords: ChunkRecord[] = [];

      const batchSize = 5;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (chunk) => {
            try {
              const vector = await getEmbedding(chunk.text);
              chunkRecords.push({
                id: `${docId}_${chunk.chunk_index}`,
                vector,
                payload: {
                  text: chunk.text,
                  source_file: originalname,
                  page_number: chunk.page_number,
                  section_title: chunk.section_title,
                  chunk_index: chunk.chunk_index,
                  doc_id: docId,
                },
              });
            } catch (err) {
              console.error(`Failed to generate embedding for chunk ${chunk.chunk_index} of ${originalname}:`, err);
            }
          })
        );
      }

      if (chunkRecords.length === 0) {
        throw new Error("Failed to generate embedding vectors for any of the document chunks.");
      }

      const docMeta: DocumentMetadata = {
        id: docId,
        name: originalname,
        size: size,
        chunksCount: chunkRecords.length,
        uploadTime: new Date().toISOString(),
      };

      dbInstance.addDocument(docMeta, chunkRecords);

      res.json({
        status: "indexed",
        id: docId,
        chunks: chunkRecords.length,
        file: originalname,
      });
    } catch (err: any) {
      console.error("Ingestion failed:", err);
      res.status(500).json({ error: err.message || "An error occurred during ingestion." });
    }
  });

  app.post("/api/summarize", upload.single("file"), async (req, res) => {
    try {
      const { docId } = req.body;

      let fullText = "";
      let sourceName = "";

      if (docId) {
        const docs = dbInstance.getDocuments();
        const doc = docs.find(d => d.id === docId);
        if (!doc) return res.status(404).json({ error: "Document not found" });
        const allChunks = dbInstance.getChunksByDocId(docId);
        fullText = allChunks.map(c => c.payload.text).join("\n\n");
        sourceName = doc.name;
      } else if (req.file) {
        const { buffer, originalname, mimetype } = req.file;
        const parsedDoc = await DocumentParser.parseFile(originalname, buffer, mimetype);
        fullText = parsedDoc.text;
        sourceName = originalname;
      } else {
        return res.status(400).json({ error: "Provide a file or docId" });
      }

      if (!fullText || fullText.trim().length < 20) {
        return res.status(400).json({ error: "Document contains insufficient text for summarization." });
      }

      const MAX_CHARS = 60000;
      if (fullText.length > MAX_CHARS) {
        fullText = fullText.slice(0, MAX_CHARS) + "\n\n[... document truncated ...]";
      }

      const prompt = `Summarize the following document in a clear, structured format.
Provide:
1. **Overview** (2-3 sentences on what the document is about)
2. **Key Points** (bullet list of the most important takeaways)
3. **Details** (brief explanation of each key point)

Keep the summary comprehensive but concise. Focus on the most important information.

DOCUMENT: ${sourceName}

TEXT:
${fullText}

SUMMARY:`;

      const summary = await generateAnswer(prompt, "");

      res.json({ summary, source: sourceName });
    } catch (err: any) {
      console.error("Summarization failed:", err);
      res.status(500).json({ error: err.message || "Summarization failed." });
    }
  });

  app.get("/api/models", (_req, res) => {
    res.json({ models: getModelCatalog(), current: getCurrentModel() });
  });


  app.post("/api/query", async (req, res) => {
    try {
      const { question, k = 5, threshold = config.CONFIDENCE_THRESHOLD, model, deep, rag } = req.body;
      if (model) setModel(model);

      if (!question || question.trim() === "") {
        return res.status(400).json({ error: "Question cannot be empty" });
      }

      const isRagMode = rag || question.startsWith('/me');
      const actualQuestion = question.replace(/^\/me(?:\s|$)/i, '').trim();

      if (!actualQuestion) {
        return res.status(400).json({ error: "Question cannot be empty after /me prefix" });
      }

      const hasNvidia = config.NVIDIA_API_KEYS.some(Boolean);

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const onProgress = (msg: string, pct: number) => {
        res.write(JSON.stringify({ status: msg, progress: pct }) + '\n');
      };

      if (isRagMode && !hasNvidia) {
        return res.status(503).json({
          error: "No API Keys configured. Please add NVIDIA_API_KEY.",
        });
      }

      let contextText = "";
      let retrievalResult: { chunks: any[]; strategy: string; confidence: number; reformulated_query?: string } | null = null;
      let groundChunks: any[] = [];

      if (isRagMode) {
        console.log(`[RAG] Processing: "${actualQuestion}" (k=${k}, threshold=${threshold})`);
        retrievalResult = await retrieverInstance.retrieve(actualQuestion, k, threshold, onProgress, false);
        contextText = retrievalResult.chunks
          .map((c, i) => `[Chunk ${i + 1}] Source: ${c.payload.source_file}, Page: ${c.payload.page_number}, Section: ${c.payload.section_title}\nContent: ${c.payload.text}`)
          .join("\n\n");
        groundChunks = retrievalResult.chunks.map((c: any) => ({
          text: c.payload.text, source_file: c.payload.source_file, page_number: c.payload.page_number,
        }));
      }

      let answer: string;
      let researchSteps: string[] = [];

      if (deep && isRagMode) {
        onProgress("Deep research with document search...", 70);
        const searchFn = async (q: string) => {
          const r = await retrieverInstance.retrieve(q, k, threshold, () => {}, false);
          const ctx = r.chunks.map((c: any) =>
            `[Source: ${c.payload.source_file}, Page: ${c.payload.page_number}]\nContent: ${c.payload.text}`
          ).join("\n\n");
          return { context: ctx };
        };
        const dr = await deepResearch(actualQuestion, contextText, searchFn);
        answer = dr.answer;
        researchSteps = dr.steps;
      } else if (deep) {
        onProgress("Deep research (self-refine)...", 70);
        const dr = await deepResearch(actualQuestion, "");
        answer = dr.answer;
        researchSteps = dr.steps;
      } else {
        onProgress(isRagMode ? "Generating final answer from AI..." : "Thinking...", 80);
        answer = await generateAnswer(actualQuestion, contextText);
      }

      let groundingResult;
      if (isRagMode) {
        onProgress("Running Grounding Verification...", 90);
        groundingResult = await GroundingChecker.verifyAnswer(actualQuestion, answer, groundChunks);
      } else {
        groundingResult = {
          answer, sources: [], grounding_score: 1.0, is_hallucinated: false,
          verified_claims: [], unverified_claims: [],
        };
      }

      const finalResult = {
        ...groundingResult,
        strategy: retrievalResult?.strategy || "direct",
        confidence: retrievalResult?.confidence || 1.0,
        reformulated_query: retrievalResult?.reformulated_query || undefined,
        rag_mode: !!isRagMode,
        deep_research: deep || undefined,
        research_steps: researchSteps.length ? researchSteps : undefined,
        chunks: retrievalResult ? retrievalResult.chunks.map((c: any) => ({
          text: c.payload.text, source_file: c.payload.source_file,
          page_number: c.payload.page_number, section_title: c.payload.section_title,
          chunk_index: c.payload.chunk_index,
        })) : [],
      };

      res.write(JSON.stringify({ finalResult }) + '\n');
      res.end();
    } catch (err: any) {
      console.error("Query API failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "An error occurred during query processing." });
      } else {
        res.write(JSON.stringify({ error: err.message || "An error occurred" }) + '\n');
        res.end();
      }
    }
  });

  app.get("/api/metrics", (req, res) => {
    try {
      const docs = dbInstance.getDocuments();
      const logs = retrieverInstance.getLogs();

      const totalDocs = docs.length;
      const totalChunks = dbInstance.getTotalChunksCount();
      const queriesHandled = logs.length;
      const selfHealsTriggered = logs.filter((l) => l.strategy !== "direct").length;

      let sumConfidence = 0;
      logs.forEach((l) => {
        sumConfidence += l.confidence;
      });
      const avgConfidence = queriesHandled > 0 ? parseFloat((sumConfidence / queriesHandled).toFixed(2)) : 0;

      const recentQueries = logs.slice(-20).map((l) => ({
        id: l.id,
        query: l.query,
        strategy: l.strategy,
        confidence: l.confidence,
        timestamp: l.timestamp,
        reformulated_query: l.reformulated_query,
      }));

      res.json({
        documents_indexed: totalDocs,
        total_chunks: totalChunks,
        queries_handled: queriesHandled,
        self_heals_triggered: selfHealsTriggered,
        avg_confidence: avgConfidence,
        confidence_history: recentQueries,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/logs", (req, res) => {
    try {
      const logs = retrieverInstance.getLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logs/clear", (req, res) => {
    try {
      retrieverInstance.clearLogs();
      res.json({ status: "cleared" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
