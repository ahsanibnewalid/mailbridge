import { Suspense } from "react";
import { ResetPasswordForm } from "../reset-password-form";
export default function ResetPasswordPage() { return <main className="auth-shell"><a className="brand" href="/"><span className="brand-mark">M</span> MailBridge</a><section className="auth-card"><span className="eyebrow">Account security</span><h1 className="auth-title">Reset password</h1><p className="auth-subtitle">Choose a new password with at least 12 characters.</p><Suspense fallback={<p>Loading reset form…</p>}><ResetPasswordForm /></Suspense></section></main>; }
