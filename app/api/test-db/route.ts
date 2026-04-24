import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getDb();

    const collections = await db.listCollections().toArray();

    return NextResponse.json({
      success: true,
      collections,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB failed" }, { status: 500 });
  }
}
