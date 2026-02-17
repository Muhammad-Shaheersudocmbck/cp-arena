import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Swords, Clock, Loader2, X, Zap, Link2, Hash, Tag, Users, Crown, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const CF_TAGS = [
  "implementation", "math", "greedy", "dp", "data structures", "brute force",
  "constructive algorithms", "graphs", "sortings", "binary search", "dfs and similar",
  "trees", "strings", "number theory", "geometry", "combinatorics", "two pointers",
  "bitmasks", "probabilities", "shortest paths", "hashing", "divide and conquer",
  "games", "flows", "interactive", "matrices", "string suffix structures",
];

const LOBBY_MODES = [
  { value: "1v1", label: "1v1 Duel", icon: Swords, desc: "Classic head-to-head" },
  { value: "ffa", label: "Free For All", icon: Crown, desc: "3-8 players compete" },
  { value: "team", label: "Team Battle", icon: Shield, desc: "Team vs Team" },
];

export default function MatchmakingPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Queue state
  const [duration, setDuration] = useState(900);
  const [ratingRange, setRatingRange] = useState([800, 1600]);
  const [queueTags, setQueueTags] = useState<string[]>([]);

  // Lobby state
  const [showLobby, setShowLobby] = useState(false);
  const [lobbyMode, setLobbyMode] = useState("1v1");
  const [lobbyMaxPlayers, setLobbyMaxPlayers] = useState(2);
  const [lobbyTeamSize, setLobbyTeamSize] = useState(2);
  const [lobbyProblemCount, setLobbyProblemCount] = useState(1);
  const [lobbyDifficulty, setLobbyDifficulty] = useState([800, 1600]);
  const [lobbyTags, setLobbyTags] = useState<string[]>([]);
  const [lobbyDuration, setLobbyDuration] = useState(900);
  const [creatingLobby, setCreatingLobby] = useState(false);

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
    refetchInterval: 5000,
    queryFn: async () => {
      try {
        await supabase.functions.invoke("arena-engine", {
          body: { action: "matchmake" },
        });
      } catch (e) {
        console.error("Matchmake poll failed:", e);
      }
      const { data } = await supabase
        .from("matches")
        .select("*")
        .eq("status", "active")
        .or(`player1_id.eq.${profile!.id},player2_id.eq.${profile!.id}`)
        .limit(1)
        .maybeSingle();
      if (data) navigate(`/match/${data.id}`);
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
        tags: queueTags.length > 0 ? queueTags : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      toast.success("Joined matchmaking queue!");
      try {
        await supabase.functions.invoke("arena-engine", { body: { action: "matchmake" } });
      } catch (e) { console.error("Matchmake trigger failed:", e); }
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

  const createLobby = async () => {
    if (!profile) return;
    setCreatingLobby(true);
    try {
      const res = await fetch("https://codeforces.com/api/problemset.problems");
      const cfData = await res.json();
      if (cfData.status !== "OK") { toast.error("Failed to fetch problems"); return; }

      const { data: blacklist } = await supabase.from("blacklisted_problems").select("contest_id, problem_index");
      const blackSet = new Set((blacklist || []).map((b: any) => `${b.contest_id}${b.problem_index}`));

      let problems = cfData.result.problems.filter(
        (p: any) => p.rating && p.rating >= lobbyDifficulty[0] && p.rating <= lobbyDifficulty[1] && p.contestId && !blackSet.has(`${p.contestId}${p.index}`)
      );

      if (lobbyTags.length > 0) {
        problems = problems.filter((p: any) => lobbyTags.some((tag) => p.tags?.includes(tag)));
      }

      if (problems.length < lobbyProblemCount) {
        toast.error(`Not enough problems found. Need ${lobbyProblemCount}, found ${problems.length}`);
        return;
      }

      // Sort by rating and pick spread problems
      problems.sort((a: any, b: any) => (a.rating || 0) - (b.rating || 0));
      const selectedProblems: any[] = [];
      const step = Math.floor(problems.length / lobbyProblemCount);
      for (let i = 0; i < lobbyProblemCount; i++) {
        const idx = Math.min(i * step + Math.floor(Math.random() * Math.max(1, step)), problems.length - 1);
        const p = problems[idx];
        if (!selectedProblems.find((sp) => sp.contestId === p.contestId && sp.index === p.index)) {
          selectedProblems.push(p);
        }
      }

      // Ensure we have enough unique problems
      while (selectedProblems.length < lobbyProblemCount) {
        const p = problems[Math.floor(Math.random() * problems.length)];
        if (!selectedProblems.find((sp) => sp.contestId === p.contestId && sp.index === p.index)) {
          selectedProblems.push(p);
        }
      }

      selectedProblems.sort((a, b) => (a.rating || 0) - (b.rating || 0));
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();

      const maxPlayers = lobbyMode === "1v1" ? 2 : lobbyMode === "team" ? lobbyTeamSize * 2 : lobbyMaxPlayers;

      const { data: match, error } = await supabase.from("matches").insert({
        player1_id: profile.id,
        challenge_code: code,
        duration: lobbyDuration,
        status: "waiting" as const,
        contest_id: selectedProblems[0].contestId,
        problem_index: selectedProblems[0].index,
        problem_name: selectedProblems[0].name,
        problem_rating: selectedProblems[0].rating,
        max_players: maxPlayers,
        problem_count: lobbyProblemCount,
        lobby_mode: lobbyMode,
        team_size: lobbyMode === "team" ? lobbyTeamSize : null,
      }).select().single();

      if (error) { toast.error("Failed to create lobby"); return; }

      // Insert additional problems
      if (selectedProblems.length > 1) {
        const problemRows = selectedProblems.map((p, i) => ({
          match_id: match.id,
          problem_order: i + 1,
          contest_id: p.contestId,
          problem_index: p.index,
          problem_name: p.name,
          problem_rating: p.rating,
        }));
        await supabase.from("match_problems").insert(problemRows);
      }

      // Add creator as first player
      await supabase.from("match_players").insert({
        match_id: match.id,
        player_id: profile.id,
        team: lobbyMode === "team" ? 1 : null,
      });

      navigator.clipboard.writeText(`${window.location.origin}/challenge/${code}`);
      toast.success("Lobby created! Link copied to clipboard.");
      navigate(`/challenge/${code}`);
    } catch (e) {
      toast.error("Error creating lobby");
    } finally {
      setCreatingLobby(false);
    }
  };

  const joinByPin = async () => {
    if (!joinPin.trim()) return;
    navigate(`/challenge/${joinPin.trim().toUpperCase()}`);
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
          <button onClick={joinByPin} disabled={!joinPin.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Join
          </button>
        </div>
      </div>

      {queueEntry ? (
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
          <button onClick={() => leaveQueue.mutate()} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-6 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
            <X className="h-4 w-4" /> Leave Queue
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Match (1v1 Queue) */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
              <Zap className="h-5 w-5 text-primary" /> Quick Match (1v1)
            </h2>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Duration</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ value: 600, label: "10 min" }, { value: 900, label: "15 min" }, { value: 1800, label: "30 min" }].map((opt) => (
                  <button key={opt.value} onClick={() => setDuration(opt.value)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${duration === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                    <Clock className="h-4 w-4" />{opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Problem Rating Range</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-muted-foreground">Min</span>
                  <input type="number" value={ratingRange[0]} onChange={(e) => setRatingRange([+e.target.value, ratingRange[1]])} step={100} min={800} max={3000} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Max</span>
                  <input type="number" value={ratingRange[1]} onChange={(e) => setRatingRange([ratingRange[0], +e.target.value])} step={100} min={800} max={3000} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground" />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                <Tag className="h-3 w-3" /> Tags (optional)
              </label>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-lg border border-border bg-secondary/50 p-2">
                {CF_TAGS.map((tag) => (
                  <button key={tag} onClick={() => setQueueTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${queueTags.includes(tag) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                    {tag}
                  </button>
                ))}
              </div>
              {queueTags.length > 0 && <p className="mt-1 text-xs text-primary">{queueTags.length} tag(s) selected</p>}
            </div>

            <button onClick={() => joinQueue.mutate()} disabled={joinQueue.isPending || !profile.cf_handle}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-display font-semibold text-primary-foreground transition-all hover:glow-green disabled:opacity-50">
              <Zap className="h-5 w-5" />
              {!profile.cf_handle ? "Connect Codeforces Handle First" : "Find Match"}
            </button>
            {!profile.cf_handle && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Go to your <a href={`/profile/${profile.id}`} className="text-primary underline">profile</a> to connect your Codeforces handle.
              </p>
            )}
          </div>

          {/* Create Lobby */}
          {profile.cf_handle && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
                <Link2 className="h-5 w-5 text-primary" /> Create Lobby
              </h2>

              {!showLobby ? (
                <button onClick={() => setShowLobby(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 px-6 py-3 font-display font-medium text-primary transition-all hover:bg-primary/10">
                  <Users className="h-4 w-4" /> Create Game Lobby
                </button>
              ) : (
                <div className="space-y-4">
                  {/* Mode Selection */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Game Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {LOBBY_MODES.map((mode) => (
                        <button key={mode.value} onClick={() => {
                          setLobbyMode(mode.value);
                          if (mode.value === "1v1") setLobbyMaxPlayers(2);
                          else if (mode.value === "ffa") setLobbyMaxPlayers(4);
                          else setLobbyTeamSize(2);
                        }}
                          className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-medium transition-all ${lobbyMode === mode.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                          <mode.icon className="h-5 w-5" />
                          <span className="text-xs font-semibold">{mode.label}</span>
                          <span className="text-[10px] opacity-70">{mode.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Player Count (FFA) */}
                  {lobbyMode === "ffa" && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-muted-foreground">Max Players</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[3, 4, 6, 8].map((n) => (
                          <button key={n} onClick={() => setLobbyMaxPlayers(n)}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${lobbyMaxPlayers === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                            <Users className="mx-auto mb-1 h-4 w-4" />{n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Team Size */}
                  {lobbyMode === "team" && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-muted-foreground">Team Size (per team, 2 teams)</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setLobbyTeamSize(n)}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${lobbyTeamSize === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                            {n}v{n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Number of Problems */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Number of Problems</label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setLobbyProblemCount(n)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${lobbyProblemCount === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Duration</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[{ value: 600, label: "10m" }, { value: 900, label: "15m" }, { value: 1800, label: "30m" }, { value: 3600, label: "60m" }].map((opt) => (
                        <button key={opt.value} onClick={() => setLobbyDuration(opt.value)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${lobbyDuration === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
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
                        <span className="text-xs text-muted-foreground">Min</span>
                        <input type="number" value={lobbyDifficulty[0]} onChange={(e) => setLobbyDifficulty([+e.target.value, lobbyDifficulty[1]])} step={100} min={800} max={3500} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground" />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Max</span>
                        <input type="number" value={lobbyDifficulty[1]} onChange={(e) => setLobbyDifficulty([lobbyDifficulty[0], +e.target.value])} step={100} min={800} max={3500} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                      <Tag className="h-3 w-3" /> Tags (optional)
                    </label>
                    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-lg border border-border bg-secondary/50 p-2">
                      {CF_TAGS.map((tag) => (
                        <button key={tag} onClick={() => setLobbyTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${lobbyTags.includes(tag) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                          {tag}
                        </button>
                      ))}
                    </div>
                    {lobbyTags.length > 0 && <p className="mt-1 text-xs text-primary">{lobbyTags.length} tag(s) selected</p>}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={createLobby} disabled={creatingLobby}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-display font-semibold text-primary-foreground transition-all hover:glow-green disabled:opacity-50">
                      {creatingLobby ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                      {creatingLobby ? "Creating..." : `Create ${lobbyMode === "1v1" ? "Challenge" : lobbyMode === "ffa" ? `FFA (${lobbyMaxPlayers}p)` : `${lobbyTeamSize}v${lobbyTeamSize}`}`}
                    </button>
                    <button onClick={() => setShowLobby(false)} className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
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
