import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type Role = "CB" | "AB" | "WCS" | "DGFC" | "DGFAP" | "MINISTER" | "ADMIN" | "SUPER_ADMIN";
export type Language = "en" | "fr";
export type Theme = "light" | "dark";

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  first_name?: string;
  last_name?: string;
  preferred_language: Language;
  is_2fa_enabled: boolean;
  requires_2fa: boolean;
  must_change_password?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  language: Language;
  theme: Theme;
}

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("hec.theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("hec.user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

const initialState: AuthState = {
  user: readStoredUser(),
  accessToken: localStorage.getItem("hec.access") ?? null,
  refreshToken: localStorage.getItem("hec.refresh") ?? null,
  language: (localStorage.getItem("hec.lang") as Language) ?? "fr",
  theme: readTheme(),
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{
        user: AuthUser;
        access: string;
        refresh: string;
      }>
    ) {
      state.user = action.payload.user;
      state.accessToken = action.payload.access;
      state.refreshToken = action.payload.refresh;
      localStorage.setItem("hec.access", action.payload.access);
      localStorage.setItem("hec.refresh", action.payload.refresh);
      localStorage.setItem("hec.user", JSON.stringify(action.payload.user));
    },
    setUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      localStorage.setItem("hec.user", JSON.stringify(action.payload));
    },
    setLanguage(state, action: PayloadAction<Language>) {
      state.language = action.payload;
      localStorage.setItem("hec.lang", action.payload);
    },
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      localStorage.setItem("hec.theme", action.payload);
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", action.payload === "dark");
      }
    },
    toggleTheme(state) {
      const next: Theme = state.theme === "dark" ? "light" : "dark";
      state.theme = next;
      localStorage.setItem("hec.theme", next);
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next === "dark");
      }
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      localStorage.removeItem("hec.access");
      localStorage.removeItem("hec.refresh");
      localStorage.removeItem("hec.user");
    },
  },
});

export const { setCredentials, setUser, setLanguage, setTheme, toggleTheme, logout } = authSlice.actions;
export default authSlice.reducer;
