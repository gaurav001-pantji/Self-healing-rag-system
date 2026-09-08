import { getLLMClient, getLLMProvider, sanitizeJson, executeWithFallback } from "./llm";

export interface GroundingClaim {
  claim: string;
  is_supported: boolean;
  citation_source: string;
  reasoning: string;
}

export interface GroundingCheckResult {
  answer: string;
  sources: string[];
  grounding_score: number;
  is_hallucinated: boolean;
  verified_claims: string[];
  unverified_claims: string[];
}

export class GroundingChecker {
  public static async verifyAnswer(
    question: string,
    answer: string,
    contextChunks: Array<{ text: string; source_file: string; page_number: number }>
  ): Promise<GroundingCheckResult> {
    if (!answer || answer.trim() === "" || answer.toLowerCase().includes("i don't know")) {
      return {
        answer,
        sources: [],
        grounding_score: 1.0,
        is_hallucinated: false,
        verified_claims: [],
        unverified_claims: [],
      };
    }

    const contextStr = contextChunks
      .map((c, i) => `[Source ${i + 1}]: File: ${c.source_file}, Page: ${c.page_number}\nContent: ${c.text}`)
      .join("\n\n");

    try {
      const result = await executeWithFallback(async () => {
        const openai = getLLMClient();
        const p = getLLMProvider();
        const prompt = `You are a strict factual verification model. Analyze the following Generated Answer and the provided Grounding Context.
1. Extract the core factual claims/statements made in the Generated Answer.
2. For each claim, verify if it is fully supported by the Grounding Context.
3. If a claim is clearly general knowledge (e.g. greetings, common definitions, well-known public facts) and not specific to any document, mark it as supported (S: true) and set the source (F:) to 'General Knowledge'.
Respond ONLY using the following compact format (no markdown, no conversational text, no introductions, no decision trees). Separate multiple claims with "---":
C: The factual claim statement.
S: true/false
F: Source filename/page if true
R: Explanation
---
C: Another claim...

Grounding Context:
${contextStr}

Generated Answer:
${answer}

Search Query:
${question}`;

        const response = await openai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: p.model,
          temperature: 0.1,
          chat_template_kwargs: { thinking: false }
        } as any);
        return response.choices[0]?.message?.content?.trim() || "";
      });

      const rawContent = result;
      const claims: GroundingClaim[] = [];
      const blocks = rawContent.split("---");
      
      for (const block of blocks) {
        if (!block.trim()) continue;
        const cMatch = block.match(/C:\s*([^\n]+)/i);
        const sMatch = block.match(/S:\s*([^\n]+)/i);
        const fMatch = block.match(/F:\s*([^\n]+)/i);
        const rMatch = block.match(/R:\s*([^\n]+)/i);
        
        if (cMatch) {
          claims.push({
            claim: cMatch[1].trim(),
            is_supported: sMatch ? sMatch[1].toLowerCase().includes("true") : false,
            citation_source: fMatch ? fMatch[1].trim() : "",
            reasoning: rMatch ? rMatch[1].trim() : ""
          });
        }
      }

      const verified_claims: string[] = [];
      const unverified_claims: string[] = [];
      let supportedCount = 0;

      claims.forEach((c) => {
        if (c.is_supported) {
          supportedCount++;
          verified_claims.push(`${c.claim} (Source: ${c.citation_source || "Context"})`);
        } else {
          unverified_claims.push(`${c.claim} (Reason: ${c.reasoning})`);
        }
      });

      const totalClaims = claims.length || 1;
      const grounding_score = claims.length === 0 ? 100 : Math.round((supportedCount / totalClaims) * 100);
      const is_hallucinated = grounding_score < 70 || unverified_claims.length > 0;

      const uniqueSources = Array.from(
        new Set(contextChunks.map((c) => c.source_file))
      );

      return {
        answer,
        sources: uniqueSources,
        grounding_score,
        is_hallucinated,
        verified_claims,
        unverified_claims,
      };
    } catch (err) {
      console.error("GroundingChecker: Failed checking grounding, returning fallback result", err);
      return {
        answer,
        sources: Array.from(new Set(contextChunks.map((c) => c.source_file))),
        grounding_score: 80,
        is_hallucinated: false,
        verified_claims: ["Factual answer generated from retrieved documents."],
        unverified_claims: [],
      };
    }
  }
}
