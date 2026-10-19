import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { try { await db.$queryRaw`SELECT 1`; return NextResponse.json({ status: "ok", checks: { database: "ok" }, timestamp: new Date().toISOString() }, { status: 200, headers: { "cache-control": "no-store" } }); } catch { return NextResponse.json({ status: "degraded", checks: { database: "error" }, timestamp: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } }); } }
