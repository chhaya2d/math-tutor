import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
const { rawText, analyzedText } = await req.json();

const prompt = `
You are a math tutor.

The following inputs are from a student's question paper.

RAW OCR TEXT (may have errors):
${rawText}

ANALYZED CONTENT (cleaned and structured):
${analyzedText}

Instructions:

1. Use analyzed content to understand topics and structure
2. Use OCR text to preserve question style and details
3. Generate a quiz based ONLY on these topics

Quiz rules:
- 35 questions
- First 25 basic (1 mark each)
- Last 10 advanced (2 marks each)

Include:
- similar style questions
- same concepts
- same difficulty level

Use simple visuals like:
❤️ 🔺 🔵 ⭐ 🟩 🟨

Each question must include:
- question
- 4 options
- correct answer
- marks
- topic

Return ONLY JSON array.
Do NOT use markdown.
`;

  const res = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  return NextResponse.json({
    data: JSON.parse(res.output_text),
  });
}
