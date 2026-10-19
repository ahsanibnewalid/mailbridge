import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/session";
import { requestId } from "@/lib/http";
export async function POST(request: Request) {
  const id = requestId(request);
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL;
  if (process.env.NODE_ENV === "production" && (!origin || !expected || new URL(origin).origin !== new URL(expected).origin)) return NextResponse.json({ success: false, error: { code: "ORIGIN_REJECTED", message: "Request origin is not allowed." }, request_id: id }, { status: 403, headers: { "cache-control": "no-store" } });
  await revokeCurrentSession();
  return NextResponse.json({ success: true, request_id: id }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
}
