import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/store";
import { setCredentials, logout } from "@/store/authSlice";

interface Args {
  caseUid: string;
  attachmentId?: number;
  submissionId?: number;
  mime?: string;
}

const cache = new Map<string, string>();

export function useAttachmentUrl({ caseUid, attachmentId, submissionId, mime }: Args): string | undefined {
  const dispatch = useDispatch();
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const refreshToken = useSelector((s: RootState) => s.auth.refreshToken);
  const user = useSelector((s: RootState) => s.auth.user);
  const key = useMemo(() => {
    if (!attachmentId || !submissionId) return undefined;
    return `a:${caseUid}:${submissionId}:${attachmentId}`;
  }, [caseUid, submissionId, attachmentId]);

  const [url, setUrl] = useState<string | undefined>(() => (key ? cache.get(key) : undefined));

  useEffect(() => {
    if (!key || !attachmentId || !submissionId || !token) return;
    if (cache.has(key)) {
      setUrl(cache.get(key));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let activeToken = token;
        let res = await fetch(
          `/api/v1/submission/${submissionId}/attachment/${attachmentId}`,
          { headers: { Authorization: `Bearer ${activeToken}` } },
        );
        if (res.status === 401 && refreshToken) {
          const refreshRes = await fetch("/api/v1/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: refreshToken }),
          });
          if (!refreshRes.ok) {
            dispatch(logout());
            throw new Error(`status ${res.status}`);
          }
          const refreshed = await refreshRes.json() as { access: string; refresh: string };
          activeToken = refreshed.access;
          dispatch(setCredentials({
            user: user!,
            access: refreshed.access,
            refresh: refreshed.refresh,
          }));
          res = await fetch(
            `/api/v1/submission/${submissionId}/attachment/${attachmentId}`,
            { headers: { Authorization: `Bearer ${activeToken}` } },
          );
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        cache.set(key, objectUrl);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, attachmentId, submissionId, token, refreshToken, user, mime, dispatch]);

  return url;
}
