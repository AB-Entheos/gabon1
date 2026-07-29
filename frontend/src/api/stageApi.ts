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

export interface StageCounts {
  drafts: number;
  submitted: number;
  verified: number;
  by_step: Record<"2" | "3" | "4" | "5" | "6", number>;
  approved: number;
  closed: number;
  rejected: number;
  total: number;
}

export const stageApi = createApi({
  reducerPath: "stageApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Stages", "Comment"],
  endpoints: (build) => ({
    getStages: build.query<StageCounts, void>({
      query: () => "cases-stages",
      providesTags: ["Stages"],
    }),
    postComment: build.mutation<
      { event_id: number; notes: string; actor_role: string },
      { uid: string; notes: string }
    >({
      query: ({ uid, notes }) => ({
        url: `cases/${uid}/comment`,
        method: "POST",
        body: { notes },
      }),
      invalidatesTags: (_r, _e, { uid }) => [{ type: "Comment", id: uid }],
    }),
  }),
});

export const { useGetStagesQuery, usePostCommentMutation } = stageApi;
