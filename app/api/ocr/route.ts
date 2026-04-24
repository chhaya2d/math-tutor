import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { exec } from "child_process";
import path from "path";
import { getServerSession } from "next-auth";

function runCommand(cmd: string) {
  return new Promise<string>((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(stderr);
      else resolve(stdout);
    });
  });
}

export async function POST(req: NextRequest) {

  const session = await getServerSession();

  if (!session) {
  	return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  // Save temp image
  const bytes = await (file as Blob).arrayBuffer();
  const buffer = Buffer.from(bytes);

  const tempImagePath = path.join("/tmp", `input-${Date.now()}.png`);
  const tempOutputPath = path.join("/tmp", `output-${Date.now()}`);

  await writeFile(tempImagePath, buffer);

  try {
    // Run tesseract CLI
    await runCommand(`tesseract ${tempImagePath} ${tempOutputPath}`);

    // Read output
    const text = await import("fs/promises").then(fs =>
      fs.readFile(`${tempOutputPath}.txt`, "utf-8")
    );

    // Cleanup
    await unlink(tempImagePath);
    await unlink(`${tempOutputPath}.txt`);

    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
