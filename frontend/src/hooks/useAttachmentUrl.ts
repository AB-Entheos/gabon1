import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";

interface Args {
  caseUid: string;
  attachmentId?: number;
  submissionId?: number;
  mime?: string;
}

const cache = new Map<string, string>();

export function useAttachmentUrl({ caseUid, attachmentId, submissionId, mime }: Args): string | undefined {
  const token = useSelector((s: RootState) => s.auth.accessToken);
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
        const res = await fetch(
          `/api/v1/submission/${submissionId}/attachment/${attachmentId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
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
  }, [key, attachmentId, submissionId, token, mime]);

  return url;
}
