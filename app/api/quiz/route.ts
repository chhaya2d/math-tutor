import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function normalizeDifficulty(value: unknown): "easy" | "medium" | "hard" {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (VALID_DIFFICULTIES.has(normalized)) {
    return normalized as "easy" | "medium" | "hard";
  }
  if (normalized === "basic") return "easy";
  if (normalized === "advanced") return "hard";
  return "medium";
}

function sanitizeOptionArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((opt) => String(opt || "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

const ALLOWED_SUBJECTS = ["English", "Maths", "Science"] as const;

function normalizeQuizInput(subject: unknown, classLevel: unknown) {
  const sub =
    typeof subject === "string" &&
    (ALLOWED_SUBJECTS as readonly string[]).includes(subject)
      ? subject
      : "Maths";
  const clsRaw =
    typeof classLevel === "string"
      ? parseInt(classLevel, 10)
      : Number(classLevel);
  const cls =
    Number.isFinite(clsRaw) &&
    clsRaw >= 1 &&
    clsRaw <= 8 &&
    Math.floor(clsRaw) === clsRaw
      ? Math.floor(clsRaw)
      : 5;
  const roleHints: Record<(typeof ALLOWED_SUBJECTS)[number], string> = {
    Maths:
      "You are generating multiple-choice maths questions suited to Indian school curricula for the given grade.",
    Science:
      "You are generating multiple-choice science questions (general science / EVS tone as fits the grade); keep language age-appropriate.",
    English:
      "You are generating multiple-choice English questions (grammar, vocabulary, comprehension style as suits the OCR source); keep language age-appropriate.",
  };
  return {
    subject: sub,
    classLevel: cls,
    roleHint: roleHints[sub as (typeof ALLOWED_SUBJECTS)[number]],
  };
}

export async function POST(req: Request) {
  const body = await req.json();
  const { rawText, analyzedText, subject, classLevel } = body;

  const { subject: normalizedSubject, classLevel: normalizedClass, roleHint } =
    normalizeQuizInput(subject, classLevel);

  const prompt = `
${roleHint}

Target SUBJECT for every question theme: ${normalizedSubject}
Target GRADE / CLASS LEVEL: ${normalizedClass} — pitch vocabulary and difficulty for this grade.

The following inputs are from a student's question paper.

RAW OCR TEXT (may have errors):
${rawText}

ANALYZED CONTENT (cleaned and structured):
${analyzedText}

Instructions:

1. Use analyzed content only to detect topics and curriculum coverage
2. Use OCR text to preserve question style, wording pattern, and difficulty feel
3. Generate a QUESTION BANK aligned with subject "${normalizedSubject}" and appropriate for class ${normalizedClass}

Question bank rules:
- Generate exactly 72 questions
- Use 3-6 major categories inferred from the input
- Keep categories as balanced as possible (difference <= 1)
- For each category, keep difficulty balanced (easy/medium/hard as even as possible)
- Use marks by difficulty:
  - easy: 1 mark
  - medium: 2 marks
  - hard: 3 marks

Include:
- similar style questions
- same concepts
- same difficulty level
- preserve original exam tone and phrasing pattern
- avoid over-cleaning language; keep questions concise like real test papers
- avoid adding story-like tutoring wording unless source text has it

Use simple visuals like:
❤️ 🔺 🔵 ⭐ 🟩 🟨

Each question must include:
- questionId (short unique id string)
- question
- 4 options
- correct answer
- marks
- category (topic label like Algebra, Geometry, Arithmetic, Number System, etc.)
- difficulty (easy | medium | hard)

Return ONLY JSON array.
Do NOT use markdown.
`;

  const res = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });
  console.log("llm_quiz_raw_output", res.output_text);

  let parsed: any = [];
  try {
    parsed = JSON.parse(res.output_text);
  } catch {
    return NextResponse.json(
      { error: "Quiz generation failed: model returned invalid JSON." },
      { status: 500 }
    );
  }

  if (!Array.isArray(parsed)) {
    parsed = [];
  }
  console.log("llm_quiz_parsed_payload", parsed);

  const cleaned = parsed
    .map((q: any, index: number) => {
      const difficulty = normalizeDifficulty(q?.difficulty);
      const options = sanitizeOptionArray(q?.options);
      const answer = String(q?.answer || q?.correctAnswer || "").trim();
      const category = String(q?.category || q?.topic || "General").trim();
      const marksByDifficulty = {
        easy: 1,
        medium: 2,
        hard: 3,
      } as const;

      return {
        questionId: String(q?.questionId || `q_${index + 1}`),
        question: String(q?.question || "").trim(),
        options,
        answer,
        marks: marksByDifficulty[difficulty],
        category: category || "General",
        difficulty,
      };
    })
    .filter((q: any) => q.question && q.options.length === 4 && q.answer);
  console.log(
    "llm_quiz_questions_only",
    cleaned.map((q: any, idx: number) => ({
      index: idx + 1,
      questionId: q.questionId,
      category: q.category,
      difficulty: q.difficulty,
      question: q.question,
    }))
  );

  const byCategory = new Map<string, any[]>();
  for (const q of cleaned) {
    const key = q.category;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(q);
  }

  const categoryNames = [...byCategory.keys()];
  const checks: Array<{
    check: string;
    pass: boolean;
    detail: string;
  }> = [];

  checks.push({
    check: "minimum_category_count",
    pass: categoryNames.length >= 2,
    detail: `Found ${categoryNames.length} categories`,
  });

  for (const category of categoryNames) {
    const items = byCategory.get(category)!;
    const diffCounts = {
      easy: items.filter((x) => x.difficulty === "easy").length,
      medium: items.filter((x) => x.difficulty === "medium").length,
      hard: items.filter((x) => x.difficulty === "hard").length,
    };

    const pass =
      diffCounts.easy >= 4 &&
      diffCounts.medium >= 4 &&
      diffCounts.hard >= 4;
    checks.push({
      check: `difficulty_coverage_${category}`,
      pass,
      detail: `easy=${diffCounts.easy}, medium=${diffCounts.medium}, hard=${diffCounts.hard}`,
    });
  }

  const counts = categoryNames.map((name) => byCategory.get(name)!.length);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  checks.push({
    check: "category_balance",
    pass: categoryNames.length > 0 ? maxCount - minCount <= 3 : false,
    detail:
      categoryNames.length > 0
        ? `min=${minCount}, max=${maxCount}, diff=${maxCount - minCount}`
        : "No categories available after cleaning",
  });

  const failedChecks = checks.filter((c) => !c.pass);
  console.log("quiz_generation_checks", {
    totalQuestionsRaw: Array.isArray(parsed) ? parsed.length : 0,
    totalQuestionsCleaned: cleaned.length,
    checks,
    failedCount: failedChecks.length,
  });

  return NextResponse.json({
    data: cleaned,
    validation: {
      checks,
      failedCount: failedChecks.length,
      passed: failedChecks.length === 0,
    },
  });
}
