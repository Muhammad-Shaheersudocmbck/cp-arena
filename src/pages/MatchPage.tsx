import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { ExternalLink, Send, Clock, Trophy, Eye } from "lucide-react";
import RatingBadge from "@/components/RatingBadge";
import type { Profile, Match, MatchMessage } from "@/lib/types";

export default function MatchPage() {
  const { matchId } = useParams();
  const { profile } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<(MatchMessage & { profile?: Profile })[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);

  const { data: match } = useQuery({
    queryKey: ["match", matchId],
    enabled: !!matchId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("*").eq("id", matchId!).single();
      return data as Match;
    },
  });

  const { data: player1 } = useQuery({
    queryKey: ["player", match?.player1_id],
    enabled: !!match?.player1_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", match!.player1_id).single();
      return data as Profile;
    },
  });

  const { data: player2 } = useQuery({
    queryKey: ["player", match?.player2_id],
    enabled: !!match?.player2_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", match!.player2_id!).single();
      return data as Profile;
    },
  });

  // Timer
  useEffect(() => {
    if (!match?.start_time || match.status !== "active") return;
    const interval = setInterval(() => {
      const endTime = new Date(match.start_time!).getTime() + match.duration * 1000;
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [match]);

  // Realtime messages
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`match-chat-${matchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_messages", filter: `match_id=eq.${matchId}` },
        async (payload) => {
          const msg = payload.new as MatchMessage;
          const { data: p } = await supabase.from("profiles").select("*").eq("id", msg.user_id).single();
          setMessages((prev) => [...prev, { ...msg, profile: p || undefined }]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // Load initial messages
  useQuery({
    queryKey: ["match-messages", matchId],
    enabled: !!matchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("match_messages")
        .select("*")
        .eq("match_id", matchId!)
        .order("created_at", { ascending: true });
      if (data) {
        const enriched = await Promise.all(
          data.map(async (msg) => {
            const { data: p } = await supabase.from("profiles").select("*").eq("id", msg.user_id).single();
            return { ...msg, profile: p || undefined };
          })
        );
        setMessages(enriched);
      }
      return data;
    },
  });

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim() || !profile || !matchId) return;
    await supabase.from("match_messages").insert({
      match_id: matchId,
      user_id: profile.id,
      message: message.trim(),
    });
    setMessage("");
  };

  const isSpectator = profile && match && match.player1_id !== profile.id && match.player2_id !== profile.id;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const problemUrl = match?.contest_id && match?.problem_index
    ? `https://codeforces.com/problemset/problem/${match.contest_id}/${match.problem_index}`
    : null;

  if (!match) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      {/* Match header */}
      <div className="mb-6 rounded-2xl border border-border arena-card p-6">
        {isSpectator && (
          <div className="mb-3 flex items-center gap-2 text-sm text-neon-cyan">
            <Eye className="h-4 w-4" /> Spectating
          </div>
        )}

        {/* Timer */}
        <div className="mb-4 text-center">
          {match.status === "active" ? (
            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-2xl font-bold ${timeLeft < 60 ? "text-destructive animate-pulse" : "text-primary"}`}>
              <Clock className="h-5 w-5" />
              {formatTime(timeLeft)}
            </div>
          ) : match.status === "finished" ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium">
              <Trophy className="h-4 w-4 text-neon-orange" />
              Match Finished
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Waiting for opponent...</div>
          )}
        </div>

        {/* Players vs */}
        <div className="flex items-center justify-between gap-4">
          {/* Player 1 */}
          <div className="flex-1 text-center">
            {player1 && (
              <div className="flex flex-col items-center gap-2">
                <img src={player1.avatar || ""} alt="" className="h-16 w-16 rounded-full" />
                <p className="font-display font-semibold">{player1.username}</p>
                <RatingBadge rating={player1.rating} size="sm" />
                {match.player1_solved_at && (
                  <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-mono text-primary">✓ Solved</span>
                )}
                {match.status === "finished" && match.player1_rating_change != null && (
                  <span className={`animate-rating-pop font-mono text-sm font-bold ${match.player1_rating_change > 0 ? "text-primary" : "text-destructive"}`}>
                    {match.player1_rating_change > 0 ? "+" : ""}{match.player1_rating_change}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center">
            <span className="font-display text-2xl font-bold text-muted-foreground">VS</span>
          </div>

          {/* Player 2 */}
          <div className="flex-1 text-center">
            {player2 ? (
              <div className="flex flex-col items-center gap-2">
                <img src={player2.avatar || ""} alt="" className="h-16 w-16 rounded-full" />
                <p className="font-display font-semibold">{player2.username}</p>
                <RatingBadge rating={player2.rating} size="sm" />
                {match.player2_solved_at && (
                  <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-mono text-primary">✓ Solved</span>
                )}
                {match.status === "finished" && match.player2_rating_change != null && (
                  <span className={`animate-rating-pop font-mono text-sm font-bold ${match.player2_rating_change > 0 ? "text-primary" : "text-destructive"}`}>
                    {match.player2_rating_change > 0 ? "+" : ""}{match.player2_rating_change}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground">Waiting...</div>
            )}
          </div>
        </div>

        {/* Problem link */}
        {problemUrl && (
          <div className="mt-6 text-center">
            <a
              href={problemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-6 py-3 font-display font-semibold text-primary transition-all hover:glow-green"
            >
              <ExternalLink className="h-4 w-4" />
              Open Problem: {match.contest_id}{match.problem_index}
              {match.problem_name && ` - ${match.problem_name}`}
            </a>
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-display font-semibold">Match Chat</h3>
        </div>
        <div ref={chatRef} className="h-64 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No messages yet</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2">
                  <img
                    src={msg.profile?.avatar || ""}
                    alt=""
                    className="h-6 w-6 rounded-full"
                  />
                  <div>
                    <span className="text-xs font-semibold text-primary">
                      {msg.profile?.username || "User"}
                    </span>
                    <p className="text-sm text-foreground">{msg.message}</p>
                  </div>
                </div>
              ))}
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
