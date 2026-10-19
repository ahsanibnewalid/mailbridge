import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";
export default function LoginPage() { return <main className="auth-shell"><a className="brand" href="/"><span className="brand-mark">M</span> MailBridge</a><section className="auth-card"><span className="eyebrow">Welcome back</span><h1 className="auth-title">Sign in to your workspace</h1><p className="auth-subtitle">Manage projects, templates, and delivery settings.</p><Suspense fallback={<p>Loading sign-in form…</p>}><AuthForm mode="login" /></Suspense><p className="auth-switch"><Link href="/forgot-password">Forgot password?</Link></p><p className="auth-switch">New to MailBridge? <Link href="/register">Create an account</Link></p></section></main>; }
