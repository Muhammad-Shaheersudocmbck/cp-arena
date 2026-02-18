import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useWebNotifications() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Listen for new DMs
    const dmChannel = supabase
      .channel(`web-notif-dm-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `receiver_id=eq.${profile.id}`,
        },
        async (payload) => {
          if (document.hasFocus()) return;
          if ("Notification" in window && Notification.permission === "granted") {
            const msg = payload.new as any;
            // Get sender name
            const { data: sender } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", msg.sender_id)
              .single();
            new Notification(`Message from ${sender?.username || "Someone"}`, {
              body: msg.message?.substring(0, 100),
              icon: "/favicon.ico",
              tag: `dm-${msg.id}`,
            });
          }
        }
      )
      .subscribe();

    // Listen for new notifications
    const notifChannel = supabase
      .channel(`web-notif-notif-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (document.hasFocus()) return;
          if ("Notification" in window && Notification.permission === "granted") {
            const notif = payload.new as any;
            new Notification(notif.title, {
              body: notif.message?.substring(0, 100),
              icon: "/favicon.ico",
              tag: `notif-${notif.id}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dmChannel);
      supabase.removeChannel(notifChannel);
    };
  }, [profile?.id]);
}
