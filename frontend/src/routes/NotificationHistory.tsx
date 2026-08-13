import { useTranslation } from "react-i18next";
import { useListNotificationsQuery, useMarkNotificationReadMutation } from "@/api/hecApi";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";

export default function NotificationHistory() {
  const { t } = useTranslation();
  const language = useSelector((s: RootState) => s.auth.language);
  const { data, isLoading } = useListNotificationsQuery({ limit: 100 });
  const [markRead] = useMarkNotificationReadMutation();

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("notifications.history_title", "Notification history")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("notifications.history_subtitle", "Review current and previous notifications.")}</p>
      </div>
      <div className="card overflow-hidden">
        {isLoading ? <div className="p-5 text-sm text-slate-500">{t("common.loading", "Loading…")}</div> : (data?.results ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{t("notifications.empty", "No notifications yet.")}</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.results.map((notification) => (
              <button type="button" key={notification.id} onClick={() => { if (!notification.read_at) void markRead(notification.id); }} className={`w-full px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${notification.read_at ? "opacity-70" : "bg-emerald-50/50 dark:bg-emerald-950/20"}`}>
                <div className="flex items-start gap-3">
                  {!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{notification.title[language] ?? notification.title.fr ?? notification.title.en}</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{notification.message[language] ?? notification.message.fr ?? notification.message.en}</p>
                    <time className="mt-2 block text-xs text-slate-400">{new Date(notification.created_at).toLocaleString(language === "fr" ? "fr-FR" : "en-GB")}</time>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
