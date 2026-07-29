import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { Lock, AlertTriangle } from "lucide-react";
import type { AppDispatch, RootState } from "@/store";
import { setUser } from "@/store/authSlice";

interface Props {
  open: boolean;
  onClose?: () => void;
}

export default function PasswordChangeModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.auth.user);
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t("password.mismatch", "New passwords do not match."));
      return;
    }
    if (newPassword.length < 12) {
      setError(t("password.too_short", "Password must be at least 12 characters."));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/force-change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || `Error: ${res.status}`);
      }
      // Update local user state
      if (user) {
        dispatch(setUser({ ...user, must_change_password: false }));
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose?.();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t("password.change_required", "Change Your Password")}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("password.first_login", "You must change your temporary password to continue.")}
            </p>
          </div>
        </div>

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
            {t("password.changed", "Password changed successfully!")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("password.current", "Current Password")}
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("password.new", "New Password")}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                required
                minLength={12}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("password.confirm", "Confirm New Password")}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                required
                minLength={12}
              />
            </div>
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                {error}
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              <Lock size={16} />
              {busy ? t("password.saving", "Saving…") : t("password.save", "Save New Password")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
