import { Resend } from "resend";

export async function sendPlatformEmail(input: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DEFAULT_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Platform email is not configured; set RESEND_API_KEY and DEFAULT_FROM_EMAIL");
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from: process.env.DEFAULT_FROM_NAME ? `${process.env.DEFAULT_FROM_NAME} <${from}>` : from, to: input.to, subject: input.subject, html: input.html, text: input.text });
  if (error) throw new Error(`Platform email provider error: ${error.name}`);
  return data;
}
