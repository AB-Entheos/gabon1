import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import {
  LayoutDashboard,
  FileStack,
  ClipboardList,
  ScrollText,
  BarChart3,
  FormInput,
  Wallet,
  FilePlus,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Banknote,
  X,
} from "lucide-react";
import type { RootState } from "@/store";
import type { Role } from "@/store/authSlice";

type Item = {
  to: string;
  icon: typeof LayoutDashboard;
  key: string;
  roles: Role[] | "all";
};

const ITEMS: Item[] = [
  { to: "/", icon: LayoutDashboard, key: "dashboard", roles: "all" },
  { to: "/stages", icon: Layers, key: "stages", roles: "all" },
  { to: "/cases/new", icon: FilePlus, key: "new_case", roles: "all" },
  { to: "/cases", icon: FileStack, key: "cases", roles: "all" },
  { to: "/queue", icon: ClipboardList, key: "committee", roles: ["AB", "WCS", "DGFC", "DGFAP", "SUPER_ADMIN"] },
  { to: "/disbursements", icon: Banknote, key: "disbursements", roles: ["WCS"] as Role[] },
  { to: "/audit", icon: ScrollText, key: "audit", roles: ["ADMIN", "SUPER_ADMIN"] as Role[] },
  { to: "/reports", icon: BarChart3, key: "reports", roles: ["ADMIN", "SUPER_ADMIN"] as Role[] },
  { to: "/forms", icon: FormInput, key: "forms", roles: ["ADMIN", "SUPER_ADMIN"] as Role[] },
  { to: "/payments", icon: Wallet, key: "payments", roles: ["ADMIN", "SUPER_ADMIN"] as Role[] },
  { to: "/closed", icon: CheckCircle2, key: "closed", roles: ["ADMIN", "SUPER_ADMIN"] as Role[] },
  { to: "/users", icon: ShieldCheck, key: "users", roles: ["SUPER_ADMIN"] as Role[] },
];

function GabonFlag() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-label="Gabon flag">
      <rect x="2" y="6" width="28" height="6" fill="#009E60" />
      <rect x="2" y="14" width="28" height="6" fill="#FCD116" />
      <rect x="2" y="22" width="28" height="6" fill="#3A75C4" />
    </svg>
  );
}

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const user = useSelector((s: RootState) => s.auth.user);
  const role: Role | null = user?.role ?? null;

  const visible = ITEMS.filter((i) => i.roles === "all" || (role && i.roles.includes(role)));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
        <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
          <GabonFlag />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{t("app.name", "HEC Emergency Fund")}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t("app.tagline", "Where farmers and elephants share the forest")}</div>
        </div>
      </div>
      {user && (
        <div className="m-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {user.first_name} {user.last_name}
              </div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {t(`role.${user.role}`, user.role)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {user.preferred_language === "fr" ? "Français" : "English"}
            </span>
          </div>
        </div>
      )}
      <nav className="flex-1 space-y-0.5 px-3">
        {visible.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={key}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
              ].join(" ")
            }
          >
            <Icon size={18} />
            <span>{t(`nav.${key}`, key)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        {t("app.version", "v1.0.1 · Gabon 2026")}
      </div>
    </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          {/* Drawer */}
          <aside className="relative flex h-full w-[280px] flex-col border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-[72px] items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
                  <GabonFlag />
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t("app.name", "HEC Emergency Fund")}
                </div>
              </div>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            {user && (
              <div className="m-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {user.first_name} {user.last_name}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                  </div>
                </div>
              </div>
            )}
            <nav className="flex-1 space-y-0.5 px-3 py-2">
              {visible.map(({ to, icon: Icon, key }) => (
                <NavLink
                  key={key}
                  to={to}
                  end={to === "/"}
                  onClick={onClose}
                  className={({ isActive }) =>
                    [
                      "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
                    ].join(" ")
                  }
                >
                  <Icon size={18} />
                  <span>{t(`nav.${key}`, key)}</span>
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-200 p-4 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
              {t("app.version", "v1.0.1 · Gabon 2026")}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
