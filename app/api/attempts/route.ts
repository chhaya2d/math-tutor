import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { mergeAttemptDateOntoMongoFilter } from "@/lib/attemptDateArgs";
import { attemptMatchFilter } from "@/lib/attemptFilters";

export async function GET(req: Request) {
  const session = await getServerSession();
  const userId = session?.user?.email;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject") || undefined;
  const classLevelRaw = searchParams.get("classLevel");
  const classLevel =
    classLevelRaw !== null && classLevelRaw !== ""
      ? Number.parseInt(classLevelRaw, 10)
      : undefined;
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "20", 10) || 20, 1),
    50
  );

  const db = await getDb();
  const filter = attemptMatchFilter(userId, {
    subject,
    classLevel:
      classLevel !== undefined &&
      !Number.isNaN(classLevel) &&
      classLevel >= 1 &&
      classLevel <= 8
        ? classLevel
        : undefined,
  });

  const lastDaysQ = searchParams.get("last_days");
  mergeAttemptDateOntoMongoFilter(filter, {
    last_days:
      lastDaysQ !== null && lastDaysQ !== ""
        ? Number.parseInt(lastDaysQ, 10)
        : "",
    from_date: searchParams.get("from_date") || "",
    to_date: searchParams.get("to_date") || "",
  });

  const rows = await db
    .collection("attempts")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .project({
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

  return NextResponse.json({ data: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const totalMarks = Array.isArray(body.responses)
    ? body.responses.reduce(
        (sum: number, item: any) => sum + (Number(item?.marks) || 0),
        0
      )
    : 0;

  const db = await getDb();

  const storedSubject =
    typeof body.subject === "string" ? body.subject : undefined;
  const clsBody = body.classLevel;
  const storedClass =
    typeof clsBody === "number"
      ? clsBody
      : typeof clsBody === "string"
        ? Number.parseInt(clsBody, 10)
        : undefined;

  await db.collection("attempts").insertOne({
    userId: body.userId,
    paperId: body.paperId,
    responses: body.responses,
    score: body.score,
    totalMarks,
    subject: storedSubject ?? "Maths",
    classLevel:
      typeof storedClass === "number" &&
      !Number.isNaN(storedClass) &&
      storedClass >= 1 &&
      storedClass <= 8
        ? storedClass
        : 1,
    adaptiveTrace: Array.isArray(body.adaptiveTrace) ? body.adaptiveTrace : [],
    perTopicSummary: Array.isArray(body.perTopicSummary) ? body.perTopicSummary : [],
    servedCount: Number(body.servedCount) || 0,
    testLength: Number(body.testLength) || 0,
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true });
}
