import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    const prompt = `
You are a math tutor helping a parent.

The following text is extracted using OCR and may contain errors such as:
- wrong characters (e.g., ? instead of /)
- misspelled words
- broken equations
- missing symbols
- references to diagrams

Text:
Given these OCR-extracted questions:
${text}

Do the following:

1. Clean and rewrite the questions properly
2. Group them by topic
3. For each topic:
   - List minimal concepts required
   - Give short, simple study notes
   - Generate 3 similar practice questions
4. Provide answers separately

Keep explanations simple and suitable for school students.
`;

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: prompt,
    });

    return NextResponse.json({
      output: response.output_text,
    });
  } catch (error) {
    console.error("Analyze error:", error);

    return NextResponse.json(
      { error: "Failed to analyze text" },
      { status: 500 }
    );
  }
}
