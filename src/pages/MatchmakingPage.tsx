import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Swords, Clock, Loader2, X, Zap, Link2, Copy, Hash, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const CF_TAGS = [
  "implementation", "math", "greedy", "dp", "data structures", "brute force",
  "constructive algorithms", "graphs", "sortings", "binary search", "dfs and similar",
  "trees", "strings", "number theory", "geometry", "combinatorics", "two pointers",
  "bitmasks", "probabilities", "shortest paths", "hashing", "divide and conquer",
  "games", "flows", "interactive", "matrices", "string suffix structures",
];

export default function MatchmakingPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState(900);
  const [ratingRange, setRatingRange] = useState([800, 1600]);
  const [showChallengeForm, setShowChallengeForm] = useState(false);
  const [challengeDifficulty, setChallengeDifficulty] = useState([800, 1600]);
  const [challengeTags, setChallengeTags] = useState<string[]>([]);
  const [challengeDuration, setChallengeDuration] = useState(900);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [joinPin, setJoinPin] = useState("");

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

  const createChallenge = async () => {
    if (!profile) return;
    setCreatingChallenge(true);
    try {
      // Fetch problems from CF API
      const res = await fetch("https://codeforces.com/api/problemset.problems");
      const cfData = await res.json();
      if (cfData.status !== "OK") {
        toast.error("Failed to fetch problems from Codeforces");
        return;
      }

      // Get blacklisted problems
      const { data: blacklist } = await supabase.from("blacklisted_problems").select("contest_id, problem_index");
      const blackSet = new Set((blacklist || []).map((b: any) => `${b.contest_id}${b.problem_index}`));

      // Filter problems by difficulty and tags
      let problems = cfData.result.problems.filter(
        (p: any) =>
          p.rating &&
          p.rating >= challengeDifficulty[0] &&
          p.rating <= challengeDifficulty[1] &&
          p.contestId &&
          !blackSet.has(`${p.contestId}${p.index}`)
      );

      // Filter by tags if any selected
      if (challengeTags.length > 0) {
        problems = problems.filter((p: any) =>
          challengeTags.some((tag) => p.tags?.includes(tag))
        );
      }

      if (problems.length === 0) {
        toast.error("No matching problems found. Try adjusting filters.");
        return;
      }

      const problem = problems[Math.floor(Math.random() * problems.length)];
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();

      const { data, error } = await supabase.from("matches").insert({
        player1_id: profile.id,
        challenge_code: code,
        duration: challengeDuration,
        status: "waiting" as const,
        contest_id: problem.contestId,
        problem_index: problem.index,
        problem_name: problem.name,
        problem_rating: problem.rating,
      }).select().single();

      if (error) {
        toast.error("Failed to create challenge");
      } else {
        const url = `${window.location.origin}/challenge/${code}`;
        navigator.clipboard.writeText(url);
        toast.success("Challenge created! Link copied to clipboard.");
        navigate(`/challenge/${code}`);
      }
    } catch (e) {
      toast.error("Error creating challenge");
    } finally {
      setCreatingChallenge(false);
    }
  };

  const joinByPin = async () => {
    if (!joinPin.trim()) return;
    navigate(`/challenge/${joinPin.trim().toUpperCase()}`);
  };

  const toggleTag = (tag: string) => {
    setChallengeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

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

      {/* Join by PIN */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <input
            value={joinPin}
            onChange={(e) => setJoinPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinByPin()}
            placeholder="Enter Game PIN to join..."
            className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground uppercase"
          />
          <button
            onClick={joinByPin}
            disabled={!joinPin.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Join
          </button>
        </div>
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
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            {/* Duration */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Match Duration</label>
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
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Problem Rating Range</label>
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

            {!profile.cf_handle && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Go to your <a href={`/profile/${profile.id}`} className="text-primary underline">profile</a> to connect your Codeforces handle.
              </p>
            )}
          </div>

          {/* Challenge a Friend section */}
          {profile.cf_handle && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
                <Link2 className="h-5 w-5 text-primary" />
                Challenge a Friend
              </h2>

              {!showChallengeForm ? (
                <button
                  onClick={() => setShowChallengeForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 px-6 py-3 font-display font-medium text-primary transition-all hover:bg-primary/10"
                >
                  <Swords className="h-4 w-4" />
                  Create Challenge
                </button>
              ) : (
                <div className="space-y-4">
                  {/* Challenge Duration */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Duration</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 600, label: "10 min" },
                        { value: 900, label: "15 min" },
                        { value: 1800, label: "30 min" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setChallengeDuration(opt.value)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                            challengeDuration === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Difficulty */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Problem Difficulty</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs text-muted-foreground">Min Rating</span>
                        <input
                          type="number"
                          value={challengeDifficulty[0]}
                          onChange={(e) => setChallengeDifficulty([+e.target.value, challengeDifficulty[1]])}
                          step={100}
                          min={800}
                          max={3500}
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground"
                        />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Max Rating</span>
                        <input
                          type="number"
                          value={challengeDifficulty[1]}
                          onChange={(e) => setChallengeDifficulty([challengeDifficulty[0], +e.target.value])}
                          step={100}
                          min={800}
                          max={3500}
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                      <Tag className="h-3 w-3" /> Problem Tags (optional)
                    </label>
                    <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-lg border border-border bg-secondary/50 p-2">
                      {CF_TAGS.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                            challengeTags.includes(tag)
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {challengeTags.length > 0 && (
                      <p className="mt-1 text-xs text-primary">{challengeTags.length} tag(s) selected</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={createChallenge}
                      disabled={creatingChallenge}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-display font-semibold text-primary-foreground transition-all hover:glow-green disabled:opacity-50"
                    >
                      {creatingChallenge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                      {creatingChallenge ? "Creating..." : "Create Challenge"}
                    </button>
                    <button
                      onClick={() => setShowChallengeForm(false)}
                      className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
