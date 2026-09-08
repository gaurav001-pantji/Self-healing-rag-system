import React from "react";
import { Database, ShieldAlert, Cpu, Activity, Info } from "lucide-react";
import { SystemMetrics, HealthStatus } from "../types";

interface MetricsDashboardProps {
  metrics: SystemMetrics | null;
  health: HealthStatus | null;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ metrics, health }) => {
  const formatPercentage = (val: number) => {
    return `${(val * 100).toFixed(0)}%`;
  };

  const getStatusBadge = (status: string | undefined) => {
    const isOk = status === "connected" || status === "ready" || status === "healthy";
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 border-2 rounded-none text-[10px] font-mono font-extrabold uppercase ${
        isOk 
          ? "bg-green-100 text-green-950 border-green-700" 
          : "bg-red-100 text-red-950 border-red-600"
      }`}>
        <span className={`h-2 w-2 ${isOk ? "bg-green-700" : "bg-red-600"}`}></span>
        {status?.toUpperCase() || "OFFLINE"}
      </span>
    );
  };

  const renderConfidenceChart = () => {
    if (!metrics || !metrics.confidence_history || metrics.confidence_history.length === 0) {
      return (
        <div className="h-44 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-black bg-white font-mono">
          <Info className="h-6 w-6 text-black mb-1" />
          <p className="text-xs font-bold uppercase">// No query history available</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Submit queries to populate operational analytics.</p>
        </div>
      );
    }

    const history = metrics.confidence_history.slice(-15);
    const chartHeight = 160;
    const chartWidth = 500;
    const paddingLeft = 35;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 20;

    const graphHeight = chartHeight - paddingTop - paddingBottom;
    const graphWidth = chartWidth - paddingLeft - paddingRight;

    const barWidth = Math.max(10, Math.floor(graphWidth / history.length) - 8);
    const spacing = Math.floor((graphWidth - barWidth * history.length) / (history.length + 1));

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1.0].map((val, idx) => {
            const y = paddingTop + graphHeight * (1 - val);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#141414"
                  strokeWidth="1"
                  strokeOpacity="0.1"
                  strokeDasharray="2 2"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-black text-[9px] font-extrabold font-mono"
                >
                  {(val * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {history.map((log, index) => {
            const x = paddingLeft + spacing + index * (barWidth + spacing);
            const valHeight = graphHeight * log.confidence;
            const y = paddingTop + graphHeight - valHeight;

            let barColor = "#141414";
            if (log.strategy === "reformulated") barColor = "#ea580c";
            if (log.strategy === "hybrid") barColor = "#2563eb";

            return (
              <g key={log.id} className="group cursor-pointer">
                <rect
                  x={x - 2}
                  y={paddingTop}
                  width={barWidth + 4}
                  height={graphHeight}
                  fill="transparent"
                  className="hover:fill-black/5 transition-colors"
                />
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={valHeight}
                  fill={barColor}
                  className="transition-all duration-300 stroke-black stroke-1"
                />
                <title>{`Query: "${log.query}"\nStrategy: ${log.strategy}\nConfidence: ${(log.confidence * 100).toFixed(0)}%`}</title>
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - 4}
                  textAnchor="middle"
                  className="fill-black text-[8px] font-mono font-extrabold"
                >
                  Q{index + 1}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex justify-center flex-wrap items-center gap-4 text-[10px] font-mono font-black uppercase pt-3 border-t border-black/10 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 border border-black bg-[#141414]"></span>
            <span>Direct (High Conf)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 border border-black bg-orange-600"></span>
            <span>Reformulated (Healed)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 border border-black bg-blue-600"></span>
            <span>Hybrid Fallback (Ranked)</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white border-2 border-black rounded-none space-y-1 font-mono">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Indexed Documents</p>
          <p className="text-3xl font-black text-black">{metrics?.documents_indexed ?? 0}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Total Ingested Files</p>
        </div>

        <div className="p-4 bg-white border-2 border-black rounded-none space-y-1 font-mono">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Vector Chunk Slots</p>
          <p className="text-3xl font-black text-black">{metrics?.total_chunks ?? 0}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Semantic Partitions</p>
        </div>

        <div className="p-4 bg-white border-2 border-black rounded-none space-y-1 font-mono">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Queries Handled</p>
          <p className="text-3xl font-black text-black">{metrics?.queries_handled ?? 0}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Engine Runs Processed</p>
        </div>

        <div className="p-4 bg-white border-2 border-black rounded-none space-y-1 font-mono">
          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Avg Confidence</p>
          <p className="text-3xl font-black text-black">{metrics ? formatPercentage(metrics.avg_confidence) : "0%"}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Retrieval Precision</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border-2 border-black rounded-none p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-extrabold text-black text-xs flex items-center gap-1.5 uppercase font-mono tracking-tight">
              <Activity className="h-4 w-4 text-black" />
              Retrieval Confidence History (Last 15)
            </h4>
            {metrics && metrics.self_heals_triggered > 0 && (
              <span className="text-[9px] font-mono font-bold bg-amber-100 border border-amber-600 text-amber-950 px-2.5 py-0.5">
                ⚠ {metrics.self_heals_triggered} HEALS_TRIGGERED
              </span>
            )}
          </div>
          <div className="pt-2">{renderConfidenceChart()}</div>
        </div>

        <div className="bg-white border-2 border-black rounded-none p-5 space-y-4 flex flex-col justify-between">
          <div>
            <h4 className="font-extrabold text-black text-xs flex items-center gap-1.5 pb-3 border-b-2 border-black uppercase font-mono tracking-tight">
              <Cpu className="h-4 w-4 text-black" />
              Engine Health & Orchestration
            </h4>
            <div className="divide-y divide-black/10 text-xs font-mono">
              <div className="py-2.5 flex justify-between items-center flex-wrap gap-2">
                <span className="text-slate-600 font-bold uppercase text-[10px]">Vector Memory DB (Qdrant):</span>
                {getStatusBadge(health?.vector_db.status)}
              </div>
              <div className="py-2.5 flex justify-between items-center flex-wrap gap-2">
                <span className="text-slate-600 font-bold uppercase text-[10px]">Embedding Model API:</span>
                {getStatusBadge(health?.embedding_model.status)}
              </div>
              <div className="py-2.5 flex justify-between items-center flex-wrap gap-2">
                <span className="text-slate-600 font-bold uppercase text-[10px]">LLM Reasoning API:</span>
                {getStatusBadge(health?.llm.status)}
              </div>
              <div className="py-2.5 flex justify-between items-center flex-wrap gap-2">
                <span className="text-slate-600 font-bold uppercase text-[10px]">Auto-Query Reformulation:</span>
                <span className="inline-flex items-center px-2 py-0.5 border border-black text-[10px] font-bold bg-green-100 text-green-950 uppercase font-mono">
                  ACTIVE
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-[#E4E3E0] border border-black text-[9px] leading-relaxed text-[#141414] space-y-1 font-mono">
            <p className="font-black uppercase">DATABASE_COLLECTION_SCHEMA:</p>
            <p>Collection: "documents" (Dimension: 768)</p>
            <p>Payload: text, source_file, page_number, section_title, chunk_index, doc_id</p>
          </div>
        </div>
      </div>
    </div>
  );
};
