import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Sign in with a verified account." } }, { status: 401, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ success: true, user }, { headers: { "cache-control": "no-store" } });
}
