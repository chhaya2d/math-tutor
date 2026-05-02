import { getDb } from "@/lib/mongodb";
import { mergeAttemptDateOntoMongoFilter } from "@/lib/attemptDateArgs";
import { attemptMatchFilter } from "@/lib/attemptFilters";

function parseClassLevel(
  args: Record<string, unknown>
): number | undefined {
  const clsRaw =
    typeof args.classLevel === "number"
      ? args.classLevel
      : typeof args.classLevel === "string"
        ? Number.parseInt(args.classLevel, 10)
        : undefined;
  if (
    clsRaw === undefined ||
    Number.isNaN(clsRaw) ||
    !Number.isInteger(clsRaw) ||
    clsRaw < 1 ||
    clsRaw > 8
  ) {
    return undefined;
  }
  return clsRaw;
}

export async function toolListMyAttempts(
  userId: string,
  args: Record<string, unknown>
) {
  const subject =
    typeof args.subject === "string" ? args.subject : undefined;
  const classLevel = parseClassLevel(args);
  const limit = Math.min(
    Math.max(
      typeof args.limit === "number"
        ? Math.floor(args.limit)
        : Number(args.limit) || 15,
      1
    ),
    40
  );

  const db = await getDb();
  const filter = attemptMatchFilter(userId, {
    subject,
    classLevel,
  });
  const dateScope = mergeAttemptDateOntoMongoFilter(filter, args);

  const rows = await db
    .collection("attempts")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .project({
      _id: 1,
      paperId: 1,
      score: 1,
      totalMarks: 1,
      subject: 1,
      classLevel: 1,
      createdAt: 1,
      servedCount: 1,
      testLength: 1,
      perTopicSummary: 1,
    })
    .toArray();

  const attempts = rows.map((r) => ({
    id: String(r._id),
    paperId: r.paperId ? String(r.paperId) : null,
    score: r.score,
    totalMarks: r.totalMarks,
    subject: r.subject ?? null,
    classLevel: r.classLevel ?? null,
    createdAt: r.createdAt,
    servedCount: r.servedCount,
    testLength: r.testLength,
    perTopicSummary: r.perTopicSummary,
  }));

  return { dateScope, attempts };
}

export async function toolSummarizeMyPerformance(
  userId: string,
  args: Record<string, unknown>
) {
  const subject =
    typeof args.subject === "string" ? args.subject : undefined;
  const classLevel = parseClassLevel(args);

  const db = await getDb();
  const filter = attemptMatchFilter(userId, {
    subject,
    classLevel,
  });
  const dateScope = mergeAttemptDateOntoMongoFilter(filter, args);

  const rows = await db
    .collection("attempts")
    .find(filter)
    .project({
      score: 1,
      totalMarks: 1,
      subject: 1,
      classLevel: 1,
      createdAt: 1,
    })
    .toArray();

  if (rows.length === 0) {
    return {
      attemptCount: 0,
      dateScope,
      message: "No attempts found for this filter.",
    };
  }

  let sumScore = 0;
  let sumMax = 0;
  const bySubject: Record<
    string,
    { count: number; sumScore: number; sumMax: number }
  > = {};

  for (const r of rows) {
    const s = Number(r.score) || 0;
    const m = Number(r.totalMarks) || 0;
    sumScore += s;
    sumMax += m;
    const sub = (r.subject as string) || "Unknown";
    if (!bySubject[sub]) {
      bySubject[sub] = { count: 0, sumScore: 0, sumMax: 0 };
    }
    bySubject[sub].count += 1;
    bySubject[sub].sumScore += s;
    bySubject[sub].sumMax += m;
  }

  const bySubjectOut: Record<string, { count: number; avgPercent: number | null }> =
    {};
  for (const [k, v] of Object.entries(bySubject)) {
    bySubjectOut[k] = {
      count: v.count,
      avgPercent:
        v.sumMax > 0 ? Math.round((v.sumScore / v.sumMax) * 1000) / 10 : null,
    };
  }

  const latestTs = rows.reduce((latest, r) => {
    const t = r.createdAt ? new Date(r.createdAt as Date).getTime() : 0;
    return t > latest ? t : latest;
  }, 0);

  return {
    attemptCount: rows.length,
    dateScope,
    overallPercent:
      sumMax > 0 ? Math.round((sumScore / sumMax) * 1000) / 10 : null,
    bySubject: bySubjectOut,
    latestAtISO: latestTs > 0 ? new Date(latestTs).toISOString() : null,
  };
}

type TopicAgg = { answered: number; correct: number };

function addTopicCount(
  m: Map<string, TopicAgg>,
  topic: string,
  wasCorrect: boolean
) {
  const t = topic.trim() || "General";
  if (!m.has(t)) m.set(t, { answered: 0, correct: 0 });
  const a = m.get(t)!;
  a.answered += 1;
  if (wasCorrect) a.correct += 1;
}

function mergeFromPerTopicSummary(
  m: Map<string, TopicAgg>,
  rows: unknown
) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const topic = String(r.topic ?? "General").trim() || "General";
    const attempted = Number(r.attempted) || 0;
    const correct = Number(r.correct) || 0;
    if (!m.has(topic)) m.set(topic, { answered: 0, correct: 0 });
    const a = m.get(topic)!;
    a.answered += attempted;
    a.correct += correct;
  }
}

const INSIGHT_ATTEMPT_CAP = 200;

export async function toolGetLearningInsights(
  userId: string,
  args: Record<string, unknown>
) {
  const subject =
    typeof args.subject === "string" ? args.subject : undefined;
  const classLevel = parseClassLevel(args);

  const db = await getDb();
  const filter = attemptMatchFilter(userId, {
    subject,
    classLevel,
  });
  const dateScope = mergeAttemptDateOntoMongoFilter(filter, args);

  const docs = await db
    .collection("attempts")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(INSIGHT_ATTEMPT_CAP)
    .project({
      responses: 1,
      perTopicSummary: 1,
      score: 1,
      totalMarks: 1,
      createdAt: 1,
    })
    .toArray();

  if (docs.length === 0) {
    return {
      attemptsInWindow: 0,
      dateScope,
      topics: [] as Array<{
        topic: string;
        questionsAnswered: number;
        correct: number;
        accuracyPercent: number | null;
      }>,
      strongTopics: [] as string[],
      weakTopics: [] as string[],
      practiceSuggestions: [] as string[],
      overallPercent: null as number | null,
      note: "No attempts for this filter.",
    };
  }

  const topicMap = new Map<string, TopicAgg>();

  for (const doc of docs) {
    const responses = doc.responses;
    if (Array.isArray(responses) && responses.length > 0) {
      for (const r of responses) {
        if (!r || typeof r !== "object") continue;
        const row = r as { category?: string; isCorrect?: unknown };
        addTopicCount(
          topicMap,
          String(row.category ?? "General"),
          row.isCorrect === true
        );
      }
    } else if (
      Array.isArray(doc.perTopicSummary) &&
      doc.perTopicSummary.length > 0
    ) {
      mergeFromPerTopicSummary(topicMap, doc.perTopicSummary);
    }
  }

  let sumScore = 0;
  let sumMax = 0;
  for (const d of docs) {
    sumScore += Number(d.score) || 0;
    sumMax += Number(d.totalMarks) || 0;
  }

  const topics = [...topicMap.entries()]
    .map(([topic, { answered, correct }]) => ({
      topic,
      questionsAnswered: answered,
      correct,
      accuracyPercent:
        answered > 0
          ? Math.round((correct / answered) * 1000) / 10
          : null,
    }))
    .filter((x) => x.questionsAnswered > 0)
    .sort(
      (a, b) =>
        (b.accuracyPercent ?? 0) - (a.accuracyPercent ?? 0) ||
        b.questionsAnswered - a.questionsAnswered
    );

  const strongTopics = topics
    .filter(
      (t) =>
        t.questionsAnswered >= 4 &&
        (t.accuracyPercent ?? 0) >= 65
    )
    .slice(0, 5)
    .map((t) => t.topic);

  const weakTopics = topics
    .filter(
      (t) =>
        t.questionsAnswered >= 3 &&
        (t.accuracyPercent ?? 0) < 55
    )
    .sort(
      (a, b) =>
        (a.accuracyPercent ?? 0) - (b.accuracyPercent ?? 0) ||
        a.questionsAnswered - b.questionsAnswered
    )
    .slice(0, 5)
    .map((t) => t.topic);

  const practiceSuggestions: string[] = [];
  for (const t of topics) {
    if (
      t.questionsAnswered >= 3 &&
      (t.accuracyPercent ?? 0) < 55
    ) {
      practiceSuggestions.push(
        `Extra practice on "${t.topic}" (${t.accuracyPercent}% over ${t.questionsAnswered} questions in this window).`
      );
    }
  }

  return {
    attemptsInWindow: docs.length,
    dateScope,
    approximatedToRecentAttemptsCap: INSIGHT_ATTEMPT_CAP,
    overallPercent:
      sumMax > 0
        ? Math.round((sumScore / sumMax) * 1000) / 10
        : null,
    topics,
    strongTopics,
    weakTopics,
    practiceSuggestions: practiceSuggestions.slice(0, 6),
  };
}

export async function toolSubmitFeedback(
  userId: string,
  email: string | undefined,
  args: Record<string, unknown>
) {
  const message = String(args.message || "").trim();
  if (!message) {
    return { ok: false, error: "message is required" };
  }
  const category =
    typeof args.category === "string"
      ? args.category.slice(0, 48)
      : "general";

  const db = await getDb();
  await db.collection("feedback").insertOne({
    userId,
    email: email ?? null,
    message,
    category,
    source: "llm_tool",
    createdAt: new Date(),
  });

  return { ok: true, confirmation: "Feedback stored." };
}

export async function runToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  email: string | undefined
): Promise<string> {
  switch (name) {
    case "list_my_attempts":
      return JSON.stringify(await toolListMyAttempts(userId, args));
    case "summarize_my_performance":
      return JSON.stringify(
        await toolSummarizeMyPerformance(userId, args)
      );
    case "get_learning_insights":
      return JSON.stringify(
        await toolGetLearningInsights(userId, args)
      );
    case "submit_feedback":
      return JSON.stringify(
        await toolSubmitFeedback(userId, email, args)
      );
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
