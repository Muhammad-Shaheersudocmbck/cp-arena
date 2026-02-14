import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Swords, Clock, Loader2, X, Zap, Link2, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";


export default function MatchmakingPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState(900);
  const [ratingRange, setRatingRange] = useState([800, 1600]);

  const { data: queueEntry, isLoading: queueLoading } = useQuery({
    queryKey: ["my-queue", profile?.id],
    enabled: !!profile,
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase
        .from("queue")
        .select("*")
        .eq("user_id", profile!.id)
        .maybeSingle();
      return data;
    },
  });

  // Check for new active matches
  useQuery({
    queryKey: ["my-active-match", profile?.id],
    enabled: !!profile && !!queueEntry,
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*")
        .eq("status", "active")
        .or(`player1_id.eq.${profile!.id},player2_id.eq.${profile!.id}`)
        .maybeSingle();
      if (data) {
        navigate(`/match/${data.id}`);
      }
      return data;
    },
  });

  const joinQueue = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      const { error } = await supabase.from("queue").insert({
        user_id: profile.id,
        rating_min: ratingRange[0],
        rating_max: ratingRange[1],
        duration,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      toast.success("Joined matchmaking queue!");
    },
    onError: () => toast.error("Failed to join queue"),
  });

  const leaveQueue = useMutation({
    mutationFn: async () => {
      if (!profile || !queueEntry) return;
      const { error } = await supabase.from("queue").delete().eq("id", queueEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      toast.success("Left queue");
    },
  });

  if (!profile) return null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold">
          <span className="text-gradient">Arena</span> Matchmaking
        </h1>
        <p className="mt-2 text-muted-foreground">
          Find an opponent and duel with Codeforces problems
        </p>
      </div>

      {queueEntry ? (
        /* In queue */
        <div className="rounded-2xl border border-primary/30 bg-card p-8 text-center glow-green">
          <div className="mb-4 flex justify-center">
            <div className="relative">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <Swords className="absolute inset-0 m-auto h-6 w-6 text-primary" />
            </div>
          </div>
          <h2 className="font-display text-xl font-bold">Searching for opponent...</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Rating range: {queueEntry.rating_min} - {queueEntry.rating_max} • Duration: {queueEntry.duration / 60}min
          </p>
          <button
            onClick={() => leaveQueue.mutate()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-6 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <X className="h-4 w-4" />
            Leave Queue
          </button>
        </div>
      ) : (
        /* Queue options */
        <div className="rounded-2xl border border-border bg-card p-6">
          {/* Duration */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Match Duration
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 600, label: "10 min" },
                { value: 900, label: "15 min" },
                { value: 1800, label: "30 min" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                    duration === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Problem rating range */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Problem Rating Range
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">Min</span>
                <input
                  type="number"
                  value={ratingRange[0]}
                  onChange={(e) => setRatingRange([+e.target.value, ratingRange[1]])}
                  step={100}
                  min={800}
                  max={3000}
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground"
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Max</span>
                <input
                  type="number"
                  value={ratingRange[1]}
                  onChange={(e) => setRatingRange([ratingRange[0], +e.target.value])}
                  step={100}
                  min={800}
                  max={3000}
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground"
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => joinQueue.mutate()}
            disabled={joinQueue.isPending || !profile.cf_handle}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-display font-semibold text-primary-foreground transition-all hover:glow-green disabled:opacity-50"
          >
            <Zap className="h-5 w-5" />
            {!profile.cf_handle ? "Connect Codeforces Handle First" : "Find Match"}
          </button>

          {/* Friend Challenge */}
          {profile.cf_handle && (
            <button
              onClick={async () => {
                const code = Math.random().toString(36).substring(2, 10);
                const { data, error } = await supabase.from("matches").insert({
                  player1_id: profile.id,
                  challenge_code: code,
                  duration,
                  status: "waiting" as const,
                }).select().single();
                if (error) {
                  toast.error("Failed to create challenge");
                } else {
                  const url = `${window.location.origin}/challenge/${code}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Challenge link copied!");
                  navigate(`/challenge/${code}`);
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 px-6 py-3 font-display font-medium text-primary transition-all hover:bg-primary/10"
            >
              <Link2 className="h-4 w-4" />
              Challenge a Friend
            </button>
          )}

          {!profile.cf_handle && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Go to your <a href={`/profile/${profile.id}`} className="text-primary underline">profile</a> to connect your Codeforces handle.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
