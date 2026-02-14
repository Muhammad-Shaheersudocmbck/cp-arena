import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Swords, Clock, Loader2, Copy, ExternalLink, Hash } from "lucide-react";
import { toast } from "sonner";
import type { Match } from "@/lib/types";

export default function ChallengePage() {
  const { challengeCode } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();

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
      return res.data as Match | null;
    },
  });

  const acceptChallenge = useMutation({
    mutationFn: async () => {
      if (!profile || !match) return;
      const { error } = await supabase
        .from("matches")
        .update({ player2_id: profile.id, status: "active", start_time: new Date(Date.now() + 10000).toISOString() })
        .eq("id", match.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Challenge accepted!");
      navigate(`/match/${match!.id}`);
    },
    onError: () => toast.error("Failed to accept challenge"),
  });

  // Redirect to match when it becomes active (for creator)
  if (match && match.status === "active" && match.player1_id === profile?.id) {
    navigate(`/match/${match.id}`);
    return null;
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

  const problemUrl = match.contest_id && match.problem_index
    ? `https://codeforces.com/problemset/problem/${match.contest_id}/${match.problem_index}`
    : null;

  const challengeLink = `${window.location.origin}/challenge/${challengeCode}`;

  if (match.player1_id === profile.id) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <Swords className="mx-auto mb-4 h-12 w-12 text-primary" />
        <h1 className="mb-2 font-display text-2xl font-bold">Challenge Created!</h1>
        <p className="mb-6 text-muted-foreground">Share the link or PIN with your friend:</p>

        {/* Game PIN */}
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">GAME PIN</p>
          <p className="font-mono text-3xl font-bold tracking-widest text-primary">{challengeCode}</p>
        </div>

        {/* Link */}
        <div className="mb-4 rounded-lg border border-border bg-secondary p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">CHALLENGE LINK</p>
          <p className="break-all font-mono text-sm text-foreground">{challengeLink}</p>
        </div>

        <button
          onClick={() => { navigator.clipboard.writeText(challengeLink); toast.success("Link copied!"); }}
          className="mr-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Copy className="h-4 w-4" /> Copy Link
        </button>
        <button
          onClick={() => { navigator.clipboard.writeText(challengeCode || ""); toast.success("PIN copied!"); }}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium text-primary"
        >
          <Hash className="h-4 w-4" /> Copy PIN
        </button>

        {/* Problem info */}
        {problemUrl && (
          <div className="mt-6">
            <a
              href={problemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
            >
              <ExternalLink className="h-4 w-4" />
              Problem: {match.contest_id}{match.problem_index}
              {match.problem_name && ` - ${match.problem_name}`}
              {match.problem_rating && ` (${match.problem_rating})`}
            </a>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Waiting for opponent to join...
        </p>
      </div>
    );
  }

  if (match.status !== "waiting") {
    navigate(`/match/${match.id}`);
    return null;
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-16 text-center">
      <Swords className="mx-auto mb-4 h-12 w-12 text-primary" />
      <h1 className="mb-2 font-display text-2xl font-bold">You've Been Challenged!</h1>
      <p className="mb-2 text-muted-foreground">
        Duration: {match.duration / 60} minutes
      </p>
      {match.problem_rating && (
        <p className="mb-4 text-sm text-muted-foreground">
          Problem difficulty: <span className="font-mono text-primary">{match.problem_rating}</span>
        </p>
      )}
      <button
        onClick={() => acceptChallenge.mutate()}
        disabled={acceptChallenge.isPending}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-display font-semibold text-primary-foreground transition-all hover:glow-green disabled:opacity-50"
      >
        {acceptChallenge.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Swords className="h-5 w-5" />}
        Accept Challenge
      </button>
    </div>
  );
}
