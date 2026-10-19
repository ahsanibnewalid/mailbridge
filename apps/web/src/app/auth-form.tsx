"use client";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(mode === "login" && params.get("verified") === "1" ? "Email verified. You can sign in now." : mode === "login" && params.get("verified") === "0" ? "That verification link is invalid or expired." : "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/auth/${mode === "register" ? "register" : "login"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, ...(mode === "register" ? { name } : {}) }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || "Request failed. Please try again.");
      if (mode === "register") { setMessage(data.message || "Check your email for verification instructions."); setPassword(""); }
      else router.push("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error. Please try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="auth-form">
    {mode === "register" && <label>Full name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={100} /></label>}
    <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} maxLength={254} /></label>
    <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />{mode === "register" && <small>Use at least 12 characters.</small>}</label>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-message" role="status">{message}</p>}
    <button className="button auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button>
  </form>;
}
