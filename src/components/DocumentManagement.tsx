import React, { useState, useRef } from "react";
import { Upload, Trash2, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { DocumentMetadata } from "../types";

interface DocumentManagementProps {
  documents: DocumentMetadata[];
  onRefresh: () => void;
  onLogAdd: (msg: string, type: "info" | "success" | "error") => void;
}

export const DocumentManagement: React.FC<DocumentManagementProps> = ({
  documents,
  onRefresh,
  onLogAdd,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    const allowedExtensions = ["pdf", "docx", "pptx", "txt", "md", "html"];
    const fileExt = file.name.split(".").pop()?.toLowerCase();

    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      onLogAdd(`Unsupported file format: ${file.name}. Standard documents only.`, "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress("Parsing structure & generating embeddings...");
    onLogAdd(`Uploading and parsing ${file.name}...`, "info");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process document.");
      }

      onLogAdd(`Successfully parsed & indexed ${file.name} into ${data.chunks} semantic chunks.`, "success");
      onRefresh();
    } catch (err: any) {
      console.error(err);
      onLogAdd(`Failed to ingest ${file.name}: ${err.message}`, "error");
    } finally {
      setIsUploading(false);
      setUploadProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteDocument = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This will remove all its vector embeddings.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete document");
      }

      onLogAdd(`Deleted document ${name} and purged all associated vector slots.`, "success");
      onRefresh();
    } catch (err: any) {
      onLogAdd(`Deletion failed: ${err.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      <div
        id="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 rounded-none ${
          isDragging
            ? "border-black bg-[#DCDAD7]"
            : "border-black bg-white hover:bg-[#F0F0F0]"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.docx,.pptx,.txt,.md,.html"
        />
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="p-3 bg-black text-[#E4E3E0] border border-black">
            {isUploading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <Upload className="h-8 w-8" />
            )}
          </div>
          {isUploading ? (
            <div className="space-y-1 font-mono">
              <p className="font-extrabold uppercase text-xs">Indexing Document...</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase">{uploadProgress}</p>
            </div>
          ) : (
            <div className="space-y-1 font-mono">
              <p className="font-extrabold uppercase text-xs text-black">
                <span className="underline decoration-2">CLICK_TO_UPLOAD</span> OR_DRAG_HERE
              </p>
              <p className="text-[10px] text-slate-500 uppercase font-bold">PDF, DOCX, PPTX, TXT, MD, HTML (MAX_10MB)</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border-2 border-black rounded-none overflow-hidden">
        <div className="p-3 border-b-2 border-black bg-[#F0F0F0] flex justify-between items-center">
          <h3 className="font-extrabold text-black flex items-center gap-2 text-xs uppercase font-mono tracking-tight">
            <FileText className="h-4 w-4 text-black" />
            Ingested Documents Pool ({documents.length})
          </h3>
        </div>

        {documents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center space-y-2 font-mono">
            <AlertCircle className="h-8 w-8 text-black" />
            <p className="text-xs font-bold uppercase">// Document Pool is empty</p>
            <p className="text-[10px] max-w-xs text-slate-400 font-bold uppercase">Upload structured materials to formulate deep response context.</p>
          </div>
        ) : (
          <div className="divide-y-2 divide-black/10 overflow-y-auto max-h-[300px]">
            {documents.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-[#F0F0F0]/50 transition-colors">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="p-2 bg-black text-[#E4E3E0] border border-black flex-shrink-0">
                    <FileText className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0 font-mono">
                    <p className="text-xs font-bold text-black truncate">{doc.name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-bold uppercase">
                      <span>{formatSize(doc.size)}</span>
                      <span>•</span>
                      <span className="text-emerald-700 font-extrabold">{doc.chunksCount} CHUNKS</span>
                      <span>•</span>
                      <span>{new Date(doc.uploadTime).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
                <button
                  id={`delete-btn-${doc.id}`}
                  onClick={() => deleteDocument(doc.id, doc.name)}
                  className="p-2 text-black hover:text-[#E4E3E0] hover:bg-black rounded-none border border-transparent hover:border-black transition-all shrink-0"
                  title="Purge Vector Embeddings"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
