import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useListNotificationsQuery, useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation, useNotifyDesktopEnabledMutation, useNotifyDesktopDisabledMutation } from "@/api/hecApi";
import type { RootState } from "@/store";
import { useSelector } from "react-redux";

export default function NotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useSelector((s: RootState) => s.auth.language);
  const user = useSelector((s: RootState) => s.auth.user);
  const [open, setOpen] = useState(false);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported" | "disabled">(
    typeof Notification === "undefined" ? "unsupported" : (localStorage.getItem(`hec.desktop-disabled.${user?.id}`) === "true" ? "disabled" : Notification.permission),
  );
  const { data } = useListNotificationsQuery({ unread: true }, { pollingInterval: 30000 });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();
  const [notifyDesktopEnabled] = useNotifyDesktopEnabledMutation();
  const [notifyDesktopDisabled] = useNotifyDesktopDisabledMutation();
  const unread = data?.unread_count ?? 0;

  useEffect(() => {
    if (!user || typeof Notification === "undefined") return;
    const disabled = localStorage.getItem(`hec.desktop-disabled.${user.id}`) === "true";
    setDesktopPermission(disabled ? "disabled" : Notification.permission);
    if (!disabled && Notification.permission === "default") setOpen(true);
  }, [user]);

  useEffect(() => {
    if (!data || !user || desktopPermission === "disabled" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const storageKey = `hec.desktop-notifications.${user.id}`;
    const previous = localStorage.getItem(storageKey);
    const newestId = data.results[0]?.id;
    if (previous === null) {
      if (newestId) localStorage.setItem(storageKey, String(newestId));
      return;
    }
    const newNotifications = data.results.filter((item) => item.id > Number(previous) && !item.read_at);
    for (const item of newNotifications.reverse()) {
      const title = item.title[language] ?? item.title.fr ?? item.title.en;
      const body = item.message[language] ?? item.message.fr ?? item.message.en;
      const desktop = new Notification(title, { body, tag: `hec-notification-${item.id}`, icon: "/favicon.svg" });
      desktop.onclick = () => {
        window.focus();
        if (item.case_uid) window.location.assign(`/cases/${item.case_uid}`);
        desktop.close();
      };
    }
    if (newestId) localStorage.setItem(storageKey, String(newestId));
  }, [data, desktopPermission, language, user]);

  async function enableDesktopNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setDesktopPermission(permission);
    if (permission === "granted") {
      if (user && localStorage.getItem(`hec.desktop-email-sent.${user.id}`) !== "true") {
        try {
          await notifyDesktopEnabled().unwrap();
          localStorage.setItem(`hec.desktop-email-sent.${user.id}`, "true");
        } catch {
          // Desktop permission remains enabled if email delivery is temporarily unavailable.
        }
      }
      new Notification(t("notifications.enabled_title", "Desktop notifications enabled"), {
        body: t("notifications.enabled_body", "You will receive alerts for new case activity while this app is open."),
        icon: "/favicon.svg",
      });
    }
  }

  async function disableDesktopNotifications() {
    localStorage.removeItem(`hec.desktop-notifications.${user?.id}`);
    localStorage.removeItem(`hec.desktop-email-sent.${user?.id}`);
    localStorage.setItem(`hec.desktop-disabled.${user?.id}`, "true");
    setDesktopPermission("disabled");
    try { await notifyDesktopDisabled().unwrap(); } catch { /* browser setting remains disabled locally */ }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        aria-label={t("notifications.open", "Open notifications")}
        aria-expanded={open}
      >
        <Bell size={15} />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(90vw,380px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("notifications.title", "Notifications")}</h2>
            <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline dark:text-emerald-300">
              <CheckCheck size={13} /> {t("notifications.mark_all", "Mark all read")}
            </button>
          </div>
          <button type="button" onClick={() => { navigate("/notifications"); setOpen(false); }} className="w-full border-b border-slate-200 px-4 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-slate-50 dark:border-slate-700 dark:text-emerald-300 dark:hover:bg-slate-800">
            {t("notifications.history_link", "View notification history")}
          </button>
          {desktopPermission !== "granted" && desktopPermission !== "unsupported" && desktopPermission !== "disabled" && (
            <div className="border-b border-slate-200 bg-amber-50 px-4 py-3 dark:border-slate-700 dark:bg-amber-950/30">
              <p className="text-xs text-amber-900 dark:text-amber-200">{t("notifications.desktop_hint", "Enable desktop notifications to receive alerts for new case activity.")}</p>
              <button type="button" onClick={() => void enableDesktopNotifications()} className="mt-2 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700">
                {t("notifications.enable_desktop", "Enable desktop notifications")}
              </button>
            </div>
          )}
          {desktopPermission === "granted" && (
            <div className="border-b border-slate-200 px-4 py-2 text-[11px] text-emerald-700 dark:border-slate-700 dark:text-emerald-300">
              {t("notifications.desktop_enabled", "Desktop notifications are enabled.")}
              <button type="button" onClick={() => void disableDesktopNotifications()} className="ml-2 font-semibold underline">
                {t("notifications.disable_desktop", "Disable desktop notifications")}
              </button>
            </div>
          )}
          {desktopPermission === "disabled" && (
            <div className="border-b border-slate-200 px-4 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {t("notifications.desktop_disabled", "Desktop notifications are disabled.")}
            </div>
          )}
          {desktopPermission === "denied" && (
            <p className="border-b border-slate-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-slate-700 dark:bg-rose-950/30 dark:text-rose-200">
              {t("notifications.desktop_blocked", "Desktop notifications are blocked. Allow them in your browser site settings.")}
            </p>
          )}
          <div className="max-h-96 overflow-auto">
            {(data?.results ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{t("notifications.empty", "No notifications yet.")}</p>
            ) : data?.results.map((notification) => (
              <button
                type="button"
                key={notification.id}
                onClick={() => {
                  if (!notification.read_at) void markRead(notification.id);
                  if (notification.case_uid) navigate(`/cases/${notification.case_uid}`);
                  setOpen(false);
                }}
                className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${notification.read_at ? "opacity-70" : "bg-emerald-50/50 dark:bg-emerald-950/20"}`}
              >
                <div className="flex items-start gap-2">
                  {!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{notification.title[language] ?? notification.title.fr ?? notification.title.en}</div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{notification.message[language] ?? notification.message.fr ?? notification.message.en}</p>
                    <time className="mt-1 block text-[10px] text-slate-400">{new Date(notification.created_at).toLocaleString(language === "fr" ? "fr-FR" : "en-GB")}</time>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
