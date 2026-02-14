import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Shield, Ban, RefreshCw, AlertTriangle, Megaphone, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Report, Announcement, BlacklistedProblem, SiteSetting } from "@/lib/types";

export default function AdminPage() {
  const { profile, isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMsg, setAnnouncementMsg] = useState("");
  const [blacklistContest, setBlacklistContest] = useState("");
  const [blacklistIndex, setBlacklistIndex] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");

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

  const { data: announcements } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
      return (data || []) as unknown as Announcement[];
    },
  });

  const { data: blacklist } = useQuery({
    queryKey: ["admin-blacklist"],
    queryFn: async () => {
      const { data } = await supabase.from("blacklisted_problems").select("*").order("created_at", { ascending: false });
      return (data || []) as unknown as BlacklistedProblem[];
    },
  });

  const { data: maintenanceMode } = useQuery({
    queryKey: ["maintenance-mode"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").eq("key", "maintenance_mode").single();
      return data as unknown as SiteSetting | null;
    },
  });

  const isMaintenanceOn = (maintenanceMode?.value as any)?.enabled === true;

  const banUser = useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_banned: ban }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("User updated"); },
  });

  const resetRating = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ rating: 1000, rank: "Newbie", wins: 0, losses: 0, draws: 0 }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Rating reset"); },
  });

  const resolveReport = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-reports"] }); toast.success("Report resolved"); },
  });

  const createAnnouncement = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("announcements").insert({
        title: announcementTitle,
        message: announcementMsg,
        created_by: profile!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setAnnouncementTitle("");
      setAnnouncementMsg("");
      toast.success("Announcement posted");
    },
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Deleted");
    },
  });

  const toggleMaintenance = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("site_settings")
        .update({ value: { enabled: !isMaintenanceOn, message: "Site is under maintenance" }, updated_by: profile!.id } as any)
        .eq("key", "maintenance_mode");
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["maintenance-mode"] }); toast.success(isMaintenanceOn ? "Maintenance disabled" : "Maintenance enabled"); },
  });

  const addToBlacklist = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("blacklisted_problems").insert({
        contest_id: parseInt(blacklistContest),
        problem_index: blacklistIndex,
        reason: blacklistReason || null,
        created_by: profile!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blacklist"] });
      setBlacklistContest(""); setBlacklistIndex(""); setBlacklistReason("");
      toast.success("Problem blacklisted");
    },
  });

  const removeFromBlacklist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blacklisted_problems").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-blacklist"] }); toast.success("Removed"); },
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">
            <Shield className="mr-2 inline h-8 w-8 text-neon-purple" />
            Admin Panel
          </h1>
          {isSuperAdmin && <span className="mt-1 inline-block rounded-full bg-neon-purple/10 px-3 py-1 text-xs text-neon-purple">Super Admin</span>}
        </div>
        <button onClick={() => toggleMaintenance.mutate()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${isMaintenanceOn ? "bg-destructive text-destructive-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}>
          <Lock className="h-4 w-4" />
          {isMaintenanceOn ? "Disable Maintenance" : "Enable Maintenance"}
        </button>
      </div>

      {/* Announcements */}
      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold"><Megaphone className="h-5 w-5 text-neon-cyan" /> Announcements</h2>
        <div className="mb-4 space-y-2">
          <input value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} placeholder="Title" className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <textarea value={announcementMsg} onChange={(e) => setAnnouncementMsg(e.target.value)} placeholder="Message" rows={2} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <button onClick={() => createAnnouncement.mutate()} disabled={!announcementTitle.trim() || !announcementMsg.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4" /> Post</button>
        </div>
        <div className="space-y-2">
          {announcements?.map((a) => (
            <div key={a.id} className="flex items-start justify-between rounded-lg border border-border bg-secondary/50 p-3">
              <div>
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => deleteAnnouncement.mutate(a.id)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Blacklisted problems */}
      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold"><Ban className="h-5 w-5 text-destructive" /> Blacklisted Problems</h2>
        <div className="mb-4 flex gap-2">
          <input value={blacklistContest} onChange={(e) => setBlacklistContest(e.target.value)} placeholder="Contest ID" type="number" className="w-24 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-foreground" />
          <input value={blacklistIndex} onChange={(e) => setBlacklistIndex(e.target.value)} placeholder="Index" className="w-16 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-foreground" />
          <input value={blacklistReason} onChange={(e) => setBlacklistReason(e.target.value)} placeholder="Reason (optional)" className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <button onClick={() => addToBlacklist.mutate()} disabled={!blacklistContest || !blacklistIndex} className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1">
          {blacklist?.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-2">
              <span className="font-mono text-sm">{b.contest_id}{b.problem_index} {b.reason && `— ${b.reason}`}</span>
              <button onClick={() => removeFromBlacklist.mutate(b.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Reports */}
      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-neon-orange" /> Pending Reports ({reports?.length || 0})</h2>
        {reports?.length ? (
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
                <div>
                  <p className="text-sm">{report.reason}</p>
                  <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</p>
                </div>
                <button onClick={() => resolveReport.mutate(report.id)} className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Resolve</button>
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
                <th className="pb-2">User</th><th className="pb-2">Rating</th><th className="pb-2">CF Handle</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users?.map((user) => (
                <tr key={user.id} className="hover:bg-secondary/30">
                  <td className="py-3"><div className="flex items-center gap-2"><img src={user.avatar || ""} alt="" className="h-6 w-6 rounded-full" /><span className="font-medium">{user.username}</span></div></td>
                  <td className="py-3 font-mono">{user.rating}</td>
                  <td className="py-3 font-mono text-muted-foreground">{user.cf_handle || "—"}</td>
                  <td className="py-3">{user.is_banned ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Banned</span> : <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Active</span>}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => banUser.mutate({ userId: user.id, ban: !user.is_banned })} className="rounded p-1 text-muted-foreground hover:text-destructive" title={user.is_banned ? "Unban" : "Ban"}><Ban className="h-4 w-4" /></button>
                      {isSuperAdmin && <button onClick={() => resetRating.mutate(user.id)} className="rounded p-1 text-muted-foreground hover:text-neon-orange" title="Reset rating"><RefreshCw className="h-4 w-4" /></button>}
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
