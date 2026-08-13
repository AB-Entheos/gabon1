import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { LogOut, Wifi, WifiOff, Sun, Moon, Menu } from "lucide-react";
import type { AppDispatch, RootState } from "@/store";
import { setLanguage, toggleTheme, logout, type Language } from "@/store/authSlice";
import NotificationCenter from "@/components/NotificationCenter";

export default function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { i18n, t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const language = useSelector((s: RootState) => s.auth.language);
  const theme = useSelector((s: RootState) => s.auth.theme);
  const user = useSelector((s: RootState) => s.auth.user);
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  const switchTo = (lang: Language) => {
    void i18n.changeLanguage(lang);
    dispatch(setLanguage(lang));
    document.documentElement.lang = lang;
  };

  const onLogout = () => {
    dispatch(logout());
    localStorage.removeItem("hec.lang");
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-header dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        )}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t("nav.dashboard", "Dashboard")}
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 sm:text-xl">{t("app.name", "HEC Emergency Fund")}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs sm:flex dark:border-slate-700 dark:bg-slate-800">
          {online ? (
            <>
              <Wifi size={12} className="text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-emerald-700 dark:text-emerald-300">{t("online.label", "Online")}</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-rose-600 dark:text-rose-400" />
              <span className="font-medium text-rose-700 dark:text-rose-300">{t("online.offline", "Offline")}</span>
            </>
          )}
        </div>

        <button
          onClick={() => dispatch(toggleTheme())}
          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
          title={theme === "dark" ? t("theme.toggle_to_light", "Switch to light mode") : t("theme.toggle_to_dark", "Switch to dark mode")}
          aria-label={theme === "dark" ? t("theme.toggle_to_light", "Switch to light mode") : t("theme.toggle_to_dark", "Switch to dark mode")}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <NotificationCenter />

        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-bold dark:border-slate-700 dark:bg-slate-800">
          {(["en", "fr"] as const).map((l) => (
            <button
              key={l}
              onClick={() => switchTo(l)}
              className={
                language === l
                  ? "bg-emerald-600 px-2 py-1.5 text-white sm:px-3"
                  : "px-2 py-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white sm:px-3"
              }
              aria-pressed={language === l}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {user && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:gap-3 sm:pl-3 dark:border-slate-800">
            <button
              onClick={() => navigate("/profile")}
              className="hidden text-right hover:underline sm:block"
              title={t("nav.profile", "My Profile")}
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {user.first_name} {user.last_name}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{user.email}</div>
            </button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <button
              onClick={onLogout}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-rose-400"
              title={t("nav.logout", "Log out")}
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
