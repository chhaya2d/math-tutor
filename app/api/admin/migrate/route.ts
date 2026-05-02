import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";

/**
 * One-time admin operations on MongoDB collections.
 * Set env MATH_MVP_ADMIN_SECRET. Call with header:
 *   Authorization: Bearer <MATH_MVP_ADMIN_SECRET>
 *
 * Body JSON:
 *   { "action": "delete_papers_attempts" } — removes all docs in papers + attempts
 *   { "action": "backfill_subject_class" } — sets subject=Maths, classLevel=1 on papers missing subject
 */
export async function POST(req: Request) {
  const configured = process.env.MATH_MVP_ADMIN_SECRET;
  if (!configured) {
    return NextResponse.json(
      { error: "MATH_MVP_ADMIN_SECRET is not configured." },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== configured) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  const db = await getDb();

  if (action === "delete_papers_attempts") {
    const papers = await db.collection("papers").deleteMany({});
    const attempts = await db.collection("attempts").deleteMany({});
    return NextResponse.json({
      ok: true,
      action,
      deletedCount: {
        papers: papers.deletedCount,
        attempts: attempts.deletedCount,
      },
    });
  }

  if (action === "backfill_subject_class") {
    const result = await db.collection("papers").updateMany(
      { subject: { $exists: false } },
      {
        $set: {
          subject: "Maths",
          classLevel: 1,
          migratedAt: new Date(),
        },
      }
    );
    const alsoClassOnly = await db.collection("papers").updateMany(
      {
        subject: "Maths",
        classLevel: { $exists: false },
      },
      { $set: { classLevel: 1, migratedAt: new Date() } }
    );

    return NextResponse.json({
      ok: true,
      action,
      matchedMissingSubject: result.matchedCount,
      modifiedMissingSubject: result.modifiedCount,
      matchedMissingClass: alsoClassOnly.matchedCount,
      modifiedMissingClass: alsoClassOnly.modifiedCount,
    });
  }

  return NextResponse.json(
    {
      error:
        'Unknown action. Use "delete_papers_attempts" or "backfill_subject_class".',
    },
    { status: 400 }
  );
}
