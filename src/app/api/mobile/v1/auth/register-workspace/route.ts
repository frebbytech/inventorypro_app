import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Workspace creation is managed by the Super Admin. Sign in to an existing store workspace instead.",
    },
    { status: 403 },
  );
}
