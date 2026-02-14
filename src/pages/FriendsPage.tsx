import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, UserCheck, UserX, MessageSquare, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import RatingBadge from "@/components/RatingBadge";
import { getRankColor, SAFE_PROFILE_COLUMNS } from "@/lib/types";
import type { Profile, Friend } from "@/lib/types";

export default function FriendsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: friends = [] } = useQuery({
    queryKey: ["friends", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from("friends")
        .select("*")
        .or(`user_id.eq.${profile!.id},friend_id.eq.${profile!.id}`)
        .eq("status", "accepted");
      return (data || []) as unknown as Friend[];
    },
  });

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["friend-requests", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from("friends")
        .select("*")
        .eq("friend_id", profile!.id)
        .eq("status", "pending");
      return (data || []) as unknown as Friend[];
    },
  });

  const friendIds = friends.map((f) => f.user_id === profile?.id ? f.friend_id : f.user_id);
  const requestFromIds = pendingRequests.map((r) => r.user_id);
  const allIds = [...new Set([...friendIds, ...requestFromIds])];

  const { data: friendProfiles = [] } = useQuery({
    queryKey: ["friend-profiles", allIds],
    enabled: allIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", allIds);
      return (data || []) as Profile[];
    },
  });

  const getProfile = (id: string) => friendProfiles.find((p) => p.id === id);

  const isOnline = (p: Profile | undefined) => {
    if (!p?.online_at) return false;
    return Date.now() - new Date(p.online_at).getTime() < 5 * 60 * 1000;
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select(SAFE_PROFILE_COLUMNS)
      .or(`username.ilike.%${searchQuery.trim()}%,cf_handle.ilike.%${searchQuery.trim()}%`)
      .neq("id", profile!.id)
      .limit(20);
    setSearchResults((data || []) as Profile[]);
    setSearching(false);
  };

  const sendRequest = useMutation({
    mutationFn: async (friendId: string) => {
      const { error } = await supabase.from("friends").insert({ user_id: profile!.id, friend_id: friendId } as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["friends"] }); toast.success("Friend request sent!"); },
    onError: () => toast.error("Already sent or already friends"),
  });

  const acceptRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.from("friends").update({ status: "accepted" } as any).eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["friends"] }); queryClient.invalidateQueries({ queryKey: ["friend-requests"] }); toast.success("Friend request accepted!"); },
  });

  const removeFriend = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from("friends").delete().eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["friends"] }); toast.success("Removed"); },
  });

  if (!profile) return null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl font-bold"><span className="text-gradient">Friends</span></h1>

      {/* Search */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-4">
        <div className="flex gap-2">
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchUsers()} placeholder="Search by username or CF handle..." className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <button onClick={searchUsers} disabled={searching} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
            <Search className="h-4 w-4" />
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
                <Link to={`/profile/${user.id}`} className="flex items-center gap-3">
                  <div className="relative">
                    <img src={user.avatar || ""} alt="" className="h-8 w-8 rounded-full" />
                    {isOnline(user) && <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${getRankColor(user.rating)}`}>{user.username}</p>
                    <RatingBadge rating={user.rating} size="sm" />
                  </div>
                </Link>
                <button onClick={() => sendRequest.mutate(user.id)} className="rounded-lg bg-primary/10 p-2 text-primary hover:bg-primary/20">
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-6 rounded-2xl border border-neon-orange/30 bg-card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-neon-orange">Pending Requests ({pendingRequests.length})</h2>
          <div className="space-y-2">
            {pendingRequests.map((req) => {
              const p = getProfile(req.user_id);
              return (
                <div key={req.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
                  <div className="flex items-center gap-3">
                    <img src={p?.avatar || ""} alt="" className="h-8 w-8 rounded-full" />
                    <span className="text-sm font-medium">{p?.username || "User"}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => acceptRequest.mutate(req.id)} className="rounded-lg bg-primary/10 p-2 text-primary hover:bg-primary/20"><UserCheck className="h-4 w-4" /></button>
                    <button onClick={() => removeFriend.mutate(req.id)} className="rounded-lg bg-destructive/10 p-2 text-destructive hover:bg-destructive/20"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-semibold text-muted-foreground">Friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">No friends yet. Search for players above!</p>
        ) : (
          <div className="space-y-2">
            {friends.map((f) => {
              const friendProfileId = f.user_id === profile.id ? f.friend_id : f.user_id;
              const p = getProfile(friendProfileId);
              return (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
                  <Link to={`/profile/${friendProfileId}`} className="flex items-center gap-3">
                    <div className="relative">
                      <img src={p?.avatar || ""} alt="" className="h-8 w-8 rounded-full" />
                      {isOnline(p) && <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${getRankColor(p?.rating || 1000)}`}>{p?.username || "User"}</p>
                      <RatingBadge rating={p?.rating || 1000} size="sm" />
                    </div>
                  </Link>
                  <div className="flex gap-1">
                    <Link to={`/messages/${friendProfileId}`} className="rounded-lg bg-primary/10 p-2 text-primary hover:bg-primary/20"><MessageSquare className="h-4 w-4" /></Link>
                    <button onClick={() => removeFriend.mutate(f.id)} className="rounded-lg bg-destructive/10 p-2 text-destructive hover:bg-destructive/20"><UserX className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
