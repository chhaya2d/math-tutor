import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { question, options, category, difficulty } = await req.json();

    if (!question || !Array.isArray(options) || options.length === 0) {
      return NextResponse.json(
        { error: "Missing question or options for hint generation." },
        { status: 400 }
      );
    }

    const prompt = `
You are a math tutor giving a hint for an MCQ.

Rules:
- Do not reveal the final answer directly.
- Keep it concise (2-4 lines).
- Give one conceptual clue and one practical next step.
- Keep the language simple for school students.

Category: ${category || "General"}
Difficulty: ${difficulty || "medium"}
Question: ${question}
Options: ${options.join(" | ")}
`;

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: prompt,
    });

    return NextResponse.json({
      hint: response.output_text || "Try solving the question step by step.",
    });
  } catch (error) {
    console.error("hint route error:", error);
    return NextResponse.json(
      { error: "Failed to generate hint." },
      { status: 500 }
    );
  }
}
