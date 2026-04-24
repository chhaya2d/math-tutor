import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const { text } = await req.json();

  const prompt = `
You are a math tutor.

Given these questions:
${text}

1. Classify by topic
2. Provide minimal syllabus
3. Give short study notes
4. Generate 3 practice questions per topic
`;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  return NextResponse.json({
    output: response.output_text,
  });
}
