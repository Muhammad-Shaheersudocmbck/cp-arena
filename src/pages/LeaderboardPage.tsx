import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import RatingBadge from "@/components/RatingBadge";
import { getRankColor } from "@/lib/types";
import { Link } from "react-router-dom";
import type { Profile } from "@/lib/types";

export default function LeaderboardPage() {
  const { data: players, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_banned", false)
        .order("rating", { ascending: false })
        .limit(100);
      return (data || []) as Profile[];
    },
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold">
          <Trophy className="mr-2 inline h-8 w-8 text-neon-orange" />
          Leaderboard
        </h1>
        <p className="mt-2 text-muted-foreground">Top competitive programmers</p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[4rem_1fr_6rem_5rem] gap-2 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">Rating</span>
          <span className="text-right">W/L/D</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {players?.map((player, i) => (
              <Link
                key={player.id}
                to={`/profile/${player.id}`}
                className="grid grid-cols-[4rem_1fr_6rem_5rem] items-center gap-2 px-4 py-3 transition-colors hover:bg-secondary/50"
              >
                <span className={`font-mono text-sm font-bold ${i < 3 ? "text-neon-orange" : "text-muted-foreground"}`}>
                  #{i + 1}
                </span>
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={player.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${player.id}`}
                    alt=""
                    className="h-8 w-8 rounded-full shrink-0"
                  />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${getRankColor(player.rating)}`}>
                      {player.username || "Anonymous"}
                    </p>
                    {player.cf_handle && (
                      <p className="truncate text-xs text-muted-foreground font-mono">{player.cf_handle}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <RatingBadge rating={player.rating} showRank={false} size="sm" />
                </div>
                <span className="text-right text-xs text-muted-foreground font-mono">
                  {player.wins}/{player.losses}/{player.draws}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
