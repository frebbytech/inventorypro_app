import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ folder: string; fileName: string }> }
) {
  const { folder, fileName } = await params;

  try {
    // Directory modified to read from: public/images/<folder>/<fileName>
    const filePath = path.join(process.cwd(), "public", "images", folder, fileName);
    const fileBuffer = await readFile(filePath);

    const ext = path.extname(fileName).slice(1);
    const contentType = ext === "png" ? "image/png" : `image/${ext}`;

    return new NextResponse(fileBuffer, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}


// import { NextRequest, NextResponse } from "next/server";
// import { readFile } from "fs/promises";
// import path from "path";

// export const runtime = "nodejs";

// export async function GET(
//   request: NextRequest,
//   { params }: { params: Promise<{ folder: string; fileName: string }> }
// ) {
//   const { folder, fileName } = await params;

//   try {
//     const filePath = path.join(process.cwd(), "images", folder, fileName);
//     const fileBuffer = await readFile(filePath);

//     const ext = path.extname(fileName).slice(1);
//     const contentType = ext === "png" ? "image/png" : `image/${ext}`;

//     return new NextResponse(fileBuffer, {
//       headers: { "Content-Type": contentType },
//     });
//   } catch {
//     return NextResponse.json({ error: "File not found." }, { status: 404 });
//   }
// }