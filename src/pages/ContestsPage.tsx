import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, Plus, Clock, Users, ExternalLink, Trash2, UserPlus, X, Calendar, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SAFE_PROFILE_COLUMNS } from "@/lib/types";
import type { Contest, ContestProblem, ContestAuthor, ContestRegistration, Profile } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ContestsPage() {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(7200);
  const [editingContest, setEditingContest] = useState<string | null>(null);
  const [problemUrl, setProblemUrl] = useState("");
  const [problemName, setProblemName] = useState("");
  const [problemLabel, setProblemLabel] = useState("A");
  const [problemPoints, setProblemPoints] = useState(100);
  const [authorSearch, setAuthorSearch] = useState("");

  const { data: contests = [] } = useQuery({
    queryKey: ["contests"],
    queryFn: async () => {
      const { data } = await supabase.from("contests").select("*").order("created_at", { ascending: false });
      return (data || []) as unknown as Contest[];
    },
  });

  const { data: allAuthors = [] } = useQuery({
    queryKey: ["contest-authors"],
    queryFn: async () => {
      const { data } = await supabase.from("contest_authors").select("*");
      return (data || []) as unknown as ContestAuthor[];
    },
  });

  const { data: allProblems = [] } = useQuery({
    queryKey: ["contest-problems"],
    queryFn: async () => {
      const { data } = await supabase.from("contest_problems").select("*").order("problem_order", { ascending: true });
      return (data || []) as unknown as ContestProblem[];
    },
  });

  const { data: allRegistrations = [] } = useQuery({
    queryKey: ["contest-registrations"],
    queryFn: async () => {
      const { data } = await supabase.from("contest_registrations").select("*");
      return (data || []) as unknown as ContestRegistration[];
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["author-search", authorSearch],
    enabled: authorSearch.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).ilike("username", `%${authorSearch}%`).limit(5);
      return (data || []) as Profile[];
    },
  });

  // Get profiles for authors
  const authorIds = [...new Set(allAuthors.map(a => a.user_id))];
  const { data: authorProfiles = [] } = useQuery({
    queryKey: ["author-profiles", authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", authorIds);
      return (data || []) as Profile[];
    },
  });

  const creatorIds = [...new Set(contests.map(c => c.created_by))];
  const { data: creatorProfiles = [] } = useQuery({
    queryKey: ["creator-profiles", creatorIds.join(",")],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", creatorIds);
      return (data || []) as Profile[];
    },
  });

  const createContest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contests").insert({
        title, description, created_by: profile!.id,
        start_time: startTime || null, duration, status: "draft",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contests"] });
      setTitle(""); setDescription(""); setStartTime(""); setShowCreate(false);
      toast.success("Contest created!");
    },
    onError: () => toast.error("Failed to create contest"),
  });

  const publishContest = useMutation({
    mutationFn: async (contestId: string) => {
      const { error } = await supabase.from("contests").update({ status: "published" } as any).eq("id", contestId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contests"] }); toast.success("Contest published!"); },
  });

  const deleteContest = useMutation({
    mutationFn: async (contestId: string) => {
      const { error } = await supabase.from("contests").delete().eq("id", contestId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contests"] }); toast.success("Contest deleted"); },
  });

  const addProblem = useMutation({
    mutationFn: async (contestId: string) => {
      // Extract CF contest ID and index from URL if it's a CF link
      let cfContestId: number | null = null;
      let cfProblemIdx: string | null = null;
      const cfMatch = problemUrl.match(/codeforces\.com\/(?:contest|problemset\/problem)\/(\d+)\/(?:problem\/)?([A-Za-z]\d?)/);
      if (cfMatch) {
        cfContestId = parseInt(cfMatch[1]);
        cfProblemIdx = cfMatch[2].toUpperCase();
      }
      const existing = allProblems.filter(p => p.contest_id === contestId);
      const { error } = await supabase.from("contest_problems").insert({
        contest_id: contestId, problem_order: existing.length + 1,
        problem_label: problemLabel, problem_url: problemUrl,
        problem_name: problemName, points: problemPoints,
        cf_contest_id: cfContestId, cf_problem_index: cfProblemIdx,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contest-problems"] });
      setProblemUrl(""); setProblemName(""); setProblemLabel("A"); setProblemPoints(100);
      toast.success("Problem added!");
    },
  });

  const removeProblem = useMutation({
    mutationFn: async (problemId: string) => {
      const { error } = await supabase.from("contest_problems").delete().eq("id", problemId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contest-problems"] }); toast.success("Removed"); },
  });

  const addAuthor = useMutation({
    mutationFn: async ({ contestId, userId }: { contestId: string; userId: string }) => {
      const { error } = await supabase.from("contest_authors").insert({
        contest_id: contestId, user_id: userId, added_by: profile!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contest-authors"] });
      setAuthorSearch("");
      toast.success("Author added!");
    },
  });

  const removeAuthor = useMutation({
    mutationFn: async (authorId: string) => {
      const { error } = await supabase.from("contest_authors").delete().eq("id", authorId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contest-authors"] }); toast.success("Author removed"); },
  });

  const registerForContest = useMutation({
    mutationFn: async (contestId: string) => {
      const { error } = await supabase.from("contest_registrations").insert({
        contest_id: contestId, user_id: profile!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contest-registrations"] }); toast.success("Registered!"); },
  });

  const unregister = useMutation({
    mutationFn: async (contestId: string) => {
      const { error } = await supabase.from("contest_registrations").delete()
        .eq("contest_id", contestId).eq("user_id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contest-registrations"] }); toast.success("Unregistered"); },
  });

  const isContestAuthor = (contestId: string) =>
    allAuthors.some(a => a.contest_id === contestId && a.user_id === profile?.id);
  const canEditContest = (contest: Contest) =>
    isAdmin || contest.created_by === profile?.id || isContestAuthor(contest.id);

  const upcoming = contests.filter(c => c.status === "published" && (!c.start_time || new Date(c.start_time) > new Date()));
  const active = contests.filter(c => c.status === "published" && c.start_time && new Date(c.start_time) <= new Date() && new Date(c.start_time).getTime() + c.duration * 1000 > Date.now());
  const past = contests.filter(c => c.status === "published" && c.start_time && new Date(c.start_time).getTime() + c.duration * 1000 <= Date.now());
  const drafts = contests.filter(c => c.status === "draft");

  const ContestCard = ({ contest }: { contest: Contest }) => {
    const problems = allProblems.filter(p => p.contest_id === contest.id);
    const regs = allRegistrations.filter(r => r.contest_id === contest.id);
    const isRegistered = regs.some(r => r.user_id === profile?.id);
    const creator = creatorProfiles.find(p => p.id === contest.created_by);
    const authors = allAuthors.filter(a => a.contest_id === contest.id);
    const isEditing = editingContest === contest.id;
    const canEdit = canEditContest(contest);

    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">{contest.title}</h3>
            {contest.description && <p className="mt-1 text-sm text-muted-foreground">{contest.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {creator && <span>by {creator.username}</span>}
              {contest.start_time && (
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(contest.start_time).toLocaleString()}</span>
              )}
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{Math.floor(contest.duration / 3600)}h {Math.floor((contest.duration % 3600) / 60)}m</span>
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{regs.length} registered</span>
              <span>{problems.length} problem{problems.length !== 1 ? "s" : ""}</span>
            </div>
            {/* Author badges */}
            {authors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {authors.map(a => {
                  const ap = authorProfiles.find(p => p.id === a.user_id);
                  return ap ? (
                    <span key={a.id} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      ✏️ {ap.username}
                      {isAdmin && <button onClick={() => removeAuthor.mutate(a.id)} className="ml-1 text-destructive"><X className="inline h-2.5 w-2.5" /></button>}
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {contest.status === "published" && (
              <Link to={`/contests/${contest.id}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/30 inline-flex items-center gap-1">
                <Eye className="h-3 w-3" /> View
              </Link>
            )}
            {contest.status === "draft" && canEdit && (
              <button onClick={() => publishContest.mutate(contest.id)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Publish</button>
            )}
            {contest.status === "published" && profile && !isRegistered && (
              <button onClick={() => registerForContest.mutate(contest.id)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Register</button>
            )}
            {contest.status === "published" && isRegistered && (
              <button onClick={() => unregister.mutate(contest.id)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">Unregister</button>
            )}
            {canEdit && (
              <button onClick={() => setEditingContest(isEditing ? null : contest.id)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                <Plus className="h-4 w-4" />
              </button>
            )}
            {isAdmin && (
              <button onClick={() => deleteContest.mutate(contest.id)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Problems list - only show after start time */}
        {problems.length > 0 && contest.status !== "draft" && (
          (() => {
            const contestStarted = contest.start_time ? new Date(contest.start_time) <= new Date() : false;
            return contestStarted ? (
              <div className="mt-3 space-y-1">
                {problems.map(prob => (
                  <a key={prob.id} href={prob.problem_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm transition-colors hover:border-primary/30">
                    <span className="font-mono font-bold text-primary">{prob.problem_label}</span>
                    <span>{prob.problem_name || "Problem"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{prob.points}pts</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground italic">Problems hidden until contest starts</p>
            );
          })()
        )}

        {/* Edit panel */}
        {isEditing && canEdit && (
          <div className="mt-4 space-y-3 rounded-lg border border-border bg-secondary/50 p-4">
            <h4 className="text-sm font-semibold">Add Problem</h4>
            <div className="flex flex-wrap gap-2">
              <input value={problemLabel} onChange={e => setProblemLabel(e.target.value)} placeholder="Label (A, B...)" className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-mono" />
              <input value={problemUrl} onChange={e => setProblemUrl(e.target.value)} placeholder="Problem URL" className="flex-1 min-w-[200px] rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              <input value={problemName} onChange={e => setProblemName(e.target.value)} placeholder="Name" className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              <input value={problemPoints} onChange={e => setProblemPoints(Number(e.target.value))} type="number" placeholder="Points" className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-mono" />
              <button onClick={() => addProblem.mutate(contest.id)} disabled={!problemUrl} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Add</button>
            </div>
            {/* Existing problems in edit mode */}
            {problems.length > 0 && (
              <div className="space-y-1">
                {problems.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded border border-border bg-background px-2 py-1">
                    <span className="text-xs font-mono">{p.problem_label}. {p.problem_name || p.problem_url}</span>
                    <button onClick={() => removeProblem.mutate(p.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Add author (admin only) */}
            {isAdmin && (
              <>
                <h4 className="text-sm font-semibold">Add Author</h4>
                <div className="flex gap-2">
                  <input value={authorSearch} onChange={e => setAuthorSearch(e.target.value)} placeholder="Search username..." className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                </div>
                {searchResults.length > 0 && authorSearch.length >= 2 && (
                  <div className="space-y-1">
                    {searchResults.map(u => (
                      <button key={u.id} onClick={() => addAuthor.mutate({ contestId: contest.id, userId: u.id })}
                        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm hover:border-primary/30">
                        <img src={u.avatar || ""} alt="" className="h-5 w-5 rounded-full" />
                        <span>{u.username}</span>
                        <UserPlus className="ml-auto h-3 w-3 text-primary" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">
          <Trophy className="mr-2 inline h-8 w-8 text-neon-orange" />
          Contests
        </h1>
        {isAdmin && (
          <button onClick={() => setShowCreate(!showCreate)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Create Contest
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && isAdmin && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">New Contest</h2>
          <div className="space-y-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Contest title" className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">Start Time</label>
                <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs text-muted-foreground">Duration (sec)</label>
                <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-foreground" />
              </div>
            </div>
            <button onClick={() => createContest.mutate()} disabled={!title.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Create (Draft)</button>
          </div>
        </div>
      )}

      <Tabs defaultValue="upcoming">
        <TabsList className="mb-4">
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          {isAdmin && <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>}
        </TabsList>
        <TabsContent value="upcoming" className="space-y-4">
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming contests</p> : upcoming.map(c => <ContestCard key={c.id} contest={c} />)}
        </TabsContent>
        <TabsContent value="active" className="space-y-4">
          {active.length === 0 ? <p className="text-sm text-muted-foreground">No active contests</p> : active.map(c => <ContestCard key={c.id} contest={c} />)}
        </TabsContent>
        <TabsContent value="past" className="space-y-4">
          {past.length === 0 ? <p className="text-sm text-muted-foreground">No past contests</p> : past.map(c => <ContestCard key={c.id} contest={c} />)}
        </TabsContent>
        {isAdmin && (
          <TabsContent value="drafts" className="space-y-4">
            {drafts.length === 0 ? <p className="text-sm text-muted-foreground">No drafts</p> : drafts.map(c => <ContestCard key={c.id} contest={c} />)}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
