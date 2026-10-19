import { apiError, requestId } from "@/lib/http";
export async function POST(request: Request) { const id = requestId(request); return apiError(501, "SENDING_NOT_CONFIGURED", "Email sending is not enabled in this build yet. Configure a provider after the secure sending pipeline is implemented.", id); }
