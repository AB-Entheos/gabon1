import { createApi, fetchBaseQuery, type BaseQueryApi, type FetchArgs } from "@reduxjs/toolkit/query/react";
import type { RootState } from "@/store";
import { setCredentials, logout } from "@/store/authSlice";

const baseQuery = fetchBaseQuery({
  baseUrl: "/api/v1",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    return headers;
  },
});

async function baseQueryWithReauth(
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: object,
) {
  let result = await baseQuery(args, api, extraOptions);

  if (result.error && (result.error as { status?: number }).status === 401) {
    const refreshToken = (api.getState() as RootState).auth.refreshToken;
    if (!refreshToken) {
      api.dispatch(logout());
      return result;
    }

    const refreshResult = await baseQuery(
      { url: "auth/refresh", method: "POST", body: { refresh: refreshToken } },
      api,
      extraOptions,
    );

    if (refreshResult.data) {
      const { access, refresh } = refreshResult.data as { access: string; refresh: string };
      api.dispatch(setCredentials({
        user: (api.getState() as RootState).auth.user!,
        access,
        refresh,
      }));
      result = await baseQuery(args, api, extraOptions);
    } else {
      api.dispatch(logout());
    }
  }

  return result;
}

export interface User {
  id: number;
  email: string;
  username: string;
  role: "CB" | "DP" | "AB" | "WCS" | "DGFC" | "DGFAP" | "MINISTER" | "ADMIN" | "SUPER_ADMIN";
  first_name: string;
  last_name: string;
  preferred_language: "en" | "fr";
  is_2fa_enabled: boolean;
  requires_2fa: boolean;
}

export interface Case {
  uid: string;
  case_type: "MEDICAL" | "BURIAL";
  claimant_name: string;
  claimant_phone: string;
  claimant_id_number: string;
  claimant_id_type: "NATIONAL_ID" | "PASSPORT" | "DRIVER_LICENSE" | "OTHER";
  claimant_date_of_birth: string | null;
  claimant_gender: "M" | "F" | "OTHER" | "";
  claimant_address: string;
  incident_location: string;
  relationship_to_claimant: "SELF" | "SPOUSE" | "PARENT" | "CHILD" | "SIBLING" | "OTHER";
  village: number | null;
  village_name: string;
  village_name_text: string;
  chef_de_village: string;
  incident_at: string;
  reported_at: string;
  current_step: 1 | 2 | 3 | 4 | 5 | 6;
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "VERIFIED"
    | "AT_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "DEFERRED"
    | "CLOSED"
    | "DELETED";
  amount_authorized: string | null;
  amount_proposed: string | null;
  sla_deadline: string | null;
  created_by: number;
  created_by_email: string;
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_from_status?: Case["status"] | "";
  deleted_from_step?: number | null;
  current_approver_role: string | null;
  disbursement_summary?: {
    disbursed_xaf: number;
    remaining_xaf: number;
    utilization_pct: number;
  };
}

export interface CaseEvent {
  id: number;
  actor_email: string;
  actor_role: string;
  occurred_at: string;
  event_type: string;
  from_step: number | null;
  to_step: number | null;
  notes: string;
  payload_hash: string;
  signature: string;
  amount_xaf: string | null;
}

export interface CaseDetail extends Case {
  events: CaseEvent[];
  disbursement_summary?: {
    authorized_xaf: number;
    disbursed_xaf: number;
    remaining_xaf: number;
    utilization_pct: number;
    approaching_limit: boolean;
    count: number;
  };
}

export interface Disbursement {
  id: number;
  case_uid: string;
  claimant_name: string;
  case_type: "MEDICAL" | "BURIAL";
  case_status: Case["status"];
  village_name: string;
  amount_xaf: number;
  purpose: string;
  recipient_kind: string;
  recipient_kind_other: string;
  recipient_name: string;
  payment_date: string;
  payment_reference: string;
  proof_of_payment_id: number | null;
  proof_of_payment?: {
    id: number;
    filename: string;
    mime: string;
    size_bytes: number;
  } | null;
  paid_by: string;
  created_at: string;
  notes: string;
}

export interface FormDefinition {
  uid: string;
  slug: string;
  title: string;
  version: number;
  schema: {
    title?: { en: string; fr: string };
    description?: { en: string; fr: string };
    fields: Array<{
      id: string;
      type: string;
      label: { en: string; fr: string } | string;
      help?: { en: string; fr: string } | string;
      placeholder?: { en: string; fr: string } | string;
      options?: Array<{
        value: string;
        label: { en: string; fr: string } | string;
      }>;
      required?: boolean;
      min?: number;
      max?: number;
      default?: unknown;
    }>;
  };
  role_scope: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  published_at: string | null;
}

export interface PresignResult {
  url: string;
  key: string;
  expires_at: string;
  expires_in: number;
  case_uid: string;
  submission_id?: number;
}

export interface InAppNotification {
  id: number;
  case_uid: string | null;
  kind: "INFO" | "ACTION" | "SUCCESS" | "WARNING";
  event_key: string;
  title: { en: string; fr: string };
  message: { en: string; fr: string };
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export const hecApi = createApi({
  reducerPath: "hecApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Case", "Cases", "Form", "Forms", "Me", "Audit", "Disbursements", "Submissions", "Notifications"],
  endpoints: (build) => ({
    me: build.query<User, void>({
      query: () => "users/me",
      providesTags: ["Me"],
    }),
    patchMe: build.mutation<User, Partial<Pick<User, "preferred_language" | "first_name" | "last_name" | "email">>>({
      query: (body) => ({
        url: "users/me",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Me"],
    }),
    listNotifications: build.query<{ results: InAppNotification[]; unread_count: number }, { unread?: boolean; limit?: number } | void>({
      query: (arg) => ({ url: "notifications", params: arg ?? undefined }),
      providesTags: ["Notifications"],
    }),
    markNotificationRead: build.mutation<InAppNotification, number>({
      query: (id) => ({ url: `notifications/${id}/read`, method: "POST" }),
      invalidatesTags: ["Notifications"],
    }),
    markAllNotificationsRead: build.mutation<{ updated: number }, void>({
      query: () => ({ url: "notifications/read-all", method: "POST" }),
      invalidatesTags: ["Notifications"],
    }),
    notifyDesktopEnabled: build.mutation<{ sent: boolean }, void>({
      query: () => ({ url: "notifications/desktop-enabled", method: "POST" }),
    }),
    notifyDesktopDisabled: build.mutation<{ sent: boolean }, void>({
      query: () => ({ url: "notifications/desktop-disabled", method: "POST" }),
    }),
    listCases: build.query<{ results: Case[]; count: number }, { status?: string } | void>({
      query: (arg) => ({
        url: "cases",
        params: arg && arg.status ? { status: arg.status } : undefined,
      }),
      providesTags: ["Cases"],
    }),
    listDeletedCases: build.query<{ results: CaseDetail[]; count: number }, void>({
      query: () => "deleted-cases",
      providesTags: ["Cases"],
    }),
    listAllDisbursements: build.query<{ results: Disbursement[]; count: number }, void>({
      query: () => "disbursements",
      providesTags: ["Disbursements"],
    }),
    getCase: build.query<CaseDetail, string>({
      query: (uid) => ({ url: `cases/${uid}`, params: { include_deleted: "1" } }),
      providesTags: (_r, _e, uid) => [{ type: "Case", id: uid }],
    }),
    createCase: build.mutation<Case, Partial<Case>>({
      query: (body) => ({ url: "cases", method: "POST", body }),
      invalidatesTags: ["Cases"],
    }),
    deleteCase: build.mutation<void, string>({
      query: (uid) => ({ url: `cases/${uid}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, uid) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    restoreCase: build.mutation<CaseDetail, string>({
      query: (uid) => ({ url: `cases/${uid}/restore`, method: "POST" }),
      invalidatesTags: (_r, _e, uid) => [{ type: "Case", id: uid }, "Cases"],
    }),
    submitCase: build.mutation<{ status: string; event_id: number }, string>({
      query: (uid) => ({ url: `cases/${uid}/submit`, method: "POST" }),
      invalidatesTags: (_r, _e, uid) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    verifyCase: build.mutation<
      { status: string; current_step: number; sla_deadline: string; event_id: number },
      string
    >({
      query: (uid) => ({ url: `cases/${uid}/verify`, method: "POST" }),
      invalidatesTags: (_r, _e, uid) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    resendCaseStageEmail: build.mutation<{ stage: string; sent: number; failed: number }, string>({
      query: (uid) => ({
        url: `cases/${uid}/resend-stage-email`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, uid) => [{ type: "Case", id: uid }],
    }),
    advanceCase: build.mutation<
      {
        status: string;
        current_step: number;
        event_id: number;
        missing_required_slots?: string[];
        warning?: string;
      },
      { uid: string; notes?: string }
    >({
      query: ({ uid, notes }) => ({
        url: `cases/${uid}/advance`,
        method: "POST",
        body: { notes: notes ?? "" },
      }),
      invalidatesTags: (_r, _e, { uid }) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    rejectCase: build.mutation<{ status: string; event_id: number }, { uid: string; notes: string }>({
      query: ({ uid, notes }) => ({
        url: `cases/${uid}/reject`,
        method: "POST",
        body: { notes },
      }),
      invalidatesTags: (_r, _e, { uid }) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    deferCase: build.mutation<{ status: string; current_step: number; event_id: number; to_role: string }, { uid: string; notes: string }>({
      query: ({ uid, notes }) => ({
        url: `cases/${uid}/defer`,
        method: "POST",
        body: { notes },
      }),
      invalidatesTags: (_r, _e, { uid }) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    resumeCase: build.mutation<{ status: string; current_step: number; event_id: number | null; to_role: string }, { uid: string; notes?: string }>({
      query: ({ uid, notes }) => ({
        url: `cases/${uid}/resume`,
        method: "POST",
        body: { notes: notes ?? "" },
      }),
      invalidatesTags: (_r, _e, { uid }) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    setAmount: build.mutation<unknown, { uid: string; amount_xaf: number; reason: string }>({
      query: ({ uid, amount_xaf, reason }) => ({
        url: `cases/${uid}/amount`,
        method: "POST",
        body: { amount_xaf, reason },
      }),
      invalidatesTags: (_r, _e, { uid }) => [
        { type: "Case", id: uid },
        "Cases",
      ],
    }),
    listDisbursements: build.query<
      {
        results: Array<{
          id: number;
          amount_xaf: number;
          purpose: string;
          recipient_kind: string;
          recipient_kind_other: string;
          recipient_name: string;
          payment_date: string;
          payment_reference: string;
          proof_of_payment_id: number | null;
          proof_of_payment?: {
            id: number;
            submission_id: number;
            filename: string;
            mime: string;
            size_bytes: number;
          } | null;
          paid_by: string;
          created_at: string;
          notes: string;
        }>;
        count: number;
        authorized_xaf: number;
        disbursed_xaf: number;
        remaining_xaf: number;
        utilization_pct: number;
        approaching_limit: boolean;
      },
      string
    >({
      query: (uid) => `cases/${uid}/disbursements`,
      providesTags: (_r, _e, uid) => [{ type: "Disbursements", id: uid }],
    }),
    recordDisbursement: build.mutation<
      {
        id: number;
        amount_xaf: number;
        disbursed_total_xaf: number;
        authorized_xaf: number;
        remaining_xaf: number;
      },
      {
        caseUid: string;
        body: {
          amount_xaf: number;
          purpose: string;
          recipient_kind: string;
          recipient_kind_other?: string;
          recipient_name: string;
          payment_date: string;
          payment_reference: string;
          notes: string;
          proof_of_payment_id?: number | null;
        };
      }
    >({
      query: ({ caseUid, body }) => ({
        url: `cases/${caseUid}/disbursements`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { caseUid }) => [
        { type: "Disbursements", id: caseUid },
        { type: "Case", id: caseUid },
        "Cases",
      ],
    }),
    updateDisbursement: build.mutation<
      {
        id: number;
        amount_xaf: number;
        purpose: string;
        recipient_kind: string;
        recipient_name: string;
        payment_date: string;
        payment_reference: string;
        proof_of_payment_id: number | null;
        notes: string;
        paid_by: string;
        created_at: string;
        changes: string[];
      },
      {
        caseUid: string;
        disbursementId: number;
        body: Partial<{
          amount_xaf: number;
          purpose: string;
          recipient_kind: string;
          recipient_kind_other: string;
          recipient_name: string;
          payment_date: string;
          payment_reference: string;
          notes: string;
          proof_of_payment_id: number | null;
        }>;
      }
    >({
      query: ({ caseUid, disbursementId, body }) => ({
        url: `cases/${caseUid}/disbursements/${disbursementId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, { caseUid }) => [
        { type: "Disbursements", id: caseUid },
        { type: "Case", id: caseUid },
        "Cases",
      ],
    }),
    deleteDisbursement: build.mutation<
      void,
      { caseUid: string; disbursementId: number }
    >({
      query: ({ caseUid, disbursementId }) => ({
        url: `cases/${caseUid}/disbursements/${disbursementId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { caseUid }) => [
        { type: "Disbursements", id: caseUid },
        { type: "Case", id: caseUid },
        "Cases",
      ],
    }),
    attachDisbursementProof: build.mutation<
      {
        id: number;
        proof_of_payment_id: number;
        filename: string;
        mime: string;
        size_bytes: number;
      },
      { caseUid: string; disbursementId: number; proof_of_payment_id: number }
    >({
      query: ({ caseUid, disbursementId, proof_of_payment_id }) => ({
        url: `cases/${caseUid}/disbursements/${disbursementId}/proof`,
        method: "POST",
        body: { proof_of_payment_id },
      }),
      invalidatesTags: (_r, _e, { caseUid }) => [
        { type: "Disbursements", id: caseUid },
        { type: "Case", id: caseUid },
      ],
    }),
    listDisbursementHistory: build.query<
      {
        results: Array<{
          id: number;
          actor_email: string;
          actor_role: string;
          event_type: string;
          occurred_at: string;
          notes: string;
          from_step: number | null;
          to_step: number | null;
          idempotency_key: string;
        }>;
        count: number;
      },
      string
    >({
      query: (uid) => `cases/${uid}/disbursements/history`,
      providesTags: (_r, _e, uid) => [{ type: "Disbursements", id: uid }],
    }),
    listForms: build.query<{ results: FormDefinition[]; count: number }, void>({
      query: () => "forms",
      providesTags: ["Forms"],
    }),
    getForm: build.query<FormDefinition, string>({
      query: (slug) => `forms/${slug}`,
      providesTags: (_r, _e, slug) => [{ type: "Form", id: slug }],
    }),
    submitForm: build.mutation<
      { id: number; case_uid: string; form: string; submitted_at: string },
      { slug: string; version: number; case_uid: string; payload: Record<string, unknown> }
    >({
      query: ({ slug, version, case_uid, payload }) => ({
        url: `forms/${slug}/v${version}/submissions`,
        method: "POST",
        body: { case_uid, payload },
      }),
      invalidatesTags: (_r, _e, { case_uid }) => [
        { type: "Case", id: case_uid },
        "Cases",
      ],
    }),
    listSubmissions: build.query<
      {
        results: Array<{
          id: number;
          form: string;
          submitted_at: string;
          submitted_by: string;
          role_at_submission: string;
          payload: Record<string, unknown>;
          attachments: Array<{
            id: number;
            filename: string;
            mime: string;
            size_bytes: number;
            sha256?: string;
            scan_status: string;
            file_type?: string;
            description?: string;
            uploaded_by?: string;
            uploaded_by_name?: string;
            uploaded_at?: string;
            deleted_at?: string | null;
            superseded_by_id?: number | null;
            is_current?: boolean;
          }>;
        }>;
        count: number;
      },
      { uid: string; includeBag?: boolean }
    >({
      query: ({ uid, includeBag }) =>
        `cases/${uid}/submissions${includeBag ? "?include_bag=1" : ""}`,
      providesTags: (_r, _e, { uid }) => [{ type: "Submissions", id: uid }],
    }),
    listSlotHistory: build.query<
      {
        case_uid: string;
        file_type: string;
        results: Array<{
          id: number;
          filename: string;
          uploaded_at: string;
          uploaded_by: string;
          uploaded_by_name: string;
          is_current: boolean;
          deleted_at: string | null;
          superseded_by_id: number | null;
          scan_status: string;
          size_bytes: number;
          mime: string;
          submission_id: number;
          description: string;
        }>;
        count: number;
      },
      { caseUid: string; fileType: string }
    >({
      query: ({ caseUid, fileType }) =>
        `cases/${caseUid}/slots/${encodeURIComponent(fileType)}/history`,
      providesTags: (_r, _e, { caseUid }) => [
        { type: "Submissions", id: caseUid },
        { type: "Case", id: caseUid },
      ],
    }),
    presignUpload: build.mutation<PresignResult, {
      filename: string;
      mime: string;
      size: number;
      case_uid: string;
      submission_id?: number;
      file_type?: string;
      description?: string;
      uploaded_by_name?: string;
    }>({
      query: (body) => ({ url: "uploads/presign", method: "POST", body }),
    }),
    finishUpload: build.mutation<
      { id: number; key: string; sha256: string; file_type?: string; description?: string; uploaded_by_name?: string; submission_id?: number },
      {
        key: string;
        filename: string;
        mime: string;
        size: number;
        sha256: string;
        submission_id?: number;
        case_uid?: string;
        file_type?: string;
        description?: string;
        uploaded_by_name?: string;
      }
    >({
      query: (body) => ({ url: "uploads/finish", method: "POST", body }),
      invalidatesTags: (_r, _e, body) =>
        body.case_uid
          ? [{ type: "Submissions", id: body.case_uid }, { type: "Case", id: body.case_uid }]
          : ["Submissions", "Case"],
    }),
    deleteAttachment: build.mutation<
      { id: number; submission_id: number; case_uid: string; filename: string; deleted_by: string },
      { submissionId: number; attachmentId: number; caseUid: string }
    >({
      query: ({ submissionId, attachmentId }) => ({
        url: `submission/${submissionId}/attachment/${attachmentId}/delete`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: "Submissions", id: arg.caseUid },
        { type: "Case", id: arg.caseUid },
      ],
    }),
    replaceAttachment: build.mutation<
      {
        old_attachment: { id: number; filename: string; file_type: string | null; superseded_by_id: number | null };
        new_attachment: { id: number; filename: string; file_type: string | null };
        case_uid: string;
      },
      { submissionId: number; attachmentId: number; caseUid: string; newAttachmentId: number }
    >({
      query: ({ submissionId, attachmentId, newAttachmentId }) => ({
        url: `submission/${submissionId}/attachment/${attachmentId}/replace`,
        method: "POST",
        body: { new_attachment_id: newAttachmentId },
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: "Submissions", id: arg.caseUid },
        { type: "Case", id: arg.caseUid },
      ],
    }),
  }),
});

// ----- Admin endpoints (separate API instance, still using fetchBaseQuery) -----

export interface AuditEvent {
  id: number;
  case_uid: string;
  actor_email: string;
  actor_role: string;
  occurred_at: string;
  event_type: string;
  from_step: number | null;
  to_step: number | null;
  notes: string;
  payload_hash: string;
}

export interface AdminUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: "CB" | "DP" | "AB" | "WCS" | "DGFC" | "DGFAP" | "MINISTER" | "ADMIN" | "SUPER_ADMIN";
  roles: AdminUser["role"][];
  role_assignments: { id: number; role: AdminUser["role"]; assigned_at: string; expires_at: string | null; revoked_at: string | null; reason: string; active: boolean }[];
  phone: string;
  preferred_language: "en" | "fr";
  is_2fa_enabled: boolean;
  requires_2fa: boolean;
  is_active: boolean;
  village: number | null;
  telegram_chat_id: string;
}

function authHeader(getState: () => unknown): HeadersInit {
  const token = (getState() as RootState).auth.accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function adminJson<T>(path: string, init: RequestInit, getState: () => unknown): Promise<T> {
  const r = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(getState),
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const text = await r.text();
    let detail = `Request failed: ${r.status}`;
    try {
      const j = JSON.parse(text) as { detail?: string };
      detail = j.detail || detail;
    } catch {
      if (text.includes("<!DOCTYPE html>")) detail = `${detail} (server returned an HTML error page)`;
    }
    throw new Error(detail);
  }
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The server returned an invalid response. Check that the API is running and the request URL is correct.");
  }
}

export async function listAuditEvents(opts: { case_uid?: string; actor_email?: string; event_type?: string; signal?: AbortSignal } = {}): Promise<{ results: AuditEvent[]; count: number }> {
  const params = new URLSearchParams();
  if (opts.case_uid) params.set("case_uid", opts.case_uid);
  if (opts.actor_email) params.set("actor_email", opts.actor_email);
  if (opts.event_type) params.set("event_type", opts.event_type);
  const qs = params.toString();
  // Direct fetch — handled outside RTK Query for simplicity
  const { store } = await import("@/store");
  return adminJson(`/admin/audit${qs ? `?${qs}` : ""}`, { method: "GET", signal: opts.signal }, () => store.getState());
}

export async function downloadReport(opts: { year: number; quarter?: number; format: "pdf" | "xlsx" }): Promise<Blob> {
  const { store } = await import("@/store");
  const params = new URLSearchParams({ year: String(opts.year), format: opts.format });
  if (opts.quarter) params.set("q", String(opts.quarter));
  const r = await fetch(`/api/v1/reports/${opts.quarter ? "quarterly" : "annual"}?${params.toString()}`, {
    headers: authHeader(() => store.getState()),
  });
  if (!r.ok) throw new Error(`Report download failed: ${r.status}`);
  return await r.blob();
}

export async function listAdminUsers(q?: string): Promise<{ results: AdminUser[]; count: number }> {
  const { store } = await import("@/store");
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return adminJson(`/users${qs}`, { method: "GET" }, () => store.getState());
}

export async function createAdminUser(body: Partial<AdminUser>): Promise<AdminUser> {
  const { store } = await import("@/store");
  return adminJson("/users", { method: "POST", body: JSON.stringify(body) }, () => store.getState());
}

export async function updateAdminUser(id: number, body: Partial<AdminUser> & { password?: string }): Promise<AdminUser> {
  const { store } = await import("@/store");
  return adminJson(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }, () => store.getState());
}

export async function deleteAdminUser(id: number): Promise<void> {
  const { store } = await import("@/store");
  return adminJson(`/users/${id}`, { method: "DELETE" }, () => store.getState());
}

export async function assignUserRole(id: number, body: { role: AdminUser["role"]; expires_at?: string | null; reason?: string }): Promise<AdminUser> {
  const { store } = await import("@/store");
  return adminJson(`/users/${id}/roles`, { method: "POST", body: JSON.stringify(body) }, () => store.getState());
}

export async function revokeUserRole(id: number, role: AdminUser["role"]): Promise<AdminUser> {
  const { store } = await import("@/store");
  return adminJson(`/users/${id}/roles`, { method: "DELETE", body: JSON.stringify({ role }) }, () => store.getState());
}

export async function exportPayments(format: "csv" | "sepa", caseUids?: string[]): Promise<{ key: string; size: number; sha256: string; rows: number; download_url: string | null }> {
  const { store } = await import("@/store");
  return adminJson("/payments/export", { method: "POST", body: JSON.stringify({ format, case_uids: caseUids }) }, () => store.getState());
}

export async function pushMobileMoney(body: { case_uid: string; provider: "moov" | "airtel"; phone: string }): Promise<{ reference: string; status: string; provider: string }> {
  const { store } = await import("@/store");
  return adminJson("/payments/mobile-money", { method: "POST", body: JSON.stringify(body) }, () => store.getState());
}

export async function confirmCasePayment(uid: string, body: { proof_reference: string; channel: "cash" | "mobile" | "bank" }): Promise<{ status: string; event_id: number }> {
  const { store } = await import("@/store");
  return adminJson(`/payments/${uid}/confirm`, { method: "POST", body: JSON.stringify(body) }, () => store.getState());
}

export async function closeCase(uid: string, notes: string = ""): Promise<{ status: string; event_id: number }> {
  const { store } = await import("@/store");
  return adminJson(`/cases/${uid}/close`, { method: "POST", body: JSON.stringify({ notes }) }, () => store.getState());
}

export const {
  useMeQuery,
  usePatchMeMutation,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useNotifyDesktopEnabledMutation,
  useNotifyDesktopDisabledMutation,
  useListCasesQuery,
  useListDeletedCasesQuery,
  useListAllDisbursementsQuery,
  useGetCaseQuery,
  useCreateCaseMutation,
  useDeleteCaseMutation,
  useRestoreCaseMutation,
  useSubmitCaseMutation,
  useVerifyCaseMutation,
  useResendCaseStageEmailMutation,
  useAdvanceCaseMutation,
  useRejectCaseMutation,
  useDeferCaseMutation,
  useResumeCaseMutation,
  useSetAmountMutation,
  useListDisbursementsQuery,
  useRecordDisbursementMutation,
  useUpdateDisbursementMutation,
  useDeleteDisbursementMutation,
  useAttachDisbursementProofMutation,
  useListDisbursementHistoryQuery,
  useListFormsQuery,
  useGetFormQuery,
  useSubmitFormMutation,
  useListSubmissionsQuery,
  useListSlotHistoryQuery,
  usePresignUploadMutation,
  useFinishUploadMutation,
  useDeleteAttachmentMutation,
  useReplaceAttachmentMutation,
} = hecApi;
