import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import { Lock } from "lucide-react";
import type { SiteSetting } from "@/lib/types";

export default function ProtectedLayout() {
  const { user, loading, profile, isAdmin } = useAuth();

  const { data: maintenance } = useQuery({
    queryKey: ["maintenance-mode"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("site_settings")
        .select("*")
        .eq("key", "maintenance_mode")
        .single();
      return data as SiteSetting | null;
    },
  });

  const isMaintenanceOn = (maintenance?.value as any)?.enabled === true;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (profile?.is_banned) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <h1 className="text-2xl font-bold text-destructive">Account Banned</h1>
        <p className="mt-2 text-muted-foreground">Your account has been suspended.</p>
      </div>
    );
  }

  if (isMaintenanceOn && !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <Lock className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold">Under Maintenance</h1>
        <p className="mt-2 text-muted-foreground">{(maintenance?.value as any)?.message || "We'll be back soon."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Outlet />
    </div>
  );
}
