import React, { useEffect, useRef } from "react";
import { Terminal, Trash2 } from "lucide-react";
import { SystemLog } from "../types";

interface SystemLogsProps {
  logs: SystemLog[];
  onClear: () => void;
}

export const SystemLogs: React.FC<SystemLogsProps> = ({ logs, onClear }) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getLogColor = (strategy: string) => {
    switch (strategy) {
      case "direct":
        return "text-green-400";
      case "reformulated":
        return "text-orange-400";
      case "hybrid":
        return "text-blue-400";
      default:
        return "text-slate-300";
    }
  };

  return (
    <div className="bg-black border-2 border-black rounded-none flex flex-col h-[400px] overflow-hidden">
      <div className="bg-[#F0F0F0] px-4 py-2.5 flex items-center justify-between border-b-2 border-black">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1">
            <span className="h-2 w-2 border border-black bg-black"></span>
            <span className="h-2 w-2 border border-black bg-[#DCDAD7]"></span>
            <span className="h-2 w-2 border border-black bg-[#E4E3E0]"></span>
          </div>
          <span className="text-[10px] font-extrabold text-black tracking-wider uppercase pl-2 flex items-center gap-1.5 font-mono">
            <Terminal className="h-3.5 w-3.5 text-black" />
            Live Engine Stream
          </span>
        </div>
        <button
          id="clear-logs-btn"
          onClick={onClear}
          className="text-black hover:bg-black hover:text-[#E4E3E0] p-1 border border-transparent hover:border-black transition-colors"
          title="Clear Terminal Session"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-4 overflow-y-auto flex-grow font-mono text-[10px] leading-relaxed space-y-3 bg-black text-[#E4E3E0]">
        <div className="text-slate-500 border-b border-white/10 pb-2">
          <span>{`[SYSTEM OK] - Initializing Self-Healing RAG Engine...`}</span>
          <br />
          <span>{`[MODELS READY] - embedding: gemini-embedding-2-preview, reasoning: gemini-3.5-flash`}</span>
          <br />
          <span>{`[STANDBY] - Awaiting document ingestion or search query...`}</span>
        </div>

        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600">
            <span>// No queries logged in this session yet...</span>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div key={log.id || idx} className="space-y-1 hover:bg-white/5 p-1 transition-colors border-l-2 border-transparent hover:border-slate-700">
              <div className="flex items-start justify-between text-slate-500 gap-4 text-[9px] uppercase font-bold">
                <span>{`[${new Date(log.timestamp).toLocaleTimeString()}] QUERY RECEIVED`}</span>
                <span>SLOT #{log.id}</span>
              </div>
              <p className="text-white font-extrabold pl-2">{`> "${log.query}"`}</p>

              <div className={`pl-4 space-y-0.5 ${getLogColor(log.strategy)}`}>
                {log.strategy === "direct" && (
                  <p>{`✔ RETRIEVAL SUCCESSFUL - Confidence: ${(log.confidence * 100).toFixed(0)}% (strategy: direct)`}</p>
                )}
                {log.strategy === "reformulated" && (
                  <>
                    <p className="text-orange-400 animate-pulse">{`⚡ CONFIDENCE BELOW THRESHOLD - Triggering Self-Healing Phase 1`}</p>
                    <p className="text-slate-300">{`ℹ REFORMULATING QUERY -> "${log.reformulated_query}"`}</p>
                    <p>{`✔ RETRIEVAL SUCCESSFUL - Calibrated Confidence: ${(log.confidence * 100).toFixed(0)}% (strategy: reformulated)`}</p>
                  </>
                )}
                {log.strategy === "hybrid" && (
                  <>
                    <p className="text-orange-400 animate-pulse">{`⚡ CONFIDENCE BELOW THRESHOLD - Triggering Self-Healing Phase 1`}</p>
                    <p className="text-slate-300">{`ℹ REFORMULATING QUERY -> "${log.reformulated_query}"`}</p>
                    <p className="text-blue-400 animate-pulse">{`⚡ REFORMULATED QUERY FAIL - Triggering Self-Healing Phase 2`}</p>
                    <p className="text-slate-300">{`ℹ INITIATING HYBRID SEARCH FALLBACK (Vector Similarity + Cosine Term Matching)`}</p>
                    <p>{`✔ RETRIEVAL SUCCESSFUL - Merged & Calibrated Confidence: ${(log.confidence * 100).toFixed(0)}% (strategy: hybrid)`}</p>
                  </>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
