import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AuthSplash } from "@/auth/guards";

export default function Home() {
  const { status, activeTenant } = useAuth();

  if (status === "loading") return <AuthSplash />;
  if (status === "unauthenticated") return <Navigate to="/sign-in" replace />;
  if (!activeTenant) return <Navigate to="/select-workspace" replace />;
  return <Navigate to={`/queries?tenantSlug=${activeTenant.slug}`} replace />;
}
