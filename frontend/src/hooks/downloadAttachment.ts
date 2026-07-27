/**
 * Trigger a browser download for an authenticated attachment.
 *
 * Fetches the file via the API with the user's JWT, then creates a
 * temporary <a download> element to save it locally.
 */
export async function downloadAttachment(
  submissionId: number,
  attachmentId: number,
  filename: string,
  token: string | null | undefined,
): Promise<void> {
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `/api/v1/submission/${submissionId}/attachment/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
