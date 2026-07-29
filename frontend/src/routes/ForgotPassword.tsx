import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

function GabonFlag() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-label="Gabon flag">
      <rect x="2" y="6" width="28" height="6" fill="#009E60" />
      <rect x="2" y="14" width="28" height="6" fill="#FCD116" />
      <rect x="2" y="22" width="28" height="6" fill="#3A75C4" />
    </svg>
  );
}

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/v1/auth/password-reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || `Request failed: ${r.status}`);
      }
      setSent(true);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-2 bg-slate-50 dark:bg-slate-950">
      {/* Left: gradient hero */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 p-12 text-white lg:flex">
        <img
          src="/img/elephant.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center"
          style={{ opacity: 0.15, top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg border-2 border-white/30 bg-white">
            <GabonFlag />
          </div>
          <div>
            <div className="text-lg font-bold">{t("app.name", "HEC Emergency Fund")}</div>
            <div className="text-xs text-emerald-100">{t("login.republic", "République Gabonaise")}</div>
          </div>
        </div>
        <div className="relative z-10 flex flex-1 items-center">
          <div className="max-w-lg">
            <h1 className="text-4xl font-extrabold leading-tight">
              {t("forgot.headline", "Reset your password")}
            </h1>
            <p className="mt-4 text-lg text-emerald-100">
              {t("forgot.tagline", "Enter your email address and we'll send you a link to reset your password.")}
            </p>
          </div>
        </div>
        <div className="relative z-10 flex items-end justify-between">
          <img src="/img/CAFI-LOGO.png" alt="CAFI" style={{ height: "64px", width: "auto", maxWidth: "120px", objectFit: "contain" }} />
          <div className="flex items-center justify-center rounded-lg bg-white shadow-md" style={{ height: "96px", width: "96px", padding: "8px" }}>
            <img src="/img/minef.png" alt="MINEF Gabon" style={{ height: "100%", width: "100%", objectFit: "contain" }} />
          </div>
          <img src="/img/ab-entheos.png" alt="AB Entheos" style={{ height: "56px", width: "auto", maxWidth: "120px", objectFit: "contain" }} />
          <img src="/img/WCS.svg" alt="WCS" style={{ height: "48px", width: "auto", maxWidth: "80px", objectFit: "contain" }} />
        </div>
      </div>

      {/* Right: form */}
      <div className="relative flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
              <GabonFlag />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100">{t("app.name", "HEC Emergency Fund")}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t("forgot.subtitle", "Password reset")}</div>
            </div>
          </div>

          <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-600">
            <ArrowLeft size={14} />
            {t("forgot.back_to_login", "Back to sign in")}
          </Link>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("forgot.title", "Forgot your password?")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("forgot.hint", "No worries. Enter your email and we'll send you a reset link.")}</p>

          {sent ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-emerald-700 font-medium">
                <CheckCircle size={18} />
                {t("forgot.sent_title", "Check your inbox")}
              </div>
              <p className="mt-2 text-sm text-emerald-600">
                {t("forgot.sent_body", "If an account with that email exists, you'll receive a password reset link shortly.")}
              </p>
              <Link to="/login" className="mt-4 inline-block text-sm font-medium text-emerald-700 underline hover:text-emerald-800">
                {t("forgot.go_login", "Return to sign in")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("forgot.email", "Email")}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder={t("forgot.email_placeholder", "you@example.com")}
                  required
                />
              </div>
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full"
              >
                <Mail size={16} />
                {busy ? t("forgot.sending", "Sending…") : t("forgot.send_link", "Send reset link")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
