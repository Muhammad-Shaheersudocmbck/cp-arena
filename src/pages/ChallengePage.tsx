import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Swords, Clock, Loader2, Copy, ExternalLink, Hash, Users, Crown, Shield } from "lucide-react";
import { toast } from "sonner";
import type { Match, Profile } from "@/lib/types";
import { SAFE_PROFILE_COLUMNS } from "@/lib/types";
import RatingBadge from "@/components/RatingBadge";

export default function ChallengePage() {
  const { challengeCode } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: match, isLoading } = useQuery({
    queryKey: ["challenge", challengeCode],
    enabled: !!challengeCode,
    refetchInterval: 3000,
    queryFn: async () => {
      const res = await (supabase as any)
        .from("matches")
        .select("*")
        .eq("challenge_code", challengeCode!)
        .maybeSingle();
      return res.data as (Match & { max_players?: number; lobby_mode?: string; team_size?: number; problem_count?: number }) | null;
    },
  });

  const { data: players } = useQuery({
    queryKey: ["challenge-players", match?.id],
    enabled: !!match?.id,
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase.from("match_players").select("*").eq("match_id", match!.id);
      return data || [];
    },
  });

  const { data: playerProfiles } = useQuery({
    queryKey: ["challenge-player-profiles", players?.map((p: any) => p.player_id).join(",")],
    enabled: !!players && players.length > 0,
    queryFn: async () => {
      const ids = players!.map((p: any) => p.player_id);
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", ids);
      return (data || []) as Profile[];
    },
  });

  const joinLobby = useMutation({
    mutationFn: async () => {
      if (!profile || !match) return;

      // For 1v1 legacy matches, use the old flow
      if (!match.lobby_mode || match.lobby_mode === "1v1") {
        const { error } = await supabase.from("matches")
          .update({ player2_id: profile.id, status: "active", start_time: new Date(Date.now() + 10000).toISOString() })
          .eq("id", match.id);
        if (error) throw error;

        // Also add to match_players
        await supabase.from("match_players").insert({ match_id: match.id, player_id: profile.id });
        return;
      }

      // Multi-player: add to match_players
      const maxPlayers = match.max_players || 2;
      const currentCount = players?.length || 0;
      if (currentCount >= maxPlayers) { toast.error("Lobby is full"); return; }

      // Auto-assign team for team mode
      let team = null;
      if (match.lobby_mode === "team" && match.team_size) {
        const team1Count = (players || []).filter((p: any) => p.team === 1).length;
        const team2Count = (players || []).filter((p: any) => p.team === 2).length;
        team = team1Count <= team2Count ? 1 : 2;
      }

      const { error } = await supabase.from("match_players").insert({
        match_id: match.id,
        player_id: profile.id,
        team,
      });
      if (error) throw error;

      // Check if lobby is now full - start the match
      if (currentCount + 1 >= maxPlayers) {
        await supabase.from("matches").update({
          status: "active",
          start_time: new Date(Date.now() + 10000).toISOString(),
        }).eq("id", match.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenge"] });
      queryClient.invalidateQueries({ queryKey: ["challenge-players"] });
      if (match?.status === "active" || (players && (players.length + 1) >= (match?.max_players || 2))) {
        toast.success("Match starting!");
        navigate(`/match/${match!.id}`);
      } else {
        toast.success("Joined lobby!");
      }
    },
    onError: () => toast.error("Failed to join lobby"),
  });

  // Redirect when match becomes active
  if (match && match.status === "active") {
    const isParticipant = players?.some((p: any) => p.player_id === profile?.id) || match.player1_id === profile?.id;
    if (isParticipant) {
      navigate(`/match/${match.id}`);
      return null;
    }
  }

  if (!profile) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">Challenge not found or expired.</p>
      </div>
    );
  }

  const isCreator = match.player1_id === profile.id;
  const alreadyJoined = players?.some((p: any) => p.player_id === profile.id);
  const maxPlayers = match.max_players || 2;
  const currentPlayers = players?.length || 0;
  const isFull = currentPlayers >= maxPlayers;
  const lobbyMode = match.lobby_mode || "1v1";
  const challengeLink = `${window.location.origin}/challenge/${challengeCode}`;
  const modeLabel = lobbyMode === "ffa" ? "Free For All" : lobbyMode === "team" ? `${match.team_size || 2}v${match.team_size || 2} Team` : "1v1 Duel";
  const ModeIcon = lobbyMode === "ffa" ? Crown : lobbyMode === "team" ? Shield : Swords;

  return (
    <div className="container mx-auto max-w-lg px-4 py-12">
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <ModeIcon className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h1 className="mb-1 font-display text-2xl font-bold">
          {isCreator ? "Lobby Created!" : "You've Been Invited!"}
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">{modeLabel} • {match.duration / 60}min • {match.problem_count || 1} problem{(match.problem_count || 1) > 1 ? "s" : ""}</p>

        {/* Game PIN */}
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">GAME PIN</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-primary">{challengeCode}</p>
        </div>

        {isCreator && (
          <div className="mb-4 flex justify-center gap-2">
            <button onClick={() => { navigator.clipboard.writeText(challengeLink); toast.success("Link copied!"); }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              <Copy className="h-3 w-3" /> Copy Link
            </button>
            <button onClick={() => { navigator.clipboard.writeText(challengeCode || ""); toast.success("PIN copied!"); }}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary">
              <Hash className="h-3 w-3" /> Copy PIN
            </button>
          </div>
        )}

        {/* Players in lobby */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {currentPlayers}/{maxPlayers} Players
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {playerProfiles?.map((p) => {
              const mp = players?.find((mp: any) => mp.player_id === p.id);
              return (
                <div key={p.id} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-secondary/50 p-2 min-w-[80px]">
                  <img src={p.avatar || ""} alt="" className="h-10 w-10 rounded-full" />
                  <span className="text-xs font-medium">{p.username}</span>
                  <RatingBadge rating={p.rating} size="sm" />
                  {lobbyMode === "team" && mp?.team && (
                    <span className={`text-[10px] font-bold ${mp.team === 1 ? "text-primary" : "text-neon-orange"}`}>
                      Team {mp.team}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Empty slots */}
            {Array.from({ length: maxPlayers - currentPlayers }).map((_, i) => (
              <div key={`empty-${i}`} className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-2 min-w-[80px] h-[88px]">
                <Users className="h-6 w-6 text-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground/50">Waiting...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Join button */}
        {!isCreator && !alreadyJoined && match.status === "waiting" && !isFull && (
          <button onClick={() => joinLobby.mutate()} disabled={joinLobby.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-display font-semibold text-primary-foreground transition-all hover:glow-green disabled:opacity-50">
            {joinLobby.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Swords className="h-5 w-5" />}
            Join Lobby
          </button>
        )}

        {alreadyJoined && match.status === "waiting" && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for more players...
          </p>
        )}

        {isFull && match.status === "waiting" && (
          <p className="text-sm text-primary font-medium">Lobby full! Match starting soon...</p>
        )}

        {/* Start early button for creator */}
        {isCreator && currentPlayers >= 2 && match.status === "waiting" && (
          <button
            onClick={async () => {
              await supabase.from("matches").update({
                status: "active",
                start_time: new Date(Date.now() + 10000).toISOString(),
              }).eq("id", match.id);
              navigate(`/match/${match.id}`);
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/30 px-6 py-3 text-sm font-medium text-primary hover:bg-primary/10">
            <Swords className="h-4 w-4" /> Start Now ({currentPlayers} players)
          </button>
        )}
      </div>
    </div>
  );
}
