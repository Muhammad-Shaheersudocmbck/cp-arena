import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link as LinkIcon, Check, Loader2, Trophy, Swords, BarChart3, Pencil, UserPlus, MessageSquare, Camera } from "lucide-react";
import RatingGraph from "@/components/RatingGraph";
import { Link } from "react-router-dom";
import RatingBadge from "@/components/RatingBadge";
import { getRankFromRating, getRankColor, SAFE_PROFILE_COLUMNS } from "@/lib/types";
import { toast } from "sonner";
import axios from "axios";
import type { Profile, Match, Friend } from "@/lib/types";

export default function ProfilePage() {
  const { id } = useParams();
  const { profile: myProfile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [cfHandleInput, setCfHandleInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showAvatarEdit, setShowAvatarEdit] = useState(false);

  const isOwnProfile = myProfile?.id === id;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", id!).single();
      return data as Profile;
    },
  });

  const { data: matchHistory } = useQuery({
    queryKey: ["match-history", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("*").or(`player1_id.eq.${id},player2_id.eq.${id}`).eq("status", "finished").order("created_at", { ascending: false }).limit(200);
      return (data || []) as Match[];
    },
  });

  // Friends list for this profile
  const { data: friends = [] } = useQuery({
    queryKey: ["profile-friends", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("friends").select("*").or(`user_id.eq.${id},friend_id.eq.${id}`).eq("status", "accepted");
      return (data || []) as unknown as Friend[];
    },
  });

  const friendIds = friends.map((f) => f.user_id === id ? f.friend_id : f.user_id);
  const { data: friendProfiles = [] } = useQuery({
    queryKey: ["profile-friend-profiles", friendIds],
    enabled: friendIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", friendIds);
      return (data || []) as Profile[];
    },
  });

  const updateUsername = useMutation({
    mutationFn: async () => {
      if (!usernameInput.trim() || !myProfile) return;
      const { error } = await supabase.from("profiles").update({ username: usernameInput.trim() }).eq("id", myProfile.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setEditingUsername(false);
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["profile", id] });
      toast.success("Username updated!");
    },
    onError: () => toast.error("Failed to update username"),
  });

  const updateAvatar = useMutation({
    mutationFn: async () => {
      if (!avatarUrl.trim() || !myProfile) return;
      const { error } = await supabase.from("profiles").update({ avatar: avatarUrl.trim() }).eq("id", myProfile.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setShowAvatarEdit(false);
      setAvatarUrl("");
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["profile", id] });
      toast.success("Avatar updated!");
    },
    onError: () => toast.error("Failed to update avatar"),
  });

  const randomizeAvatar = async () => {
    if (!myProfile) return;
    const seed = Math.random().toString(36).substring(2, 10);
    const newUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
    const { error } = await supabase.from("profiles").update({ avatar: newUrl }).eq("id", myProfile.id);
    if (!error) {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["profile", id] });
      toast.success("Avatar randomized!");
    }
  };

  const sendFriendRequest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("friends").insert({ user_id: myProfile!.id, friend_id: id } as any);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Friend request sent!"),
    onError: () => toast.error("Already sent or already friends"),
  });

  const verifyCfHandle = async () => {
    if (!cfHandleInput.trim() || !myProfile) return;
    const handle = cfHandleInput.trim();
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(handle)) {
      toast.error("Invalid handle format (3-24 chars, letters/digits/hyphens only)");
      return;
    }
    setVerifying(true);
    try {
      const res = await axios.get(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
      if (res.data.status === "OK" && res.data.result.length > 0) {
        const cfUser = res.data.result[0];
        await supabase.from("profiles").update({ cf_handle: cfUser.handle, cf_rating: cfUser.rating || 0 }).eq("id", myProfile.id);
        await refreshProfile();
        queryClient.invalidateQueries({ queryKey: ["profile", id] });
        toast.success(`Connected: ${cfUser.handle}`);
        setCfHandleInput("");
      } else {
        toast.error("Handle not found");
      }
    } catch {
      toast.error("Failed to verify");
    } finally {
      setVerifying(false);
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalGames = profile.wins + profile.losses + profile.draws;
  const winRate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;
  const isOnline = profile.online_at && Date.now() - new Date(profile.online_at).getTime() < 5 * 60 * 1000;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 rounded-2xl border border-border arena-card p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* Avatar with edit */}
          <div className="relative group">
            <img src={profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.id}`} alt="" className="h-24 w-24 rounded-2xl" />
            {isOnline && <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-card bg-primary" />}
            {isOwnProfile && (
              <button
                onClick={() => setShowAvatarEdit(!showAvatarEdit)}
                className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/60 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Camera className="h-6 w-6 text-foreground" />
              </button>
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            {/* Username */}
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              {editingUsername ? (
                <div className="flex items-center gap-2">
                  <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && updateUsername.mutate()} className="rounded-lg border border-border bg-secondary px-2 py-1 font-display text-2xl font-bold text-foreground" autoFocus />
                  <button onClick={() => updateUsername.mutate()} className="rounded-lg bg-primary p-1 text-primary-foreground"><Check className="h-4 w-4" /></button>
                </div>
              ) : (
                <>
                  <h1 className={`font-display text-2xl font-bold ${getRankColor(profile.rating)}`}>{profile.username || "Anonymous"}</h1>
                  {isOwnProfile && (
                    <button onClick={() => { setEditingUsername(true); setUsernameInput(profile.username || ""); }} className="rounded p-1 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                  )}
                  {isOnline && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">Online</span>}
                </>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <RatingBadge rating={profile.rating} />
              <span className="text-sm text-muted-foreground">{getRankFromRating(profile.rating)}</span>
            </div>
            {profile.cf_handle && (
              <a href={`https://codeforces.com/profile/${profile.cf_handle}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-neon-cyan hover:underline">
                <LinkIcon className="h-3 w-3" /> CF: {profile.cf_handle} ({profile.cf_rating || "?"})
              </a>
            )}
            {!isOwnProfile && myProfile && (
              <div className="mt-3 flex items-center justify-center gap-2 sm:justify-start">
                <button onClick={() => sendFriendRequest.mutate()} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"><UserPlus className="h-3 w-3" /> Add Friend</button>
                <Link to={`/messages/${profile.id}`} className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80"><MessageSquare className="h-3 w-3" /> Message</Link>
              </div>
            )}
          </div>
        </div>

        {/* Avatar edit panel */}
        {showAvatarEdit && isOwnProfile && (
          <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-4">
            <h3 className="mb-2 text-sm font-semibold">Change Avatar</h3>
            <div className="flex gap-2">
              <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Paste image URL..." className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground" />
              <button onClick={() => updateAvatar.mutate()} disabled={!avatarUrl.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Set</button>
            </div>
            <button onClick={randomizeAvatar} className="mt-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              🎲 Randomize Avatar
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid grid-cols-4 gap-3">
          {[
            { label: "Wins", value: profile.wins, icon: Trophy, color: "text-primary" },
            { label: "Losses", value: profile.losses, icon: Swords, color: "text-destructive" },
            { label: "Draws", value: profile.draws, icon: BarChart3, color: "text-muted-foreground" },
            { label: "Win Rate", value: `${winRate}%`, icon: BarChart3, color: "text-neon-cyan" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border border-border bg-secondary/50 p-3 text-center">
              <Icon className={`mx-auto h-4 w-4 ${color}`} />
              <p className={`mt-1 font-mono text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* CF Handle connect */}
        {isOwnProfile && !profile.cf_handle && (
          <div className="mt-6 rounded-lg border border-border bg-secondary/50 p-4">
            <h3 className="mb-2 text-sm font-semibold">Connect Codeforces Handle</h3>
            <div className="flex gap-2">
              <input value={cfHandleInput} onChange={(e) => setCfHandleInput(e.target.value)} placeholder="Your Codeforces handle" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground" />
              <button onClick={verifyCfHandle} disabled={verifying || !cfHandleInput.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Verify
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Friends list on profile */}
      {friendProfiles.length > 0 && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">Friends ({friendProfiles.length})</h2>
          <div className="flex flex-wrap gap-3">
            {friendProfiles.map((fp) => (
              <Link key={fp.id} to={`/profile/${fp.id}`} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 transition-colors hover:border-primary/30">
                <div className="relative">
                  <img src={fp.avatar || ""} alt="" className="h-6 w-6 rounded-full" />
                  {fp.online_at && Date.now() - new Date(fp.online_at).getTime() < 5 * 60 * 1000 && (
                    <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-card bg-primary" />
                  )}
                </div>
                <span className={`text-xs font-semibold ${getRankColor(fp.rating)}`}>{fp.username}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Rating Graph */}
      {matchHistory && (
        <div className="mb-6">
          <RatingGraph matches={matchHistory} profileId={profile.id} currentRating={profile.rating} />
        </div>
      )}

      {/* Match history */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Match History</h2>
        {matchHistory?.length ? (
          <div className="space-y-2">
            {matchHistory.map((match) => {
              const isP1 = match.player1_id === profile.id;
              const isBotMatch = match.match_type === "bot";
              const won = isBotMatch
                ? (match.winner_id === profile.id)
                : (match.winner_id === profile.id);
              const draw = !match.winner_id && !(isBotMatch && match.player1_rating_change != null && match.player1_rating_change < 0);
              const ratingChange = isP1 ? match.player1_rating_change : match.player2_rating_change;
              // Skip +0 changes in display
              if (ratingChange === 0) return null;
              return (
                <Link key={match.id} to={`/match/${match.id}`} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 transition-colors hover:border-primary/30">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${won ? "bg-primary" : draw ? "bg-muted-foreground" : "bg-destructive"}`} />
                    <span className="font-mono text-sm">{match.contest_id}{match.problem_index}</span>
                    {isBotMatch && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">BOT</span>}
                    <span className="text-xs text-muted-foreground">{new Date(match.created_at).toLocaleDateString()}</span>
                  </div>
                  {ratingChange != null && (
                    <span className={`font-mono text-sm font-bold ${ratingChange > 0 ? "text-primary" : ratingChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {ratingChange > 0 ? "+" : ""}{ratingChange}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No match history yet.</p>
        )}
      </div>
    </div>
  );
}
