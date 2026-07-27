import { type ReactNode } from "react";
import { useSelector } from "react-redux";
import type { Role } from "@/store/authSlice";
import type { RootState } from "@/store";

interface Props {
  allow: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

export default function RoleGate({ allow, children, fallback = null }: Props) {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return <>{fallback}</>;
  if (!allow.includes(user.role)) return <>{fallback}</>;
  return <>{children}</>;
}
