import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Announcement } from "@/lib/types";

export default function AnnouncementsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
      return (data || []) as Announcement[];
    },
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement deleted");
    },
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl font-bold">
        <Megaphone className="mr-2 inline h-8 w-8 text-neon-cyan" />
        <span className="text-gradient">Announcements</span>
      </h1>

      {announcements.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No announcements yet.</p>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <div key={a.id} className="rounded-2xl border border-neon-cyan/20 bg-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">{a.title}</h2>
                  <p className="mt-2 text-sm text-foreground/80">{a.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                {isAdmin && (
                  <button onClick={() => deleteAnnouncement.mutate(a.id)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
