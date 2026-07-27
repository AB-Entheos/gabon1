import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import { hecApi } from "@/api/hecApi";
import { stageApi } from "@/api/stageApi";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [hecApi.reducerPath]: hecApi.reducer,
    [stageApi.reducerPath]: stageApi.reducer,
  },
  middleware: (gDM) => gDM().concat(hecApi.middleware, stageApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
