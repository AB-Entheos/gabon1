import { useState, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { User, Save, ArrowLeft } from "lucide-react";
import type { AppDispatch, RootState } from "@/store";
import { setUser } from "@/store/authSlice";
import PasswordChangeModal from "@/components/PasswordChangeModal";

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.auth.user);
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(user?.email ?? "");
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState(user?.preferred_language ?? "fr");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Force password change on first login
  useEffect(() => {
    if (searchParams.get("force_password") === "true" || user?.must_change_password) {
      setShowPasswordModal(true);
    }
  }, [searchParams, user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const body: Record<string, string> = {
        email,
        first_name: firstName,
        last_name: lastName,
        preferred_language: language,
      };
      const res = await fetch("/api/v1/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || j.email?.[0] || `Error: ${res.status}`);
      }
      const data = await res.json();
      // Update the user in Redux and localStorage
      if (user) {
        dispatch(setUser({ ...user, ...data }));
      }
      setSaved(true);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PasswordChangeModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft size={16} />
          {t("common.back", "Back")}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <User size={24} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t("profile.title", "My Profile")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("profile.subtitle", "Manage your account settings")}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("profile.first_name", "First Name")}
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("profile.last_name", "Last Name")}
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("profile.email", "Email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("profile.phone", "Phone")}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
              placeholder={t("profile.phone_placeholder", "Optional")}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("profile.language", "Preferred Language")}
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "fr")}
              className="input"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
              {error}
            </div>
          )}
          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
              {t("profile.saved", "Profile updated successfully!")}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={busy} className="btn-primary">
              <Save size={16} />
              {busy ? t("profile.saving", "Saving…") : t("profile.save", "Save Changes")}
            </button>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t("profile.change_password", "Change Password")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
