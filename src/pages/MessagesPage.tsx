import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Send, ArrowLeft, Pencil, Trash2, Reply, X } from "lucide-react";
import { toast } from "sonner";
import { getRankColor, SAFE_PROFILE_COLUMNS } from "@/lib/types";
import RatingBadge from "@/components/RatingBadge";
import type { Profile, DirectMessage } from "@/lib/types";

export default function MessagesPage() {
  const { recipientId } = useParams();
  const { profile } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<(DirectMessage & { senderProfile?: Profile })[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<(DirectMessage & { senderProfile?: Profile }) | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const channelName = profile && recipientId
    ? `typing-${[profile.id, recipientId].sort().join("-")}`
    : null;

  const { data: recipient } = useQuery({
    queryKey: ["recipient", recipientId],
    enabled: !!recipientId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", recipientId!).single();
      return data as Profile;
    },
  });

  useQuery({
    queryKey: ["dms", profile?.id, recipientId],
    enabled: !!profile && !!recipientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${profile!.id},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${profile!.id})`)
        .order("created_at", { ascending: true });

      if (data) {
        const enriched = (data as any[]).map((msg: any) => ({
          ...msg,
          senderProfile: msg.sender_id === profile!.id ? profile : recipient,
        }));
        setMessages(enriched);

        await supabase
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() } as any)
          .eq("sender_id", recipientId!)
          .eq("receiver_id", profile!.id)
          .is("read_at", null);
      }
      return data;
    },
  });

  // Realtime messages
  useEffect(() => {
    if (!profile || !recipientId) return;
    const channel = supabase
      .channel(`dm-${[profile.id, recipientId].sort().join("-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const msg = payload.new as DirectMessage;
          if (
            (msg.sender_id === profile.id && msg.receiver_id === recipientId) ||
            (msg.sender_id === recipientId && msg.receiver_id === profile.id)
          ) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, { ...msg, senderProfile: msg.sender_id === profile.id ? profile : recipient || undefined }];
            });
            if (msg.sender_id === recipientId) {
              supabase.from("direct_messages").update({ read_at: new Date().toISOString() } as any).eq("id", msg.id).then(() => {});
            }
          }
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as DirectMessage;
          setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m));
        } else if (payload.eventType === "DELETE") {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, recipientId, recipient]);

  // Typing indicator
  useEffect(() => {
    if (!channelName || !profile) return;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload?.userId !== profile.id) {
          setPeerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [channelName, profile?.id]);

  const handleTyping = () => {
    if (!channelName || !profile) return;
    if (!isTyping) {
      setIsTyping(true);
      supabase.channel(channelName).send({ type: "broadcast", event: "typing", payload: { userId: profile.id } });
      setTimeout(() => setIsTyping(false), 2000);
    }
  };

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim() || !profile || !recipientId) return;
    const text = message.trim();
    setMessage("");
    const replyId = replyTo?.id || null;
    setReplyTo(null);

    const optimisticMsg: DirectMessage & { senderProfile?: Profile } = {
      id: crypto.randomUUID(),
      sender_id: profile.id,
      receiver_id: recipientId,
      message: text,
      read_at: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      reply_to: replyId,
      senderProfile: profile,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const { error } = await supabase.from("direct_messages").insert({
      sender_id: profile.id, receiver_id: recipientId, message: text, reply_to: replyId,
    } as any);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      toast.error("Failed to send message");
    }
  };

  const editMessage = async (id: string) => {
    if (!editText.trim()) return;
    const { error } = await supabase.from("direct_messages")
      .update({ message: editText.trim(), edited_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) toast.error("Failed to edit");
    else setMessages((prev) => prev.map((m) => m.id === id ? { ...m, message: editText.trim(), edited_at: new Date().toISOString() } : m));
    setEditingId(null);
    setEditText("");
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("direct_messages").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const getReplyMessage = (replyId: string | null) => {
    if (!replyId) return null;
    return messages.find((m) => m.id === replyId);
  };

  if (!profile) return null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link to="/friends" className="rounded-lg p-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
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

      <div className="rounded-2xl border border-border bg-card">
        <div ref={chatRef} className="h-[60vh] overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No messages yet</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const isMine = msg.sender_id === profile.id;
                const replied = getReplyMessage(msg.reply_to);
                return (
                  <div key={msg.id} className={`group flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[70%]">
                      {/* Reply reference */}
                      {replied && (
                        <div className={`mb-1 rounded-lg border-l-2 border-primary/40 bg-secondary/50 px-3 py-1 text-xs text-muted-foreground`}>
                          <span className="font-semibold">{replied.senderProfile?.username || "User"}</span>: {replied.message.slice(0, 60)}{replied.message.length > 60 ? "..." : ""}
                        </div>
                      )}
                      <div className={`relative rounded-2xl px-4 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                        {/* Edit mode */}
                        {editingId === msg.id ? (
                          <div className="flex gap-1">
                            <input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && editMessage(msg.id)} className="flex-1 rounded bg-background/20 px-2 py-1 text-sm text-foreground" autoFocus />
                            <button onClick={() => editMessage(msg.id)} className="text-xs font-medium">✓</button>
                            <button onClick={() => setEditingId(null)} className="text-xs font-medium">✗</button>
                          </div>
                        ) : (
                          <>
                            {msg.message}
                            {msg.edited_at && <span className="ml-1 text-[10px] opacity-60">(edited)</span>}
                          </>
                        )}
                        <p className={`mt-1 text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {/* Action buttons */}
                        <div className={`absolute -top-3 ${isMine ? "left-0" : "right-0"} hidden gap-0.5 group-hover:flex`}>
                          <button onClick={() => setReplyTo(msg)} className="rounded bg-card p-1 text-muted-foreground shadow hover:text-foreground" title="Reply">
                            <Reply className="h-3 w-3" />
                          </button>
                          {isMine && (
                            <>
                              <button onClick={() => { setEditingId(msg.id); setEditText(msg.message); }} className="rounded bg-card p-1 text-muted-foreground shadow hover:text-foreground" title="Edit">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => deleteMessage(msg.id)} className="rounded bg-card p-1 text-destructive shadow hover:text-destructive" title="Delete">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {peerTyping && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
              </div>
              {recipient?.username} is typing...
            </div>
          )}
        </div>

        {/* Reply bar */}
        {replyTo && (
          <div className="flex items-center gap-2 border-t border-border bg-secondary/30 px-4 py-2 text-xs text-muted-foreground">
            <Reply className="h-3 w-3" />
            Replying to <span className="font-semibold">{replyTo.senderProfile?.username || "User"}</span>: {replyTo.message.slice(0, 40)}
            <button onClick={() => setReplyTo(null)} className="ml-auto"><X className="h-3 w-3" /></button>
          </div>
        )}

        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => { setMessage(e.target.value); handleTyping(); }}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <button onClick={sendMessage} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"><Send className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
