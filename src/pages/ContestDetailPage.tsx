import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Clock, Users, ExternalLink, CheckCircle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SAFE_PROFILE_COLUMNS } from "@/lib/types";
import type { Contest, ContestProblem, ContestRegistration, Profile } from "@/lib/types";
import RatingBadge from "@/components/RatingBadge";
import { getRankColor } from "@/lib/types";

interface ContestStanding {
  id: string;
  contest_id: string;
  user_id: string;
  score: number;
  penalty_time: number;
  problems_solved: number;
  updated_at: string;
}

interface ContestSubmission {
  id: string;
  contest_id: string;
  problem_id: string;
  user_id: string;
  solved_at: string;
}

export default function ContestDetailPage() {
  const { contestId } = useParams<{ contestId: string }>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [polling, setPolling] = useState(false);

  const { data: contest } = useQuery({
    queryKey: ["contest", contestId],
    queryFn: async () => {
      const { data } = await supabase.from("contests").select("*").eq("id", contestId!).single();
      return data as unknown as Contest;
    },
    enabled: !!contestId,
  });

  const { data: problems = [] } = useQuery({
    queryKey: ["contest-problems", contestId],
    queryFn: async () => {
      const { data } = await supabase.from("contest_problems").select("*").eq("contest_id", contestId!).order("problem_order", { ascending: true });
      return (data || []) as unknown as (ContestProblem & { cf_contest_id?: number; cf_problem_index?: string })[];
    },
    enabled: !!contestId,
  });

  const { data: registrations = [] } = useQuery({
    queryKey: ["contest-registrations", contestId],
    queryFn: async () => {
      const { data } = await supabase.from("contest_registrations").select("*").eq("contest_id", contestId!);
      return (data || []) as unknown as ContestRegistration[];
    },
    enabled: !!contestId,
  });

  const { data: standings = [] } = useQuery({
    queryKey: ["contest-standings", contestId],
    queryFn: async () => {
      const { data } = await supabase.from("contest_standings").select("*").eq("contest_id", contestId!).order("score", { ascending: false }).order("penalty_time", { ascending: true });
      return (data || []) as unknown as ContestStanding[];
    },
    enabled: !!contestId,
    refetchInterval: 15000,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["contest-submissions", contestId],
    queryFn: async () => {
      const { data } = await supabase.from("contest_submissions").select("*").eq("contest_id", contestId!);
      return (data || []) as unknown as ContestSubmission[];
    },
    enabled: !!contestId,
    refetchInterval: 15000,
  });

  const standingUserIds = [...new Set(standings.map(s => s.user_id))];
  const regUserIds = [...new Set(registrations.map(r => r.user_id))];
  const allUserIds = [...new Set([...standingUserIds, ...regUserIds])];

  const { data: userProfiles = [] } = useQuery({
    queryKey: ["contest-user-profiles", allUserIds.join(",")],
    enabled: allUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", allUserIds);
      return (data || []) as Profile[];
    },
  });

  const now = new Date();
  const hasStarted = contest?.start_time ? new Date(contest.start_time) <= now : false;
  const hasEnded = contest?.start_time ? new Date(contest.start_time).getTime() + contest.duration * 1000 <= now.getTime() : false;
  const isRegistered = registrations.some(r => r.user_id === profile?.id);

  // Time remaining
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    if (!contest?.start_time) return;
    const interval = setInterval(() => {
      const endTime = new Date(contest.start_time!).getTime() + contest.duration * 1000;
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setTimeLeft("Contest ended");
        clearInterval(interval);
        return;
      }
      const startRemaining = new Date(contest.start_time!).getTime() - Date.now();
      if (startRemaining > 0) {
        const h = Math.floor(startRemaining / 3600000);
        const m = Math.floor((startRemaining % 3600000) / 60000);
        const s = Math.floor((startRemaining % 60000) / 1000);
        setTimeLeft(`Starts in ${h}h ${m}m ${s}s`);
      } else {
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        setTimeLeft(`${h}h ${m}m ${s}s remaining`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [contest]);

  // Poll CF submissions for the current user
  const pollMySubmissions = useCallback(async () => {
    if (!profile?.cf_handle || !contest || !hasStarted || hasEnded || !isRegistered) return;
    setPolling(true);
    try {
      const cfRes = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(profile.cf_handle)}&count=50`);
      const cfData = await cfRes.json();
      if (cfData.status !== "OK") return;

      const contestStart = new Date(contest.start_time!).getTime() / 1000;

      for (const prob of problems) {
        if (!prob.cf_contest_id || !prob.cf_problem_index) continue;
        const alreadySolved = submissions.some(s => s.problem_id === prob.id && s.user_id === profile.id);
        if (alreadySolved) continue;

        const solved = cfData.result.find((sub: any) =>
          sub.problem.contestId === prob.cf_contest_id &&
          sub.problem.index === prob.cf_problem_index &&
          sub.verdict === "OK" &&
          sub.creationTimeSeconds >= contestStart
        );

        if (solved) {
          const solvedAt = new Date(solved.creationTimeSeconds * 1000).toISOString();
          // Insert submission
          await supabase.from("contest_submissions").insert({
            contest_id: contest.id,
            problem_id: prob.id,
            user_id: profile.id,
            solved_at: solvedAt,
          } as any);

          // Update standings
          const penaltyMinutes = Math.floor((solved.creationTimeSeconds - contestStart) / 60);
          const mySolves = submissions.filter(s => s.user_id === profile.id).length + 1;
          const myCurrentStanding = standings.find(s => s.user_id === profile.id);
          const newScore = (myCurrentStanding?.score || 0) + (prob.points || 100);
          const newPenalty = (myCurrentStanding?.penalty_time || 0) + penaltyMinutes;

          if (myCurrentStanding) {
            await supabase.from("contest_standings").update({
              score: newScore,
              penalty_time: newPenalty,
              problems_solved: mySolves,
              updated_at: new Date().toISOString(),
            } as any).eq("id", myCurrentStanding.id);
          } else {
            await supabase.from("contest_standings").insert({
              contest_id: contest.id,
              user_id: profile.id,
              score: prob.points || 100,
              penalty_time: penaltyMinutes,
              problems_solved: 1,
            } as any);
          }

          toast.success(`Solved ${prob.problem_label}. ${prob.problem_name}!`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["contest-submissions", contestId] });
      queryClient.invalidateQueries({ queryKey: ["contest-standings", contestId] });
    } catch (e) {
      console.error("CF poll error:", e);
    } finally {
      setPolling(false);
    }
  }, [profile, contest, problems, submissions, standings, hasStarted, hasEnded, isRegistered, contestId, queryClient]);

  // Auto-poll every 20 seconds during active contest
  useEffect(() => {
    if (!hasStarted || hasEnded || !isRegistered || !profile?.cf_handle) return;
    pollMySubmissions();
    const interval = setInterval(pollMySubmissions, 20000);
    return () => clearInterval(interval);
  }, [hasStarted, hasEnded, isRegistered, profile?.cf_handle, pollMySubmissions]);

  if (!contest) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const mySolvedProblemIds = new Set(submissions.filter(s => s.user_id === profile?.id).map(s => s.problem_id));

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Link to="/contests" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Contests
      </Link>

      {/* Contest header */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-bold">{contest.title}</h1>
        {contest.description && <p className="mt-1 text-muted-foreground">{contest.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {contest.start_time && <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{new Date(contest.start_time).toLocaleString()}</span>}
          <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{Math.floor(contest.duration / 3600)}h {Math.floor((contest.duration % 3600) / 60)}m</span>
          <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{registrations.length} registered</span>
        </div>
        {timeLeft && (
          <div className={`mt-3 inline-block rounded-lg px-3 py-1.5 text-sm font-semibold ${hasEnded ? "bg-muted text-muted-foreground" : hasStarted ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}>
            {timeLeft}
          </div>
        )}
        {polling && <span className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking submissions...</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Problems */}
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">
            {hasStarted ? "Problems" : "Problems (hidden until contest starts)"}
          </h2>
          {!hasStarted ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm">Problems will be revealed when the contest starts.</p>
              {contest.start_time && <p className="mt-1 text-xs">Start: {new Date(contest.start_time).toLocaleString()}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {problems.map(prob => {
                const isSolved = mySolvedProblemIds.has(prob.id);
                return (
                  <div key={prob.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${isSolved ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-primary/20"}`}>
                    {isSolved ? (
                      <CheckCircle className="h-5 w-5 shrink-0 text-primary" />
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 text-xs font-mono text-muted-foreground">{prob.problem_label}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${isSolved ? "text-primary" : ""}`}>
                        {prob.problem_label}. {prob.problem_name || "Problem"}
                      </p>
                      <p className="text-xs text-muted-foreground">{prob.points || 100} pts</p>
                    </div>
                    <a href={prob.problem_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
                      Solve on CF <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
          {hasStarted && !profile?.cf_handle && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              ⚠️ Link your Codeforces handle in your <Link to={`/profile/${profile?.id}`} className="underline">profile</Link> to track solves automatically.
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Leaderboard</h2>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] gap-1 border-b border-border px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Score</span>
              <span className="text-right">Pen</span>
            </div>
            {standings.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No solves yet</p>
            ) : (
              <div className="divide-y divide-border">
                {standings.map((s, i) => {
                  const user = userProfiles.find(u => u.id === s.user_id);
                  return (
                    <Link key={s.id} to={`/profile/${s.user_id}`}
                      className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] items-center gap-1 px-3 py-2 text-sm transition-colors hover:bg-secondary/50">
                      <span className={`font-mono text-xs font-bold ${i < 3 ? "text-neon-orange" : "text-muted-foreground"}`}>#{i + 1}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${s.user_id}`} alt="" className="h-6 w-6 rounded-full shrink-0" />
                        <span className={`truncate text-xs font-semibold ${getRankColor(user?.rating || 1000)}`}>{user?.username || "?"}</span>
                      </div>
                      <span className="text-right text-xs font-mono font-bold text-primary">{s.score}</span>
                      <span className="text-right text-xs font-mono text-muted-foreground">{s.penalty_time}m</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Registered participants */}
          <h3 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">Registered ({registrations.length})</h3>
          <div className="flex flex-wrap gap-1">
            {registrations.map(r => {
              const user = userProfiles.find(u => u.id === r.user_id);
              return user ? (
                <Link key={r.id} to={`/profile/${r.user_id}`} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground">
                  {user.username}
                </Link>
              ) : null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
