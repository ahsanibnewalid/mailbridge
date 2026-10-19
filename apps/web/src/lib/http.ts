import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
export function requestId(request: Request): string { const supplied = request.headers.get("x-request-id"); return supplied && /^[a-zA-Z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID(); }
export function apiError(status: number, code: string, message: string, id: string) { return NextResponse.json({ success: false, error: { code, message }, request_id: id }, { status, headers: { "x-request-id": id, "cache-control": "no-store" } }); }
export function apiSuccess<T>(data: T, status = 200, id?: string) { return NextResponse.json(data, { status, headers: { "cache-control": "no-store", ...(id ? { "x-request-id": id } : {}) } }); }
