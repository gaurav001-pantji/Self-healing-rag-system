import React, { useState, useEffect } from "react";
import { Search, Sliders, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileText, Sparkles, HelpCircle, Beaker, Database } from "lucide-react";
import { QueryResponse, ModelOption } from "../types";

interface RAGQueryProps {
  onLogAdd: (msg: string, type: "info" | "success" | "heal" | "error") => void;
  onRefreshMetrics: () => void;
}

export const RAGQuery: React.FC<RAGQueryProps> = ({ onLogAdd, onRefreshMetrics }) => {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threshold, setThreshold] = useState(0.6);
  const [k, setK] = useState(5);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("llama3-8b");
  const [deepResearch, setDeepResearch] = useState(false);
  const [ragMode, setRagMode] = useState(false);

  useEffect(() => {
    fetch("/api/models").then(r => r.json()).then(d => {
      if (d.models) setModels(d.models);
      if (d.current) setSelectedModel(d.current);
    }).catch(() => {});
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsLoading(true);
    setQueryResult(null);
    setExpandedChunk(null);
    onLogAdd(`Initiating search: "${question}" (RAG: ${ragMode}, Model: ${selectedModel}, Deep: ${deepResearch}, Threshold: ${threshold})`, "info");

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, k, threshold, model: selectedModel, deep: deepResearch, rag: ragMode }),
      });

      const rawText = await response.text();
      const lines = rawText.trim().split("\n").filter(Boolean);
      let data: any = {};
      for (const line of lines) {
        try { data = JSON.parse(line); } catch {}
      }
      if (data.finalResult) data = data.finalResult;

      if (!response.ok) {
        throw new Error(data.error || "Query failed");
      }

      setQueryResult(data);

      if (data.strategy === "direct") {
        onLogAdd(`Query answered directly with ${(data.confidence || 1).toFixed(2)} confidence.`, "success");
      } else if (data.strategy === "reformulated") {
        onLogAdd(`Confidence low. Reformulated query to: "${data.reformulated_query}" - Confidence: ${(data.confidence || 0).toFixed(2)}`, "heal");
      } else {
        onLogAdd(`Query ${data.strategy ? "used " + data.strategy + " search" : "completed"} - Confidence: ${(data.confidence || 1).toFixed(2)}`, "heal");
      }

      onRefreshMetrics();
    } catch (err: any) {
      console.error(err);
      onLogAdd(`Query processing failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case "direct":
        return "bg-black text-[#E4E3E0] border-black";
      case "reformulated":
        return "bg-orange-50 text-orange-600 border-orange-600";
      case "hybrid":
        return "bg-blue-50 text-blue-600 border-blue-600";
      default:
        return "bg-[#DCDAD7] text-[#141414] border-black";
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= threshold) return "text-green-700 bg-green-50 border-green-700";
    if (score >= 0.4) return "text-orange-600 bg-orange-50 border-orange-600";
    return "text-red-600 bg-red-50 border-red-600";
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" />
            <input
              type="text"
              id="search-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask the Self-Healing RAG System anything..."
              className="w-full pl-11 pr-4 py-3 bg-white border-2 border-black rounded-none focus:outline-none focus:bg-[#F0F0F0] text-black font-mono text-sm placeholder-slate-400"
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            id="search-submit"
            disabled={isLoading || !question.trim()}
            className="px-6 py-3 bg-black text-[#E4E3E0] border-2 border-black rounded-none font-bold uppercase tracking-widest hover:bg-white hover:text-black disabled:opacity-50 transition-all flex items-center justify-center gap-2 shrink-0 font-mono text-xs"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>RUNNING_QUERY...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>QUERY_ENGINE</span>
              </>
            )}
          </button>
        </div>

        <div className="p-4 bg-[#DCDAD7] border-2 border-black rounded-none flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2 text-black font-extrabold text-[10px] uppercase tracking-wider font-mono">
            <Sliders className="h-4 w-4" />
            <span>Retriever Config:</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold font-mono uppercase">AI Engine:</label>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                fetch("/api/models", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ modelId: e.target.value })
                });
              }}
              className="bg-white border border-black text-black text-[10px] font-mono px-2 py-1 outline-none"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={deepResearch}
                onChange={(e) => setDeepResearch(e.target.checked)}
                disabled={isLoading}
              />
              <div className={`block w-10 h-6 border-2 border-black ${deepResearch ? 'bg-purple-900' : 'bg-white'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-black w-3 h-3 transition transform ${deepResearch ? 'translate-x-4 bg-white' : ''}`}></div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wide font-mono flex items-center gap-1.5">
              <Beaker className="h-3 w-3" />
              Deep Search (RAG)
            </span>
          </label>

          <div className="flex items-center space-x-3 flex-grow max-w-xs">
            <label className="text-[10px] text-black font-bold uppercase font-mono whitespace-nowrap">
              Threshold ({(threshold * 100).toFixed(0)}%):
            </label>
            <input
              type="range"
              id="threshold-slider"
              min="0.3"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full h-2 bg-black/20 appearance-none cursor-pointer accent-black"
            />
          </div>

          <div className="flex items-center space-x-3 flex-grow max-w-xs">
            <label className="text-[10px] text-black font-bold uppercase font-mono whitespace-nowrap">
              Top K ({k}):
            </label>
            <input
              type="range"
              id="k-slider"
              min="1"
              max="10"
              step="1"
              value={k}
              onChange={(e) => setK(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-black/20 appearance-none cursor-pointer accent-black"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-[10px] text-black font-bold uppercase font-mono whitespace-nowrap">
              Model:
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-[10px] font-mono font-bold bg-white border-2 border-black px-2 py-1 rounded-none cursor-pointer"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setRagMode(!ragMode)}
              className={`text-[10px] font-mono font-bold px-2.5 py-1 border-2 rounded-none uppercase tracking-wide flex items-center gap-1 transition-all ${
                ragMode
                  ? "bg-emerald-800 text-white border-emerald-800"
                  : "bg-white text-black border-black hover:bg-emerald-50"
              }`}
            >
              <Database className="h-3 w-3" />
              {ragMode ? "RAG ON" : "RAG OFF"}
            </button>
            <button
              type="button"
              onClick={() => setDeepResearch(!deepResearch)}
              className={`text-[10px] font-mono font-bold px-2.5 py-1 border-2 rounded-none uppercase tracking-wide flex items-center gap-1 transition-all ${
                deepResearch
                  ? "bg-purple-900 text-white border-purple-900"
                  : "bg-white text-black border-black hover:bg-purple-50"
              }`}
            >
              <Beaker className="h-3 w-3" />
              {deepResearch ? "DEEP ON" : "DEEP OFF"}
            </button>
          </div>
        </div>
      </form>

      {queryResult && (
        <div className="space-y-6">
          <div className="bg-white border-2 border-black rounded-none p-6 space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2 border-b border-black/10 pb-3">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 border-2 rounded-none uppercase tracking-wide ${getStrategyColor(queryResult.strategy)}`}>
                  Strategy: {queryResult.strategy}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 border-2 rounded-none uppercase tracking-wide ${getConfidenceColor(queryResult.confidence)}`}>
                  Confidence: {(queryResult.confidence * 100).toFixed(0)}%
                </span>
              </div>
                  {queryResult.deep_research && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-purple-900 text-white rounded-none">DEEP RESEARCH</span>
                  )}
                  <span className="text-[10px] font-mono font-bold uppercase text-slate-400">Grounded Answer</span>
            </div>

            {queryResult.reformulated_query && queryResult.strategy !== "direct" && (
              <div className="p-3 bg-orange-50 border-2 border-orange-600 rounded-none text-xs text-orange-950 space-y-1 font-mono">
                <p className="font-bold flex items-center gap-1.5 uppercase text-[10px]">
                  <Sparkles className="h-3.5 w-3.5 text-orange-600 animate-pulse" />
                  Self-Healing Phase Activated (Retrieved Confidence below threshold)
                </p>
                <p>
                  <span className="font-bold text-slate-500">REFORMULATED QUERY:</span> "{queryResult.reformulated_query}"
                </p>
              </div>
            )}

            <div className="prose text-black leading-relaxed max-w-none text-sm font-semibold whitespace-pre-line font-sans">
              {queryResult.answer}
            </div>

            {queryResult.deep_research && queryResult.research_steps && (
              <div className="pt-4 border-t border-black/15 space-y-1">
                <span className="text-[10px] font-mono font-black text-purple-900 uppercase">Research Steps:</span>
                {queryResult.research_steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-purple-950">
                    <span className="w-4 h-4 rounded-full bg-purple-900 text-white flex items-center justify-center text-[8px] font-bold">{i + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
            )}

            {queryResult.sources.length > 0 && (
              <div className="pt-4 border-t border-black/15 flex items-center flex-wrap gap-2 text-[10px] font-mono">
                <span className="font-bold text-slate-500 uppercase">CITED_SOURCES:</span>
                {queryResult.sources.map((src, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#DCDAD7] border border-black text-black font-bold">
                    {src}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border-2 border-black rounded-none overflow-hidden">
            <div className="p-3 border-b-2 border-black bg-[#F0F0F0] flex justify-between items-center flex-wrap gap-2">
              <h4 className="font-extrabold text-black flex items-center gap-1.5 text-xs uppercase font-mono tracking-tight">
                <CheckCircle2 className="h-4 w-4 text-green-700" />
                Factual Grounding Check
              </h4>
              <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 border-2 rounded-none uppercase ${
                queryResult.grounding_score >= 0.7 
                  ? "bg-green-100 text-green-800 border-green-700" 
                  : "bg-red-100 text-red-800 border-red-600"
              }`}>
                Grounding Score: {(queryResult.grounding_score * 100).toFixed(0)}%
              </span>
            </div>

            <div className="p-5 space-y-4">
              {queryResult.is_hallucinated ? (
                <div className="p-3 bg-red-100 border-2 border-red-600 text-red-950 rounded-none text-xs font-mono font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 animate-bounce" />
                  <span>HALLUCINATION DETECTED: Some claims are unverified by source context.</span>
                </div>
              ) : (
                <div className="p-3 bg-green-50 border-2 border-green-700 text-green-950 rounded-none text-xs font-mono font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-700 flex-shrink-0" />
                  <span>GROUNDING PERFECT: Every generated claim is verified by the context chunks.</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-mono font-black text-black uppercase tracking-wider">Verified Assertions ({queryResult.verified_claims.length})</p>
                  {queryResult.verified_claims.length === 0 ? (
                    <p className="text-xs text-slate-500 italic font-mono">// No verified claims extracted.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {queryResult.verified_claims.map((claim, idx) => (
                        <li key={idx} className="text-xs text-black font-semibold flex items-start gap-2">
                          <span className="text-green-700 mt-0.5 flex-shrink-0 font-mono">✔</span>
                          <span>{claim}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-mono font-black text-black uppercase tracking-wider">Unverified/Hypothetical Assertions ({queryResult.unverified_claims.length})</p>
                  {queryResult.unverified_claims.length === 0 ? (
                    <p className="text-xs text-green-700 italic font-bold flex items-center gap-1 font-mono">
                      ✔ All claims fully grounded.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {queryResult.unverified_claims.map((claim, idx) => (
                        <li key={idx} className="text-xs text-red-700 font-bold flex items-start gap-2">
                          <span className="text-red-600 mt-0.5 flex-shrink-0 font-mono">✘</span>
                          <span>{claim}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-mono font-black text-black uppercase tracking-wider">Retrieved Source Chunks ({queryResult.chunks.length})</h4>
            <div className="space-y-2">
              {queryResult.chunks.map((chunk, idx) => {
                const isExpanded = expandedChunk === idx;
                return (
                  <div key={idx} className="border-2 border-black rounded-none bg-white overflow-hidden">
                    <button
                      id={`chunk-header-${idx}`}
                      type="button"
                      onClick={() => setExpandedChunk(isExpanded ? null : idx)}
                      className="w-full px-4 py-3 bg-[#DCDAD7]/50 flex items-center justify-between text-left hover:bg-[#DCDAD7] transition-colors border-b border-black font-mono text-xs uppercase font-extrabold"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <FileText className="h-4 w-4 text-black flex-shrink-0" />
                        <span className="text-xs text-black font-black truncate">{chunk.source_file}</span>
                        <span className="text-[9px] bg-black text-[#E4E3E0] px-1.5 py-0.5 font-bold">PAGE {chunk.page_number}</span>
                        <span className="text-[9px] bg-black text-[#E4E3E0] px-1.5 py-0.5 font-bold font-mono">CHUNK {chunk.chunk_index}</span>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-black" /> : <ChevronDown className="h-4 w-4 text-black" />}
                    </button>
                    {isExpanded && (
                      <div className="p-4 bg-white border-t border-black font-mono">
                        <p className="text-[9px] font-black text-slate-500 mb-2 uppercase tracking-wider">SECTION: {chunk.section_title || "GENERAL CONTEXT"}</p>
                        <p className="text-xs text-[#141414] leading-relaxed whitespace-pre-line bg-[#E4E3E0]/30 p-3 border border-black/10">
                          {chunk.text}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
