import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Send, ArrowLeft } from "lucide-react";
import { getRankColor, SAFE_PROFILE_COLUMNS } from "@/lib/types";
import RatingBadge from "@/components/RatingBadge";
import type { Profile, DirectMessage } from "@/lib/types";

export default function MessagesPage() {
  const { recipientId } = useParams();
  const { profile } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<(DirectMessage & { senderProfile?: Profile })[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  const { data: recipient } = useQuery({
    queryKey: ["recipient", recipientId],
    enabled: !!recipientId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", recipientId!).single();
      return data as Profile;
    },
  });

  // Load messages
  useQuery({
    queryKey: ["dms", profile?.id, recipientId],
    enabled: !!profile && !!recipientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("direct_messages" as any)
        .select("*")
        .or(
          `and(sender_id.eq.${profile!.id},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${profile!.id})`
        )
        .order("created_at", { ascending: true });

      if (data) {
        const enriched = (data as any[]).map((msg: any) => ({
          ...msg,
          senderProfile: msg.sender_id === profile!.id ? profile : recipient,
        }));
        setMessages(enriched);

        // Mark received messages as read
        await supabase
          .from("direct_messages" as any)
          .update({ read_at: new Date().toISOString() } as any)
          .eq("sender_id", recipientId!)
          .eq("receiver_id", profile!.id)
          .is("read_at", null);
      }
      return data;
    },
  });

  // Realtime
  useEffect(() => {
    if (!profile || !recipientId) return;
    const channel = supabase
      .channel(`dm-${[profile.id, recipientId].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as DirectMessage;
          if (
            (msg.sender_id === profile.id && msg.receiver_id === recipientId) ||
            (msg.sender_id === recipientId && msg.receiver_id === profile.id)
          ) {
            setMessages((prev) => [
              ...prev,
              { ...msg, senderProfile: msg.sender_id === profile.id ? profile : recipient || undefined },
            ]);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, recipientId, recipient]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim() || !profile || !recipientId) return;
    await supabase.from("direct_messages" as any).insert({
      sender_id: profile.id,
      receiver_id: recipientId,
      message: message.trim(),
    } as any);
    setMessage("");
  };

  if (!profile) return null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link to="/friends" className="rounded-lg p-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {recipient && (
          <Link to={`/profile/${recipient.id}`} className="flex items-center gap-3">
            <img src={recipient.avatar || ""} alt="" className="h-10 w-10 rounded-full" />
            <div>
              <p className={`font-semibold ${getRankColor(recipient.rating)}`}>{recipient.username}</p>
              <RatingBadge rating={recipient.rating} size="sm" />
            </div>
          </Link>
        )}
      </div>

      {/* Chat */}
      <div className="rounded-2xl border border-border bg-card">
        <div ref={chatRef} className="h-[60vh] overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No messages yet</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const isMine = msg.sender_id === profile.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                        isMine
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {msg.message}
                      <p className={`mt-1 text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={sendMessage}
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
