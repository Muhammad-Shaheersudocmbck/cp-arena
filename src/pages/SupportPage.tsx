import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Send, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function SupportPage() {
  const { profile } = useAuth();
  const [reason, setReason] = useState("");
  const [reportedHandle, setReportedHandle] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitReport = useMutation({
    mutationFn: async () => {
      if (!profile || !reason.trim()) return;
      // Look up reported user by username or cf_handle
      let reportedUserId = profile.id; // default self-report / general
      if (reportedHandle.trim()) {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .or(`username.ilike.%${reportedHandle.trim()}%,cf_handle.ilike.%${reportedHandle.trim()}%`)
          .limit(1)
          .single();
        if (data) reportedUserId = data.id;
      }
      const { error } = await supabase.from("reports").insert({
        reporter_id: profile.id,
        reported_user_id: reportedUserId,
        reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubmitted(true);
      setReason("");
      setReportedHandle("");
      toast.success("Report submitted! We'll review it shortly.");
    },
    onError: () => toast.error("Failed to submit report"),
  });

  if (!profile) return null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl font-bold">
        <AlertTriangle className="mr-2 inline h-8 w-8 text-neon-orange" />
        <span className="text-gradient">Support & Report</span>
      </h1>

      {submitted ? (
        <div className="rounded-2xl border border-primary/30 bg-card p-8 text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h2 className="font-display text-xl font-bold">Report Submitted</h2>
          <p className="mt-2 text-sm text-muted-foreground">Our team will review your report and take action if needed.</p>
          <button onClick={() => setSubmitted(false)} className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground">
            Submit Another
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Report a user for cheating, inappropriate behavior, or any other issue. You can also use this form for general support requests.
          </p>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Reported Username (optional)</label>
            <input
              value={reportedHandle}
              onChange={(e) => setReportedHandle(e.target.value)}
              placeholder="Username or CF handle of the user..."
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Reason / Description *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the issue in detail..."
              rows={5}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={() => submitReport.mutate()}
            disabled={!reason.trim() || submitReport.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Submit Report
          </button>
        </div>
      )}
    </div>
  );
}
