import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ChevronDown, 
  Sun, 
  LogOut, 
  Paperclip, 
  Mic, 
  Send,
  Zap,
  Coins,
  Users,
  Monitor,
  CheckSquare,
  TrendingUp,
  Briefcase,
  Wrench,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Beaker,
  FileText
} from 'lucide-react';
import { MetricsDashboard } from './components/MetricsDashboard';
import { DocumentManagement } from './components/DocumentManagement';
import { DocumentMetadata, SystemMetrics, HealthStatus, QueryResponse } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './components/MermaidDiagram';


const AGENT_CATEGORIES = [
  { name: 'FINANCE', count: 1, icon: Coins, expanded: false },
  { name: 'HR & PEOPLE', count: 4, icon: Users, expanded: false },
  { name: 'IT', count: 1, icon: Monitor, expanded: false },
  { name: 'QUALITY', count: 2, icon: CheckSquare, expanded: false },
  { name: 'SALES', count: 1, icon: TrendingUp, expanded: false },
  { name: 'WMG', count: 1, icon: Briefcase, expanded: false },
  { name: 'UTILITY', count: 1, icon: Wrench, expanded: false },
];

const POPULAR_PROMPTS = [
  "Apply a Leave",
  "Regularize My Attendance",
  "My Leave Summary",
  "My Holiday Calendar",
  "Summarize Document",
  "My Asset Information",
  "My HR Business Partner",
  "My Approvals"
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: QueryResponse;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'analytics'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Thinking...');
  const [isVisualQuery, setIsVisualQuery] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDataPanel, setShowDataPanel] = useState(false);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [ragMode, setRagMode] = useState(false);
  const [summarizeMode, setSummarizeMode] = useState(false);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState("llama3-8b");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) setDocuments(await res.json());
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  };

  const fetchAllData = async () => {
    try {
      const metricsRes = await fetch("/api/metrics");
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      const healthRes = await fetch("/api/health");
      if (healthRes.ok) setHealth(await healthRes.json());
      fetchDocuments();
    } catch (err) {
      console.error("Error connecting to backend:", err);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 6000);
    
    fetch("/api/models").then(r => r.json()).then(d => {
      if (d.models) setModels(d.models);
      if (d.current) setSelectedModel(d.current);
    }).catch(() => {});

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  const GENERIC_REPLIES: Record<string, string> = {
    "Apply a Leave": "To apply for a leave, please visit the HR Portal > Leave Management > Apply Leave. Make sure to select the correct leave type and duration. Your manager will be notified for approval.",
    "Regularize My Attendance": "If you missed a punch or need to correct your attendance, go to the Attendance system and click 'Regularize'. Provide a valid reason for the missing punch.",
    "My Leave Summary": "You currently have 12 Earned Leaves (EL), 4 Sick Leaves (SL), and 2 Casual Leaves (CL) remaining for this year.",
    "My Holiday Calendar": "The next upcoming holiday is Independence Day. You can view the full holiday calendar for your location in the HR Portal.",
    "My Asset Information": "You are currently assigned: 1x MacBook Pro 16-inch, 1x Dell 27-inch Monitor, and 1x Magic Keyboard. If you need to return or request assets, please raise an IT ticket.",
    "My HR Business Partner": "Your designated HR Business Partner is Sarah Jenkins. You can reach out to her at sarah.jenkins@company.com for any HR-related queries.",
    "My Approvals": "You have 2 pending approvals in your queue: 1 Leave Request from John Doe, and 1 Expense Report from Jane Smith.",
    "Connect to FINANCE Agent": "Connecting you to the Finance Agent... How can I help you with payroll, reimbursements, or tax declarations today?",
    "Connect to HR & PEOPLE Agent": "Connecting you to the HR & People Agent... How can I assist you with HR policies or employee benefits?",
    "Connect to IT Agent": "Connecting you to the IT Agent... Do you need help with a software installation, hardware issue, or network access?",
    "Connect to QUALITY Agent": "Connecting you to the Quality Agent... Please specify the project or quality standard you are inquiring about.",
    "Connect to SALES Agent": "Connecting you to the Sales Agent... Would you like to view the latest quarterly figures or CRM updates?",
    "Connect to WMG Agent": "Connecting you to the Wealth Management Group Agent... How can I assist you with client portfolios?",
    "Connect to UTILITY Agent": "Connecting you to the Utility Agent... Please let me know what facility or utility service you need help with."
  };

  const handleSendMessage = async (text: string) => {
    let query = text.trim();
    if (!query) return;
    if (ragMode && !query.startsWith('/me')) {
      query = `/me ${query}`;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query
    };
    
    setChatHistory(prev => [...prev, userMsg]);
    setInputText('');
    setLoadingProgress(0);
    setLoadingText('Thinking...');
    
    const lowerQuery = query.toLowerCase();
    
    const visualKeywords = ['diagram', 'structure', 'pipeline', 'flowchart', 'visual'];
    const isVisual = visualKeywords.some(kw => lowerQuery.includes(kw));
    setIsVisualQuery(isVisual);
    
    setIsLoading(true);

    if (lowerQuery === "summarize document") {
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Upload a document (PDF, DOCX, PPTX, TXT, MD, HTML) using the paperclip icon below, and I will generate a structured summary for you.",
        metadata: {
          answer: "",
          sources: [], grounding_score: 1.0, is_hallucinated: false,
          verified_claims: [], unverified_claims: [],
          strategy: "direct", confidence: 1.0, chunks: []
        }
      };
      setChatHistory(prev => [...prev, assistantMsg]);
      setSummarizeMode(true);
      setIsLoading(false);
      return;
    }

    const matchedKey = Object.keys(GENERIC_REPLIES).find(k => k.toLowerCase() === lowerQuery);
    
    if (matchedKey) {
      setTimeout(() => {
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: GENERIC_REPLIES[matchedKey],
          metadata: {
            answer: GENERIC_REPLIES[matchedKey],
            sources: [],
            grounding_score: 1.0,
            is_hallucinated: false,
            verified_claims: ["Pre-configured system response"],
            unverified_claims: [],
            strategy: "direct",
            confidence: 1.0,
            chunks: []
          }
        };
        setChatHistory(prev => [...prev, assistantMsg]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, k: 5, threshold: 0.6 }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Query failed");
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (!part.trim()) continue;
            try {
              const data = JSON.parse(part);
              
              if (data.finalResult) {
                const assistantMsg: ChatMessage = {
                  id: (Date.now() + 1).toString(),
                  role: 'assistant',
                  content: data.finalResult.answer,
                  metadata: data.finalResult
                };
                setChatHistory(prev => [...prev, assistantMsg]);
                setLoadingProgress(100);
              } else if (data.error) {
                const errorMsg: ChatMessage = {
                  id: (Date.now() + 1).toString(),
                  role: 'system',
                  content: `Error: ${data.error}`
                };
                setChatHistory(prev => [...prev, errorMsg]);
                break;
              } else {
                setLoadingProgress(data.progress);
                setLoadingText(data.status);
              }
            } catch (e) {
              console.error("Parse error chunk", part);
            }
          }
        }
      }

      fetchAllData();
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Error: ${err.message}`
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    if (summarizeMode) {
      try {
        setChatHistory(prev => [...prev, {
          id: Date.now().toString(),
          role: 'system',
          content: `Summarizing "${file.name}"...`
        }]);

        const response = await fetch("/api/summarize", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Summarization failed");

        setChatHistory(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.summary,
          metadata: {
            answer: data.summary,
            sources: [], grounding_score: 1.0, is_hallucinated: false,
            verified_claims: [], unverified_claims: [],
            strategy: "direct", confidence: 1.0, chunks: []
          }
        }]);
        setSummarizeMode(false);
      } catch (err: any) {
        setChatHistory(prev => [...prev, {
          id: Date.now().toString(),
          role: 'system',
          content: `Failed to summarize: ${err.message}`
        }]);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");

      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `Successfully ingested document: ${data.file} (${data.chunks} chunks embedded)`
      }]);
      fetchAllData();
    } catch (err: any) {
      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `Failed to upload document: ${err.message}`
      }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startNewChat = () => {
    setChatHistory([]);
    setActiveTab('chat');
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#0b1021] text-white font-sans overflow-hidden selection:bg-blue-900 selection:text-white">
      
      <div className="w-[280px] h-full flex flex-col bg-[#16203a] border-r border-slate-800 shrink-0">
        
        <div className="p-5 flex flex-col gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-700 border-2 border-slate-600 shrink-0">
              <img 
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop" 
                alt="LEINA Profile" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between w-full">
                <span className="font-extrabold text-lg tracking-wide uppercase">LEINA</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-300 font-medium leading-tight">
            LTTS Engineered Intelligent Network Associate
          </div>
        </div>

        <div className="px-5 pb-5 shrink-0">
          <button 
            onClick={startNewChat}
            className="w-full bg-[#fbbc3a] hover:bg-[#eab308] text-[#3c2a05] font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <span className="text-lg">✨</span>
            New Chat
          </button>
        </div>

        <div className="px-5 pb-4 shrink-0">
          <div className="relative">
            <input 
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#202d4f] text-sm text-slate-300 rounded-lg py-2.5 pl-3 pr-10 outline-none border border-transparent focus:border-slate-500 placeholder-slate-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 custom-scrollbar min-h-0 pb-4">
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            ALL AGENTS (11)
          </div>
          
          <div className="flex flex-col gap-1">
            {AGENT_CATEGORIES.map((category) => (
              <div key={category.name} className="flex flex-col w-full">
                <button 
                  onClick={() => setExpandedCategory(expandedCategory === category.name ? null : category.name)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-slate-300 hover:bg-[#202d4f] hover:text-white rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <category.icon className="w-4 h-4 text-slate-400 group-hover:text-[#fbbc3a]" />
                    <span className="font-semibold">{category.name} ({category.count})</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-transform duration-200 ${expandedCategory === category.name ? 'rotate-180' : ''}`} />
                </button>
                
                {expandedCategory === category.name && (
                  <div className="pl-10 pr-3 py-1 flex flex-col gap-1 animate-in slide-in-from-top-2 duration-200 fade-in">
                    <button 
                      onClick={() => handleSendMessage(`Connect to ${category.name} Agent`)}
                      className="text-left text-xs text-slate-400 hover:text-white py-1.5 transition-colors border-l border-slate-700 pl-3 hover:border-[#fbbc3a]"
                    >
                      🤖 {category.name} Primary Agent
                    </button>
                    {Array.from({ length: category.count - 1 }).map((_, i) => (
                      <button 
                        key={i}
                        onClick={() => handleSendMessage(`Connect to ${category.name} Agent ${i + 2}`)}
                        className="text-left text-xs text-slate-400 hover:text-white py-1.5 transition-colors border-l border-slate-700 pl-3 hover:border-[#fbbc3a]"
                      >
                        🤖 {category.name} Sub-Agent {i + 2}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 px-3 pt-4 border-t border-[#202d4f]">
            <div className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              DATA SOURCES
            </div>
            <button
              onClick={() => { setShowDataPanel(!showDataPanel); setActiveTab('chat'); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors group ${
                showDataPanel ? 'bg-[#202d4f] text-white' : 'text-slate-300 hover:bg-[#202d4f] hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold">Add Data</span>
              <span className="ml-auto text-[10px] text-emerald-400 font-bold">{documents.length}</span>
            </button>
          </div>
        </div>

        <div className="p-4 mt-auto border-t border-[#202d4f] bg-[#121930] shrink-0">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
              S
            </div>
            <span className="text-sm font-semibold text-slate-200 truncate">Harshit Singh</span>
          </div>
        </div>

      </div>


      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        <header className="flex items-center justify-between px-6 py-4 shrink-0 bg-[#0b1021] z-10 relative">
          <div className="flex items-center gap-6">
            <div className="h-8 bg-white rounded-md flex items-center justify-center px-3 shadow-sm shrink-0 gap-2">
              <div className="w-6 h-6 rounded-full border-[2.5px] border-[#005596] flex items-center justify-center relative shrink-0">
                 <div className="text-[#005596] font-black text-[10px] italic absolute top-[2px] left-[2px] leading-none">L</div>
                 <div className="text-[#005596] font-black text-[10px] italic absolute top-[8px] right-[2px] leading-none">T</div>
              </div>
              <span className="text-[#005596] font-black italic text-[14px] tracking-tight leading-none pt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                LARSEN & TOUBRO
              </span>
            </div>
            


            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#064e3b]/20 border border-[#064e3b]/50 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-medium text-emerald-400">
                {health?.vector_db.status === "connected" ? "Available" : "Connecting..."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
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
              className="bg-[#1e293b] border border-[#334155] rounded-full text-slate-300 text-xs font-semibold px-3 py-1.5 outline-none hover:bg-[#334155] hover:text-white transition-colors appearance-none cursor-pointer"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            <button className="flex items-center gap-2 px-4 py-1.5 bg-[#1e293b] border border-[#334155] rounded-full text-slate-300 hover:bg-[#334155] hover:text-white transition-colors text-sm font-semibold">
              <Zap className="w-4 h-4 text-indigo-400" />
              Prompts
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#fbbc3a]/10 text-[#fbbc3a] hover:bg-[#fbbc3a]/20 transition-colors">
              <Sun className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e293b] text-slate-400 hover:text-white hover:bg-[#334155] transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {showDataPanel ? (
          <div className="flex-1 overflow-y-auto bg-[#E4E3E0] text-[#141414] p-6 custom-scrollbar">
            <DocumentManagement
              documents={documents}
              onRefresh={fetchDocuments}
              onLogAdd={(msg, type) => {
                setChatHistory(prev => [...prev, {
                  id: Date.now().toString(),
                  role: 'system',
                  content: msg
                }]);
              }}
            />
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="flex-1 overflow-y-auto bg-[#E4E3E0] text-[#141414] p-6 custom-scrollbar">
            <MetricsDashboard metrics={metrics} health={health} />
          </div>
        ) : (
          <>
            <main ref={chatScrollRef} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pt-4 px-6 min-h-0">
              <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 min-h-full">
                
                  {chatHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 bg-slate-700 border-2 border-slate-600 shadow-xl shadow-black/40 shrink-0">
                      <img 
                        src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop" 
                        alt="LEINA Assistant" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <h1 className="text-2xl font-bold mb-1">Good Afternoon, Harshit Singh</h1>
                    <p className="text-slate-400 text-base mb-6">What would you like to do today?</p>

                    <div className="w-full">
                      <div className="text-center mb-4">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                          POPULAR PROMPTS
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {POPULAR_PROMPTS.map((prompt, idx) => (
                          <button 
                            key={idx}
                            onClick={() => handleSendMessage(prompt)}
                            className="flex flex-col items-center justify-center p-4 bg-[#121930] hover:bg-[#1a2542] border border-[#202d4f] rounded-2xl transition-all hover:scale-105 group h-24"
                          >
                            <div className="w-4 h-4 rounded-full bg-emerald-400 mb-3 shadow-[0_0_15px_rgba(52,211,153,0.5)] group-hover:scale-110 transition-transform"></div>
                            <span className="text-xs font-semibold text-center text-slate-300 group-hover:text-white px-2">
                              {prompt}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                    <div className="flex flex-col gap-6 w-full">
                    {chatHistory.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'system' ? (
                          <div className="bg-slate-800/50 text-slate-400 px-4 py-2 rounded-xl text-xs font-mono text-center mx-auto border border-slate-700">
                            {msg.content}
                          </div>
                        ) : (
                          <div className={`max-w-[85%] rounded-2xl p-5 shadow-sm ${
                            msg.role === 'user' 
                              ? 'bg-[#1e293b] text-white rounded-br-none border border-slate-700/50' 
                              : 'bg-[#121930] text-slate-200 rounded-bl-none border border-[#202d4f]'
                          }`}>
                            <div className="leading-relaxed markdown-body">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code(props) {
                                    const { children, className, node, ...rest } = props;
                                    const match = /language-(\w+)/.exec(className || '');
                                    
                                    if (match && match[1] === 'mermaid') {
                                      return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
                                    }
                                    
                                    return (
                                      <code {...rest} className={`${className} bg-slate-800 rounded px-1 py-0.5 text-sm`}>
                                        {children}
                                      </code>
                                    );
                                  }
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                            
                            {msg.metadata && (
                              <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2 text-[10px] font-mono">
                                <span className={`px-2 py-1 rounded-md font-bold uppercase tracking-wider ${
                                  msg.metadata.strategy === 'direct' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                  msg.metadata.strategy === 'reformulated' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                  'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                }`}>
                                  {msg.metadata.strategy}
                                </span>
                                
                                {msg.metadata.grounding_score !== undefined && (
                                  <span className={`px-2 py-1 rounded-md font-bold uppercase tracking-wider ${
                                    msg.metadata.grounding_score >= 0.7 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  }`}>
                                    Grounding: {(msg.metadata.grounding_score * 100).toFixed(0)}%
                                  </span>
                                )}

                                {msg.metadata.is_hallucinated && (
                                  <span className="flex items-center gap-1 px-2 py-1 rounded-md font-bold text-red-400 bg-red-900/30 border border-red-800 animate-pulse">
                                    <AlertCircle className="w-3 h-3" /> Hallucination Detected
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {isLoading && (
                      <div className="flex justify-start w-full max-w-[85%]">
                        {isVisualQuery ? (
                          <div className="bg-[#121930] border border-[#202d4f] rounded-2xl rounded-bl-none p-5 text-slate-300 flex flex-col gap-3 w-full shadow-lg">
                            <div className="flex items-center gap-3">
                              <Loader2 className="w-5 h-5 animate-spin text-emerald-500 shrink-0" />
                              <span className="text-sm font-semibold animate-pulse">{loadingText}</span>
                              <span className="text-xs text-slate-500 ml-auto font-mono shrink-0">{loadingProgress}%</span>
                            </div>
                            
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1 relative">
                              <div 
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-300 ease-out rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                                style={{ width: `${loadingProgress}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[#121930] border border-[#202d4f] rounded-2xl rounded-bl-none p-5 text-slate-400 flex items-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                            <span className="text-sm font-semibold animate-pulse">LEINA is thinking...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="h-36 shrink-0 w-full"></div>
              </div>
            </main>

            <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#0b1021] via-[#0b1021] to-transparent shrink-0 pointer-events-none">
              <div className="max-w-4xl mx-auto pointer-events-auto">
                <div className="flex items-end gap-3 bg-[#121930] border border-[#202d4f] rounded-2xl p-2 shadow-2xl">
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload} 
                    accept=".pdf,.docx,.pptx,.txt,.md,.html"
                  />
                  
                  <button
                    onClick={() => setRagMode(!ragMode)}
                    disabled={isLoading}
                    className={`px-3 py-1.5 rounded-lg transition-all shrink-0 disabled:opacity-50 text-xs font-bold flex items-center gap-1.5 ${
                      ragMode
                        ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-indigo-400'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                    }`}
                    title="Toggle Deep Search (RAG) to search your uploaded documents"
                  >
                    <Beaker className="w-3.5 h-3.5" />
                    {ragMode ? 'Deep Search: ON' : 'Deep Search'}
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isLoading}
                    className={`p-3 rounded-xl transition-colors shrink-0 disabled:opacity-50 ${
                      summarizeMode 
                        ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/50' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                    title={summarizeMode ? "Upload document to summarize" : "Attach file"}
                  >
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : summarizeMode ? <FileText className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
                  </button>
                  {summarizeMode && (
                    <button
                      onClick={() => setSummarizeMode(false)}
                      className="p-3 text-red-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0 text-xs font-bold"
                      title="Cancel summarization"
                    >
                      Cancel
                    </button>
                  )}
                  
                  <textarea 
                    placeholder={summarizeMode ? "Upload a file to summarize..." : ragMode ? "Ask from documents (/me)..." : "Ask LEINA anything..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(inputText);
                      }
                    }}
                    disabled={isLoading}
                    className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none resize-none min-h-[48px] max-h-[120px] py-3 text-base custom-scrollbar disabled:opacity-50"
                    rows={1}
                  />
                  
                  <div className="flex items-center gap-2 shrink-0 pr-1">
                    <button className="p-3 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
                      <Mic className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleSendMessage(inputText)}
                      disabled={isLoading || !inputText.trim()}
                      className="p-3 bg-[#1e293b] hover:bg-indigo-600 text-slate-300 hover:text-white rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-[#1e293b]"
                    >
                      <Send className="w-5 h-5 ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
