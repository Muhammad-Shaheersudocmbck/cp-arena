import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Swords, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Match } from "@/lib/types";

export default function ChallengePage() {
  const { challengeCode } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: match, isLoading } = useQuery({
    queryKey: ["challenge", challengeCode],
    enabled: !!challengeCode,
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

  if (match.player1_id === profile.id) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <Swords className="mx-auto mb-4 h-12 w-12 text-primary" />
        <h1 className="mb-2 font-display text-2xl font-bold">Challenge Created!</h1>
        <p className="mb-6 text-muted-foreground">Share this link with your friend:</p>
        <div className="rounded-lg border border-border bg-secondary p-3">
          <p className="break-all font-mono text-sm text-foreground">
            {window.location.origin}/challenge/{challengeCode}
          </p>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/challenge/${challengeCode}`); toast.success("Copied!"); }}
          className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground"
        >
          Copy Link
        </button>
        <p className="mt-4 text-xs text-muted-foreground">
          Status: {match.status === "waiting" ? "Waiting for opponent..." : match.status}
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
      <p className="mb-6 text-muted-foreground">
        Duration: {match.duration / 60} minutes
      </p>
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
