import Link from "next/link";
import { AuthForm } from "../auth-form";
export default function RegisterPage() { return <main className="auth-shell"><a className="brand" href="/"><span className="brand-mark">M</span> MailBridge</a><section className="auth-card"><span className="eyebrow">Get started</span><h1 className="auth-title">Create your account</h1><p className="auth-subtitle">We’ll ask you to verify your email before sign-in.</p><AuthForm mode="register" /><p className="auth-switch">Already registered? <Link href="/login">Sign in</Link></p></section></main>; }
