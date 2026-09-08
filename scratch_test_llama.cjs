const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: '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', baseURL: 'https://integrate.api.nvidia.com/v1' });
async function test() {
  console.log('starting');
  try {
    const res = await openai.chat.completions.create({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: `You are a strict factual verification model. Analyze the following Generated Answer and the provided Grounding Context.
1. Extract the core factual claims/statements made in the Generated Answer.
2. For each claim, verify if it is fully supported by the Grounding Context.
3. If a claim is clearly general knowledge (e.g. greetings, common definitions, well-known public facts) and not specific to any document, mark it as supported (S: true) and set the source (F:) to 'General Knowledge'.

Respond ONLY using the following compact format (no markdown, no conversational text, no introductions, no decision trees). Separate multiple claims with "---":
C: The factual claim statement.
S: true/false
F: Source filename/page if true
R: Explanation
---

Grounding Context:
Empty

Generated Answer:
Hello there! How can I help you?

Search Query:
hi` }]
    });
    console.log("RESULT:");
    console.log(res.choices[0].message.content);
  } catch (err) {
    console.error("ERROR:");
    console.error(err);
  }
}
test();
