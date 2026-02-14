import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Shield, Ban, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Report } from "@/lib/types";

export default function AdminPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("rating", { ascending: false });
      return (data || []) as Profile[];
    },
  });

  const { data: reports } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data } = await supabase.from("reports").select("*").eq("status", "pending").order("created_at", { ascending: false });
      return (data || []) as Report[];
    },
  });

  const banUser = useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_banned: ban }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User updated");
    },
  });

  const resetRating = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ rating: 1000, rank: "Newbie", wins: 0, losses: 0, draws: 0 })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Rating reset");
    },
  });

  const resolveReport = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      toast.success("Report resolved");
    },
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">
          <Shield className="mr-2 inline h-8 w-8 text-neon-purple" />
          Admin Panel
        </h1>
        {isSuperAdmin && (
          <span className="mt-1 inline-block rounded-full bg-neon-purple/10 px-3 py-1 text-xs text-neon-purple">
            Super Admin
          </span>
        )}
      </div>

      {/* Reports */}
      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <AlertTriangle className="h-5 w-5 text-neon-orange" />
          Pending Reports ({reports?.length || 0})
        </h2>
        {reports?.length ? (
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
                <div>
                  <p className="text-sm">{report.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => resolveReport.mutate(report.id)}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pending reports</p>
        )}
      </div>

      {/* User management */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">User Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2">User</th>
                <th className="pb-2">Rating</th>
                <th className="pb-2">CF Handle</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users?.map((user) => (
                <tr key={user.id} className="hover:bg-secondary/30">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <img src={user.avatar || ""} alt="" className="h-6 w-6 rounded-full" />
                      <span className="font-medium">{user.username}</span>
                    </div>
                  </td>
                  <td className="py-3 font-mono">{user.rating}</td>
                  <td className="py-3 font-mono text-muted-foreground">{user.cf_handle || "—"}</td>
                  <td className="py-3">
                    {user.is_banned ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Banned</span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Active</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => banUser.mutate({ userId: user.id, ban: !user.is_banned })}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        title={user.is_banned ? "Unban" : "Ban"}
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => resetRating.mutate(user.id)}
                          className="rounded p-1 text-muted-foreground hover:text-neon-orange"
                          title="Reset rating"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
