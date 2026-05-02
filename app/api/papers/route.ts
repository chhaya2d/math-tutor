import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";

const ALLOWED_SUBJECTS = ["English", "Maths", "Science"] as const;

export async function POST(req: Request) {
  const body = await req.json();
  const {
    questions,
    ocrText,
    analysis,
    userId,
    subject,
    classLevel,
  }: {
    questions?: unknown;
    ocrText?: string;
    analysis?: string;
    userId?: string;
    subject?: string;
    classLevel?: number | string;
  } = body;

  const rawClass =
    typeof classLevel === "string" ? parseInt(classLevel, 10) : Number(classLevel);
  const normalizedSubject =
    typeof subject === "string" && ALLOWED_SUBJECTS.includes(subject as never)
      ? subject
      : "Maths";
  const normalizedClass =
    Number.isFinite(rawClass) &&
    rawClass >= 1 &&
    rawClass <= 8 &&
    Math.floor(rawClass) === rawClass
      ? Math.floor(rawClass)
      : 5;

  const safeQuestions = Array.isArray(questions) ? questions : [];
  const checks: Array<{ check: string; pass: boolean; detail: string }> = [];

  checks.push({
    check: "minimum_question_count_for_adaptive",
    pass: safeQuestions.length >= 35,
    detail: `Found ${safeQuestions.length} questions (expected >= 35)`,
  });

  const topicSummary: Record<
    string,
    { total: number; easy: number; medium: number; hard: number }
  > = {}; 

  for (const q of safeQuestions) {
    const topic = String(q?.category || q?.topic || "General").trim() || "General";
    const difficulty = String(q?.difficulty || "medium").toLowerCase();
    if (!topicSummary[topic]) {
      topicSummary[topic] = { total: 0, easy: 0, medium: 0, hard: 0 };
    }
    topicSummary[topic].total += 1;
    if (difficulty === "easy") topicSummary[topic].easy += 1;
    else if (difficulty === "hard") topicSummary[topic].hard += 1;
    else topicSummary[topic].medium += 1;
  }

  checks.push({
    check: "topic_count",
    pass: Object.keys(topicSummary).length >= 2,
    detail: `Found ${Object.keys(topicSummary).length} topics`,
  });

  checks.push({
    check: "subject_valid",
    pass:
      subject === undefined ||
      subject === null ||
      (typeof subject === "string" &&
        (ALLOWED_SUBJECTS as readonly string[]).includes(subject)),
    detail: subject
      ? `subject="${subject}", stored="${normalizedSubject}"`
      : `subject omitted; stored as "${normalizedSubject}"`,
  });

  checks.push({
    check: "class_level_valid",
    pass:
      Number.isFinite(rawClass) &&
      rawClass >= 1 &&
      rawClass <= 8 &&
      Math.floor(rawClass) === rawClass,
    detail: rawClass !== undefined && !Number.isNaN(rawClass as number)
      ? `classLevel=${normalizedClass}`
      : `classLevel omitted; stored as ${normalizedClass}`,
  });

  const db = await getDb();

  const result = await db.collection("papers").insertOne({
    questions: safeQuestions,
    ocrText,
    analysis,
    topics: topicSummary,
    subject: normalizedSubject,
    classLevel: normalizedClass,
    createdBy: userId,
    createdAt: new Date(),
  });

  console.log("paper_save_checks", {
    paperId: result.insertedId.toString(),
    checks,
    topics: topicSummary,
  });

  return NextResponse.json({
    paperId: result.insertedId,
    topics: topicSummary,
    validation: {
      checks,
      failedCount: checks.filter((c) => !c.pass).length,
      passed: checks.every((c) => c.pass),
    },
  });
}
