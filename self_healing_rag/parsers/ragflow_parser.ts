import mammoth from "mammoth";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import JSZip from "jszip";
import { RawParsedDocument } from "./chunker";

let pdfjsMod: any = null;
async function getPdfDocument() {
  if (!pdfjsMod) {
    pdfjsMod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const curDir = path.dirname(fileURLToPath(import.meta.url));
    const workerPath = path.resolve(curDir, "..", "..", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    pdfjsMod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  }
  return pdfjsMod;
}

export class DocumentParser {
  public static async parseFile(
    filename: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<RawParsedDocument> {
    const ext = filename.split(".").pop()?.toLowerCase();
    let text = "";
    const pages: Array<{ page_number: number; text: string }> = [];

    try {
      if (ext === "pdf" || mimeType === "application/pdf") {
        const pdfjs = await getPdfDocument();
        const uint8 = new Uint8Array(buffer);
        const data = await pdfjs.getDocument({ data: uint8 }).promise;
        const pageTexts: string[] = [];
        for (let i = 1; i <= data.numPages; i++) {
          const page = await data.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(" ");
          pageTexts.push(pageText.trim());
          pages.push({ page_number: i, text: pageText.trim() });
        }
        text = pageTexts.join("\n\n");
        
        if (!text || text.trim().length < 20) {
          text = buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").trim();
          if (text.length > 20) {
            pages.length = 0;
            pages.push({ page_number: 1, text });
          } else {
            throw new Error("PDF text extraction returned empty or garbled content.");
          }
        }
      } else if (
        ext === "docx" ||
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        pages.push({ page_number: 1, text });
      } else if (ext === "pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
        const zip = await JSZip.loadAsync(buffer);
        const slideFiles = Object.keys(zip.files)
          .filter(name => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
          .sort();
        const slideTexts: string[] = [];
        for (const slideFile of slideFiles) {
          const slideNum = parseInt(slideFile.match(/slide(\d+)/)?.[1] || "0", 10);
          const xmlContent = await zip.files[slideFile].async("string");
          const texts: string[] = [];
          const regex = /<a:t[^>]*>([^<]+)<\/a:t>/g;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(xmlContent)) !== null) {
            texts.push(match[1]);
          }
          const slideText = texts.join(" ");
          if (slideText.trim()) {
            slideTexts.push(slideText.trim());
            pages.push({ page_number: slideNum, text: slideText.trim() });
          }
        }
        text = slideTexts.join("\n\n");
      } else if (ext === "html" || ext === "htm" || mimeType === "text/html") {
        const htmlStr = buffer.toString("utf-8");
        text = htmlStr.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
                     .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
                     .replace(/<[^>]+>/g, " ")
                     .replace(/\s+/g, " ");
        pages.push({ page_number: 1, text });
      } else {
        text = buffer.toString("utf-8");
        pages.push({ page_number: 1, text });
      }
    } catch (err: any) {
      console.error(`DocumentParser: Failed parsing ${filename}. Retrying with raw text fallback. Error:`, err);
      text = buffer.toString("utf-8");
      pages.length = 0;
      pages.push({ page_number: 1, text });
    }

    if (!text || text.trim() === "") {
      throw new Error(`Failed to extract any text from ${filename}. Document may be empty or secured.`);
    }

    const sections: Array<{ section_title: string; text: string; page_number: number }> = [];
    const lines = text.split("\n");
    let currentSectionTitle = "General Context";
    let currentSectionText: string[] = [];
    let currentSectionPage = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isHeader = 
        /^#+\s+(.+)$/.test(line) || 
        /^(Section|Chapter|Part)\s+\d+/i.test(line) ||
        (line.length > 5 && line.length < 100 && /^[A-Z0-9\s,\.:\-]+$/.test(line) && lines[i - 1]?.trim() === "" && lines[i + 1]?.trim() === "");

      if (isHeader) {
        if (currentSectionText.length > 0) {
          sections.push({
            section_title: currentSectionTitle,
            text: currentSectionText.join("\n"),
            page_number: currentSectionPage
          });
        }
        
        currentSectionTitle = line.replace(/^#+\s+/, "");
        currentSectionText = [];
        const totalCharsSoFar = lines.slice(0, i).join("\n").length;
        currentSectionPage = Math.floor(totalCharsSoFar / 2000) + 1;
      } else {
        currentSectionText.push(line);
      }
    }

    if (currentSectionText.length > 0) {
      sections.push({
        section_title: currentSectionTitle,
        text: currentSectionText.join("\n"),
        page_number: currentSectionPage
      });
    } else if (sections.length === 0) {
      sections.push({
        section_title: "Introduction",
        text: text,
        page_number: 1
      });
    }

    return {
      text,
      source_file: filename,
      pages,
      sections
    };
  }
}
