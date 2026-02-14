import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link as LinkIcon, Check, Loader2, Trophy, Swords, BarChart3 } from "lucide-react";
import RatingBadge from "@/components/RatingBadge";
import { getRankFromRating, getRankColor } from "@/lib/types";
import { toast } from "sonner";
import axios from "axios";
import type { Profile, Match } from "@/lib/types";

export default function ProfilePage() {
  const { id } = useParams();
  const { profile: myProfile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [cfHandleInput, setCfHandleInput] = useState("");
  const [verifying, setVerifying] = useState(false);

  const isOwnProfile = myProfile?.id === id;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", id!).single();
      return data as Profile;
    },
  });

  const { data: matchHistory } = useQuery({
    queryKey: ["match-history", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*")
        .or(`player1_id.eq.${id},player2_id.eq.${id}`)
        .eq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as Match[];
    },
  });

  const verifyCfHandle = async () => {
    if (!cfHandleInput.trim() || !myProfile) return;
    setVerifying(true);
    try {
      const res = await axios.get(
        `https://codeforces.com/api/user.info?handles=${cfHandleInput.trim()}`
      );
      if (res.data.status === "OK" && res.data.result.length > 0) {
        const cfUser = res.data.result[0];
        await supabase
          .from("profiles")
          .update({
            cf_handle: cfUser.handle,
            cf_rating: cfUser.rating || 0,
          })
          .eq("id", myProfile.id);
        
        await refreshProfile();
        queryClient.invalidateQueries({ queryKey: ["profile", id] });
        toast.success(`Connected Codeforces handle: ${cfUser.handle}`);
        setCfHandleInput("");
      } else {
        toast.error("Codeforces handle not found");
      }
    } catch {
      toast.error("Failed to verify Codeforces handle");
    } finally {
      setVerifying(false);
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalGames = profile.wins + profile.losses + profile.draws;
  const winRate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {/* Profile header */}
      <div className="mb-8 rounded-2xl border border-border arena-card p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <img
            src={profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.id}`}
            alt=""
            className="h-24 w-24 rounded-2xl"
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className={`font-display text-2xl font-bold ${getRankColor(profile.rating)}`}>
              {profile.username || "Anonymous"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <RatingBadge rating={profile.rating} />
              <span className="text-sm text-muted-foreground">{getRankFromRating(profile.rating)}</span>
            </div>
            {profile.cf_handle && (
              <a
                href={`https://codeforces.com/profile/${profile.cf_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-neon-cyan hover:underline"
              >
                <LinkIcon className="h-3 w-3" />
                CF: {profile.cf_handle} ({profile.cf_rating || "?"})
              </a>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-4 gap-3">
          {[
            { label: "Wins", value: profile.wins, icon: Trophy, color: "text-primary" },
            { label: "Losses", value: profile.losses, icon: Swords, color: "text-destructive" },
            { label: "Draws", value: profile.draws, icon: BarChart3, color: "text-muted-foreground" },
            { label: "Win Rate", value: `${winRate}%`, icon: BarChart3, color: "text-neon-cyan" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border border-border bg-secondary/50 p-3 text-center">
              <Icon className={`mx-auto h-4 w-4 ${color}`} />
              <p className={`mt-1 font-mono text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* CF Handle connect */}
        {isOwnProfile && !profile.cf_handle && (
          <div className="mt-6 rounded-lg border border-border bg-secondary/50 p-4">
            <h3 className="mb-2 text-sm font-semibold">Connect Codeforces Handle</h3>
            <div className="flex gap-2">
              <input
                value={cfHandleInput}
                onChange={(e) => setCfHandleInput(e.target.value)}
                placeholder="Your Codeforces handle"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground"
              />
              <button
                onClick={verifyCfHandle}
                disabled={verifying || !cfHandleInput.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Verify
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Match history */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Match History</h2>
        {matchHistory?.length ? (
          <div className="space-y-2">
            {matchHistory.map((match) => {
              const isP1 = match.player1_id === profile.id;
              const won = match.winner_id === profile.id;
              const draw = !match.winner_id;
              const ratingChange = isP1 ? match.player1_rating_change : match.player2_rating_change;
              return (
                <a
                  key={match.id}
                  href={`/match/${match.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${won ? "bg-primary" : draw ? "bg-muted-foreground" : "bg-destructive"}`} />
                    <span className="font-mono text-sm">
                      {match.contest_id}{match.problem_index}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(match.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {ratingChange != null && (
                    <span className={`font-mono text-sm font-bold ${ratingChange > 0 ? "text-primary" : ratingChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {ratingChange > 0 ? "+" : ""}{ratingChange}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No match history yet.</p>
        )}
      </div>
    </div>
  );
}
