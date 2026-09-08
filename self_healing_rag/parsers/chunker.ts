import { config } from "../config";

export interface RawParsedDocument {
  text: string;
  source_file: string;
  pages: Array<{ page_number: number; text: string }>;
  sections: Array<{ section_title: string; text: string; page_number: number }>;
}

export interface Chunk {
  text: string;
  page_number: number;
  section_title: string;
  chunk_index: number;
}

export class SemanticChunker {
  public static chunkDocument(doc: RawParsedDocument): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;
    const chunkSize = config.CHUNK_SIZE;
    const chunkOverlap = config.CHUNK_OVERLAP;

    const sourceUnits = doc.sections.length > 0 
      ? doc.sections.map(s => ({ text: s.text, section_title: s.section_title, page_number: s.page_number }))
      : doc.pages.map(p => ({ text: p.text, section_title: "General Context", page_number: p.page_number }));

    for (const unit of sourceUnits) {
      const text = unit.text;
      const paragraphs = text.split(/\n\s*\n+/);

      let currentChunkText = "";
      
      for (const para of paragraphs) {
        if (para.length > chunkSize) {
          const sentences = para.match(/[^.!?]+[.!?]+(\s|$)/g) || [para];
          for (const sentence of sentences) {
            if ((currentChunkText + sentence).length > chunkSize && currentChunkText.length > 0) {
              chunks.push({
                text: currentChunkText.trim(),
                page_number: unit.page_number,
                section_title: unit.section_title,
                chunk_index: chunkIndex++
              });
              currentChunkText = currentChunkText.slice(-chunkOverlap) + " " + sentence;
            } else {
              currentChunkText += (currentChunkText.length > 0 ? " " : "") + sentence;
            }
          }
        } else {
          if ((currentChunkText + para).length > chunkSize && currentChunkText.length > 0) {
            chunks.push({
              text: currentChunkText.trim(),
              page_number: unit.page_number,
              section_title: unit.section_title,
              chunk_index: chunkIndex++
            });
            currentChunkText = currentChunkText.slice(-chunkOverlap) + "\n" + para;
          } else {
            currentChunkText += (currentChunkText.length > 0 ? "\n\n" : "") + para;
          }
        }
      }

      if (currentChunkText.trim().length > 0) {
        chunks.push({
          text: currentChunkText.trim(),
          page_number: unit.page_number,
          section_title: unit.section_title,
          chunk_index: chunkIndex++
        });
      }
    }

    return chunks;
  }
}
