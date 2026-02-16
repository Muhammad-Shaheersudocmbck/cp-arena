import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { ExternalLink, Send, Clock, Trophy, Flag, Handshake, ShieldAlert, Bot } from "lucide-react";
import { toast } from "sonner";
import RatingBadge from "@/components/RatingBadge";
import type { Profile, Match, MatchMessage } from "@/lib/types";
import { SAFE_PROFILE_COLUMNS } from "@/lib/types";

export default function MatchPage() {
  const { matchId } = useParams();
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<(MatchMessage & { profile?: Partial<Profile> })[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);

  const { data: match, refetch: refetchMatch } = useQuery({
    queryKey: ["match", matchId],
    enabled: !!matchId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("*").eq("id", matchId!).single();
      return data as Match & { draw_offered_by?: string | null; resigned_by?: string | null };
    },
  });

  const isBotMatch = match?.match_type === "bot";

  const { data: player1 } = useQuery({
    queryKey: ["player", match?.player1_id],
    enabled: !!match?.player1_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", match!.player1_id).single();
      return data as Profile;
    },
  });

  const { data: player2 } = useQuery({
    queryKey: ["player", match?.player2_id],
    enabled: !!match?.player2_id && !isBotMatch,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", match!.player2_id!).single();
      return data as Profile;
    },
  });

  // Poll arena-engine for CF submission detection every 20 seconds
  useEffect(() => {
    if (!match || match.status !== "active" || !profile) return;
    
    const pollSubmissions = async () => {
      try {
        await supabase.functions.invoke("arena-engine", {
          body: { action: "poll" },
        });
        refetchMatch();
      } catch (e) {
        console.error("Poll failed:", e);
      }
    };

    // Poll immediately, then every 20s
    pollSubmissions();
    const interval = setInterval(pollSubmissions, 20000);
    return () => clearInterval(interval);
  }, [match?.id, match?.status, profile?.id]);

  // Timer + auto-end
  useEffect(() => {
    if (!match?.start_time || match.status !== "active") return;
    const interval = setInterval(async () => {
      const endTime = new Date(match.start_time!).getTime() + match.duration * 1000;
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0 && profile && match.player1_id === profile.id) {
        clearInterval(interval);
        await endMatchOnTimeout();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [match?.id, match?.status, match?.start_time, match?.duration, profile?.id]);

  const endMatchOnTimeout = async () => {
    if (!match || match.status !== "active") return;
    
    if (isBotMatch) {
      // Bot match timeout is handled server-side by the poll action
      // Just trigger a poll to let the server handle it
      try {
        await supabase.functions.invoke("arena-engine", { body: { action: "poll" } });
      } catch (e) { console.error("Poll failed:", e); }
      refetchMatch();
      toast.info("Match ended - time's up!");
      return;
    }

    let winnerId: string | null = null;
    if (match.player1_solved_at && !match.player2_solved_at) winnerId = match.player1_id;
    else if (!match.player1_solved_at && match.player2_solved_at) winnerId = match.player2_id;

    const { error } = await supabase.rpc("finalize_match", {
      _match_id: match.id,
      _winner_id: winnerId,
    });
    if (error) { console.error("finalize_match error:", error); toast.error("Failed to end match"); return; }

    queryClient.invalidateQueries({ queryKey: ["player"] });
    refetchMatch();
    toast.info("Match ended - time's up!");
  };

  const resign = async () => {
    if (!match || !profile || match.status !== "active") return;
    
    if (isBotMatch) {
      // Bot match resign: bot wins, apply rating loss
      const { data: p1 } = await supabase.from("profiles").select("*").eq("id", match.player1_id).single();
      if (p1) {
        const games = p1.wins + p1.losses + p1.draws;
        const k = games < 10 ? 48 : games < 30 ? 32 : 24;
        const botRating = match.problem_rating || 1000;
        const expected = 1 / (1 + Math.pow(10, (botRating - p1.rating) / 400));
        const change = Math.round(k * (0 - expected));
        await supabase.from("matches").update({
          status: "finished" as const,
          winner_id: match.player2_id,
          resigned_by: profile.id,
          player1_rating_change: change,
          player2_rating_change: 0,
        } as any).eq("id", match.id);
        await supabase.from("profiles").update({
          rating: p1.rating + change,
          rank: p1.rating + change < 900 ? "Beginner" : p1.rating + change < 1100 ? "Newbie" : p1.rating + change < 1300 ? "Pupil" : p1.rating + change < 1500 ? "Specialist" : p1.rating + change < 1700 ? "Expert" : p1.rating + change < 1900 ? "Candidate Master" : p1.rating + change < 2100 ? "Master" : "Grandmaster",
          losses: p1.losses + 1,
        } as any).eq("id", match.player1_id);
      }
      queryClient.invalidateQueries({ queryKey: ["player"] });
      refetchMatch();
      toast.info("You resigned. Bot wins!");
      return;
    }

    const winnerId = match.player1_id === profile.id ? match.player2_id : match.player1_id;

    const { error } = await supabase.rpc("finalize_match", {
      _match_id: match.id,
      _winner_id: winnerId,
      _resigned_by: profile.id,
    });
    if (error) { console.error("finalize_match error:", error); toast.error("Failed to resign"); return; }

    queryClient.invalidateQueries({ queryKey: ["player"] });
    refetchMatch();
    toast.info("You resigned.");
  };

  const offerDraw = async () => {
    if (!match || !profile || isBotMatch) return;
    const drawOfferedBy = (match as any).draw_offered_by;

    if (drawOfferedBy && drawOfferedBy !== profile.id) {
      const { error } = await supabase.rpc("finalize_match", {
        _match_id: match.id,
        _winner_id: null,
        _is_draw: true,
      });
      if (error) { console.error("finalize_match error:", error); toast.error("Failed to accept draw"); return; }

      queryClient.invalidateQueries({ queryKey: ["player"] });
      refetchMatch();
      toast.info("Match ended in a draw!");
    } else {
      await supabase.from("matches").update({ draw_offered_by: profile.id } as any).eq("id", match.id);
      refetchMatch();
      toast.success("Draw offered to opponent.");
    }
  };

  // Admin force-end match (no rating changes)
  const adminEndMatch = async () => {
    if (!match || match.status !== "active") return;
    await supabase.from("matches").update({
      status: "finished" as const,
      winner_id: null,
      player1_rating_change: 0,
      player2_rating_change: 0,
    } as any).eq("id", match.id);
    refetchMatch();
    toast.success("Match ended by admin (no rating changes).");
  };

  // Realtime match updates
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`match-updates-${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, () => {
        refetchMatch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // Realtime messages
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`match-chat-${matchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_messages", filter: `match_id=eq.${matchId}` },
        async (payload) => {
          const msg = payload.new as MatchMessage;
          const { data: p } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", msg.user_id).single();
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, { ...msg, profile: p || undefined }];
          });
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
      const { data } = await supabase.from("match_messages").select("*").eq("match_id", matchId!).order("created_at", { ascending: true });
      if (data) {
        const enriched = await Promise.all(
          data.map(async (msg) => {
            const { data: p } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", msg.user_id).single();
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
    await supabase.from("match_messages").insert({ match_id: matchId, user_id: profile.id, message: message.trim() });
    setMessage("");
  };

  const isParticipant = profile && match && (match.player1_id === profile.id || match.player2_id === profile.id);
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const bothJoined = isBotMatch || match?.player2_id != null;
  const problemUrl = bothJoined && match?.contest_id && match?.problem_index
    ? `https://codeforces.com/problemset/problem/${match.contest_id}/${match.problem_index}`
    : null;

  const drawOfferedBy = (match as any)?.draw_offered_by;
  const drawOfferedToMe = drawOfferedBy && profile && drawOfferedBy !== profile.id;

  if (!match) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 rounded-2xl border border-border arena-card p-6">
      {/* Bot match indicator */}
        {isBotMatch && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
            <Bot className="h-4 w-4" />
            Bot Match — Rating changes apply!
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
            <div className="space-y-2 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium">
                <Trophy className="h-4 w-4 text-neon-orange" />
                {match.winner_id
                  ? `Winner: ${match.winner_id === player1?.id ? player1?.username : (isBotMatch ? "You" : player2?.username)}`
                  : "Draw!"}
              </div>
              {(match as any).resigned_by && (
                <p className="text-xs text-muted-foreground">
                  {(match as any).resigned_by === player1?.id ? player1?.username : player2?.username} resigned
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Waiting for opponent...</div>
          )}
        </div>

        {/* Players */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            {player1 && (
              <div className="flex flex-col items-center gap-2">
                <img src={player1.avatar || ""} alt="" className="h-16 w-16 rounded-full" />
                <p className="font-display font-semibold">{player1.username}</p>
                <RatingBadge rating={player1.rating} size="sm" />
                {match.player1_solved_at && <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-mono text-primary">✓ Solved</span>}
                {match.status === "finished" && match.player1_rating_change != null && (
                  <span className={`animate-rating-pop font-mono text-sm font-bold ${match.player1_rating_change > 0 ? "text-primary" : match.player1_rating_change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {match.player1_rating_change > 0 ? "+" : ""}{match.player1_rating_change}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center"><span className="font-display text-2xl font-bold text-muted-foreground">VS</span></div>
          <div className="flex-1 text-center">
            {isBotMatch ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-display font-semibold text-muted-foreground">ArenaBot</p>
                <RatingBadge rating={match.problem_rating || 1000} size="sm" />
                {match.player2_solved_at && new Date(match.player2_solved_at) <= new Date() && <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-mono text-primary">✓ Solved</span>}
                {match.status === "finished" && match.player1_rating_change != null && (
                  <span className={`animate-rating-pop font-mono text-sm font-bold ${match.player1_rating_change > 0 ? "text-primary" : match.player1_rating_change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    You: {match.player1_rating_change > 0 ? "+" : ""}{match.player1_rating_change}
                  </span>
                )}
              </div>
            ) : player2 ? (
              <div className="flex flex-col items-center gap-2">
                <img src={player2.avatar || ""} alt="" className="h-16 w-16 rounded-full" />
                <p className="font-display font-semibold">{player2.username}</p>
                <RatingBadge rating={player2.rating} size="sm" />
                {match.player2_solved_at && <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-mono text-primary">✓ Solved</span>}
                {match.status === "finished" && match.player2_rating_change != null && (
                  <span className={`animate-rating-pop font-mono text-sm font-bold ${match.player2_rating_change > 0 ? "text-primary" : match.player2_rating_change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
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
        {problemUrl ? (
          <div className="mt-6 text-center">
            <a href={problemUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-6 py-3 font-display font-semibold text-primary transition-all hover:glow-green">
              <ExternalLink className="h-4 w-4" />
              Open Problem: {match.contest_id}{match.problem_index}
              {match.problem_name && ` - ${match.problem_name}`}
            </a>
          </div>
        ) : match.status === "waiting" && match.contest_id ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Problem link will be revealed when both players join.
          </div>
        ) : null}

        {/* Resign / Draw buttons for participants */}
        {isParticipant && match.status === "active" && (
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={resign} className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
              <Flag className="h-4 w-4" /> Resign
            </button>
            {!isBotMatch && (
              <button onClick={offerDraw} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                drawOfferedToMe ? "border-neon-orange bg-neon-orange/10 text-neon-orange animate-pulse" : "border-muted-foreground/30 text-muted-foreground hover:bg-secondary"
              }`}>
                <Handshake className="h-4 w-4" />
                {drawOfferedToMe ? "Accept Draw" : drawOfferedBy === profile?.id ? "Draw Offered..." : "Offer Draw"}
              </button>
            )}
          </div>
        )}

        {/* Admin end match button */}
        {isAdmin && match.status === "active" && (
          <div className="mt-4 flex justify-center">
            <button onClick={adminEndMatch} className="inline-flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20">
              <ShieldAlert className="h-4 w-4" /> End Match (Admin)
            </button>
          </div>
        )}
      </div>

      {/* Chat - for all participants */}
      {isParticipant && (
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4"><h3 className="font-display font-semibold">Match Chat</h3></div>
          <div ref={chatRef} className="h-64 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No messages yet</p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-2">
                    <img src={msg.profile?.avatar || ""} alt="" className="h-6 w-6 rounded-full" />
                    <div>
                      <span className="text-xs font-semibold text-primary">{msg.profile?.username || "User"}</span>
                      <p className="text-sm text-foreground">{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Type a message..." className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <button onClick={sendMessage} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
