import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { LogIn } from "lucide-react";
import type { AppDispatch } from "@/store";
import { setCredentials } from "@/store/authSlice";
import type { AuthUser as User } from "@/store/authSlice";



function GabonFlag() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-label="Gabon flag">
      <rect x="2" y="6" width="28" height="6" fill="#009E60" />
      <rect x="2" y="14" width="28" height="6" fill="#FCD116" />
      <rect x="2" y="22" width="28" height="6" fill="#3A75C4" />
    </svg>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || `Login failed: ${r.status}`);
      }
      const { access, refresh } = await r.json();
      const meRes = await fetch("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${access}` },
      });
      const me: User = await meRes.json();
      dispatch(setCredentials({ user: me, access, refresh }));
      if (me.must_change_password) {
        navigate("/profile?force_password=true");
      } else {
        navigate("/");
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }



  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-2 bg-slate-50 dark:bg-slate-950">
      {/* WILD COVER logo — pinned to the absolute far top-right of the page */}
      <img
        src="/img/WILD Cover Stacked Logo Inverted.png"
        alt="WildCover"
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          height: "40px",
          width: "auto",
          maxWidth: "140px",
          objectFit: "contain",
          zIndex: 50,
          opacity: 0.85,
          filter: "invert(1) hue-rotate(180deg) brightness(1.1)",
        }}
      />

      {/* Left: gradient hero — elephant covers entire panel edge-to-edge */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 p-12 text-white lg:flex">
        {/* Subtle elephant background watermark — flush with outer panel edges */}
        <img
          src="/img/elephant.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center"
          style={{ opacity: 0.15, top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Brand header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg border-2 border-white/30 bg-white">
            <GabonFlag />
          </div>
          <div>
            <div className="text-lg font-bold">{t("app.name", "HEC Emergency Fund")}</div>
            <div className="text-xs text-emerald-100">{t("login.republic", "République Gabonaise")}</div>
          </div>
        </div>

        {/* Headline — vertically centered */}
        <div className="relative z-10 flex flex-1 items-center">
          <div className="max-w-lg">
            <div className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
              {t("login.eyebrow", "HEC Emergency Fund · Gabon")}
            </div>
            <h1 className="text-4xl font-extrabold leading-tight">
              {t("login.headline", "HEC Emergency Fund.")}
            </h1>
            <p className="mt-4 text-lg text-emerald-100">
              {t("login.tagline", "Seamless payment service for human–elephant conflict compensation.")}
            </p>
          </div>
        </div>

        {/* Partner logos at the bottom — CAFI → MINEF → AB Entheos → WCS */}
        <div className="relative z-10 flex items-end justify-between">
          <img
            src="/img/CAFI-LOGO.png"
            alt="CAFI"
            style={{ height: "64px", width: "auto", maxWidth: "120px", objectFit: "contain" }}
          />
          <div
            className="flex items-center justify-center rounded-lg bg-white shadow-md"
            style={{ height: "96px", width: "96px", padding: "8px" }}
          >
            <img
              src="/img/minef.png"
              alt="MINEF Gabon"
              style={{ height: "100%", width: "100%", objectFit: "contain" }}
            />
          </div>
          <img
            src="/img/ab-entheos.png"
            alt="AB Entheos"
            style={{ height: "56px", width: "auto", maxWidth: "120px", objectFit: "contain" }}
          />
          <img
            src="/img/WCS.svg"
            alt="WCS"
            style={{ height: "48px", width: "auto", maxWidth: "80px", objectFit: "contain" }}
          />
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
              <div className="text-xs text-slate-500 dark:text-slate-400">{t("login.subtitle_mobile", "Sign in to continue")}</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("login.welcome", "Welcome back")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("login.signin_hint", "Sign in with your @ab-entheos.co.ke account.")}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("login.email", "Email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("login.password", "Password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
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
              <LogIn size={16} />
              {busy ? t("login.signing_in", "Signing in…") : t("login.sign_in", "Sign in")}
            </button>
            <div className="text-center">
              <Link to="/forgot-password" className="text-sm text-emerald-600 hover:text-emerald-700">
                {t("login.forgot_password", "Forgot your password?")}
              </Link>
            </div>
          </form>


        </div>
      </div>
    </div>
  );
}