import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { countQueued, drainQueue, isOnline } from "@/offline/queue";

/**
 * Top-of-shell online/offline indicator. Drains the queue when we
 * come back online. Shows queued count.
 */
export default function OfflineIndicator() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(isOnline());
  const [queued, setQueued] = useState(0);
  const [draining, setDraining] = useState(false);

  useEffect(() => {
    function on() { setOnline(true); }
    function off() { setOnline(false); }
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void refreshCount();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (online && queued > 0) {
      void drain();
    }
  }, [online, queued]);

  async function refreshCount() {
    setQueued(await countQueued());
  }

  async function drain() {
    if (draining) return;
    setDraining(true);
    try {
      const r = await drainQueue();
      if (r.uploaded || r.submitted || r.failed) {
        console.log("[offline] drained:", r);
        window.location.reload();
      }
    } finally {
      setDraining(false);
      await refreshCount();
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {online ? (
        <span className="flex items-center gap-1 text-success">
          <Wifi size={12} /> {t("online.label", "Online")}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-warning">
          <WifiOff size={12} /> {t("online.offline", "Offline")}
        </span>
      )}
      {queued > 0 && (
        <button
          onClick={drain}
          disabled={draining}
          className="flex items-center gap-1 rounded bg-warning/16 px-2 py-0.5 text-warning hover:bg-warning/24"
          title={t("online.queued", `${queued} item(s) queued for sync`)}
        >
          <RefreshCw size={12} className={draining ? "animate-spin" : ""} />
          {queued}
        </button>
      )}
    </div>
  );
}
