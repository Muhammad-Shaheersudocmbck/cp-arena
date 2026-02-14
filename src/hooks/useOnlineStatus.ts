import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOnlineStatus() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;

    const updateOnline = async () => {
      await supabase.from("profiles").update({ online_at: new Date().toISOString() }).eq("id", profile.id);
    };

    // Update immediately and every 2 minutes
    updateOnline();
    const interval = setInterval(updateOnline, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [profile?.id]);
}
