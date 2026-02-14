import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Swords, Trophy, Clock, TrendingUp, Users, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import RatingBadge from "@/components/RatingBadge";
import PlayerCard from "@/components/PlayerCard";
import { getRankFromRating } from "@/lib/types";
import type { Profile, Match } from "@/lib/types";

export default function DashboardPage() {
  const { profile } = useAuth();

  const { data: recentMatches } = useQuery({
    queryKey: ["recent-matches", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*")
        .or(`player1_id.eq.${profile!.id},player2_id.eq.${profile!.id}`)
        .order("created_at", { ascending: false })
        .limit(5);
      return (data || []) as Match[];
    },
  });

  const { data: topPlayers } = useQuery({
    queryKey: ["top-players"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("rating", { ascending: false })
        .limit(5);
      return (data || []) as Profile[];
    },
  });

  if (!profile) return null;

  const totalGames = profile.wins + profile.losses + profile.draws;
  const winRate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Welcome banner */}
      <div className="mb-8 rounded-2xl border border-border arena-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img
              src={profile.avatar || ""}
              alt="avatar"
              className="h-16 w-16 rounded-2xl"
            />
            <div>
              <h1 className="font-display text-2xl font-bold">
                Welcome back, <span className="text-gradient">{profile.username}</span>
              </h1>
              <div className="mt-1 flex items-center gap-3">
                <RatingBadge rating={profile.rating} />
                {profile.cf_handle && (
                  <span className="text-sm text-muted-foreground font-mono">
                    CF: {profile.cf_handle} ({profile.cf_rating || "?"})
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link
            to="/matchmaking"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-display font-semibold text-primary-foreground transition-all hover:glow-green"
          >
            <Swords className="h-5 w-5" />
            Find Match
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Rating", value: profile.rating, icon: TrendingUp, color: "text-primary" },
          { label: "Win Rate", value: `${winRate}%`, icon: Trophy, color: "text-neon-cyan" },
          { label: "Total Games", value: totalGames, icon: Swords, color: "text-neon-purple" },
          { label: "Rank", value: getRankFromRating(profile.rating), icon: Zap, color: "text-neon-orange" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={`mt-2 font-display text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent matches */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent Matches</h2>
            <Link to="/matchmaking" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {recentMatches?.length ? (
            <div className="space-y-3">
              {recentMatches.map((match) => {
                const isPlayer1 = match.player1_id === profile.id;
                const won = match.winner_id === profile.id;
                const draw = match.status === "finished" && !match.winner_id;
                return (
                  <Link
                    key={match.id}
                    to={`/match/${match.id}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${won ? "bg-primary" : draw ? "bg-muted-foreground" : "bg-destructive"}`} />
                      <span className="text-sm font-mono">
                        {match.contest_id}{match.problem_index}
                      </span>
                      <span className={`text-xs ${match.status === "active" ? "text-neon-cyan" : "text-muted-foreground"}`}>
                        {match.status}
                      </span>
                    </div>
                    <span className={`text-sm font-mono font-semibold ${won ? "text-primary" : draw ? "text-muted-foreground" : "text-destructive"}`}>
                      {isPlayer1 ? (match.player1_rating_change || 0) : (match.player2_rating_change || 0)}
                      {((isPlayer1 ? match.player1_rating_change : match.player2_rating_change) || 0) > 0 ? "+" : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No matches yet. Start your first duel!</p>
          )}
        </div>

        {/* Top players */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Top Players</h2>
            <Link to="/leaderboard" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {topPlayers?.map((player, i) => (
              <div key={player.id} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-mono text-muted-foreground">
                  #{i + 1}
                </span>
                <div className="flex-1">
                  <PlayerCard profile={player} compact />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
