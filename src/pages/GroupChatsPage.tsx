import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Users, UserPlus, LogOut as LeaveIcon } from "lucide-react";
import { toast } from "sonner";
import { SAFE_PROFILE_COLUMNS, getRankColor } from "@/lib/types";
import RatingBadge from "@/components/RatingBadge";
import type { Profile, GroupChat, GroupMessage } from "@/lib/types";

export default function GroupChatsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<(GroupMessage & { senderProfile?: Partial<Profile> })[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // Fetch groups - use service-level approach: get all group_chats where user is a member
  const { data: groups = [], refetch: refetchGroups } = useQuery({
    queryKey: ["my-groups", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      // First get the group IDs the user is a member of
      const { data: memberships, error: memErr } = await supabase
        .from("group_chat_members")
        .select("group_id")
        .eq("user_id", profile!.id);
      
      if (memErr || !memberships || memberships.length === 0) return [];
      
      const groupIds = memberships.map((m: any) => m.group_id);
      const { data, error } = await supabase
        .from("group_chats")
        .select("*")
        .in("id", groupIds)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Groups fetch error:", error);
        return [];
      }
      return (data || []) as GroupChat[];
    },
  });

  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ["group-members", activeGroup],
    enabled: !!activeGroup,
    queryFn: async () => {
      const { data: memberData } = await supabase
        .from("group_chat_members")
        .select("user_id")
        .eq("group_id", activeGroup!);
      if (!memberData || memberData.length === 0) return [];
      const userIds = memberData.map((m: any) => m.user_id);
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", userIds);
      return (data || []) as Profile[];
    },
  });

  // Load messages
  useQuery({
    queryKey: ["group-messages", activeGroup],
    enabled: !!activeGroup,
    queryFn: async () => {
      const { data } = await supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", activeGroup!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) {
        const enriched = await Promise.all(
          data.map(async (msg: any) => {
            const cached = members.find((m) => m.id === msg.sender_id);
            if (cached) return { ...msg, senderProfile: cached };
            const { data: p } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", msg.sender_id).single();
            return { ...msg, senderProfile: p || undefined };
          })
        );
        setMessages(enriched);
      }
      return data;
    },
  });

  // Realtime group messages
  useEffect(() => {
    if (!activeGroup) return;
    const channel = supabase
      .channel(`group-${activeGroup}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${activeGroup}` },
        async (payload) => {
          const msg = payload.new as GroupMessage;
          const { data: p } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", msg.sender_id).single();
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, { ...msg, senderProfile: p || undefined }];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeGroup]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const createGroup = async () => {
    if (!profile || !newGroupName.trim() || creating) return;
    setCreating(true);
    try {
      // Step 1: Create the group
      const { data, error } = await supabase
        .from("group_chats")
        .insert({ name: newGroupName.trim(), description: newGroupDesc.trim() || "", created_by: profile.id } as any)
        .select()
        .single();
      
      if (error) {
        console.error("Group creation error:", error);
        toast.error("Failed to create group: " + error.message);
        return;
      }

      // Step 2: Add creator as member
      const { error: memberError } = await supabase
        .from("group_chat_members")
        .insert({ group_id: (data as any).id, user_id: profile.id } as any);
      
      if (memberError) {
        console.error("Member add error:", memberError);
        toast.error("Group created but failed to add you as member: " + memberError.message);
        return;
      }

      setShowCreate(false);
      setNewGroupName("");
      setNewGroupDesc("");
      refetchGroups();
      toast.success("Group created!");
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const sendGroupMessage = async () => {
    if (!message.trim() || !profile || !activeGroup) return;
    const text = message.trim();
    setMessage("");
    const optimisticMsg = {
      id: crypto.randomUUID(),
      group_id: activeGroup,
      sender_id: profile.id,
      message: text,
      created_at: new Date().toISOString(),
      edited_at: null,
      reply_to: null,
      senderProfile: profile,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    const { error } = await supabase.from("group_messages").insert({ group_id: activeGroup, sender_id: profile.id, message: text } as any);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      toast.error("Failed to send");
    }
  };

  const searchMembers = async () => {
    if (!memberSearch.trim()) return;
    const { data } = await supabase
      .from("profiles")
      .select(SAFE_PROFILE_COLUMNS)
      .ilike("username", `%${memberSearch.trim()}%`)
      .limit(10);
    setMemberResults((data || []) as Profile[]);
  };

  const addMember = async (userId: string) => {
    if (!activeGroup) return;
    const { error } = await supabase.from("group_chat_members").insert({ group_id: activeGroup, user_id: userId } as any);
    if (error) {
      toast.error("Failed to add member (may already be in group)");
    } else {
      toast.success("Member added!");
      refetchMembers();
      setShowAddMember(false);
      setMemberSearch("");
      setMemberResults([]);
    }
  };

  const leaveGroup = async () => {
    if (!activeGroup || !profile) return;
    await supabase.from("group_chat_members").delete().eq("group_id", activeGroup).eq("user_id", profile.id);
    setActiveGroup(null);
    setMessages([]);
    refetchGroups();
    toast.success("Left group");
  };

  const activeGroupData = groups.find((g) => g.id === activeGroup);

  if (!profile) return null;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 font-display text-3xl font-bold"><span className="text-gradient">Groups</span></h1>

      <div className="flex gap-4">
        {/* Sidebar */}
        <div className="w-64 shrink-0 space-y-2">
          <button onClick={() => setShowCreate(true)} className="flex w-full items-center gap-2 rounded-xl border border-primary/30 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10">
            <Plus className="h-4 w-4" /> New Group
          </button>

          {showCreate && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Group name" className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <input value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} placeholder="Description (optional)" className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <div className="flex gap-2">
                <button onClick={createGroup} disabled={!newGroupName.trim() || creating} className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {creating ? "Creating..." : "Create"}
                </button>
                <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
              </div>
            </div>
          )}

          {groups.map((g) => (
            <button key={g.id} onClick={() => { setActiveGroup(g.id); setMessages([]); }}
              className={`flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                activeGroup === g.id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/30"
              }`}>
              <Users className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate">{g.name}</p>
                {g.description && <p className="truncate text-xs text-muted-foreground">{g.description}</p>}
              </div>
            </button>
          ))}

          {groups.length === 0 && !showCreate && <p className="text-center text-sm text-muted-foreground">No groups yet</p>}
        </div>

        {/* Chat area */}
        <div className="flex-1">
          {activeGroup && activeGroupData ? (
            <div className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3 className="font-display font-semibold">{activeGroupData.name}</h3>
                  <p className="text-xs text-muted-foreground">{members.length} members</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setShowAddMember(!showAddMember)} className="rounded-lg p-2 text-muted-foreground hover:text-primary" title="Add member"><UserPlus className="h-4 w-4" /></button>
                  <button onClick={leaveGroup} className="rounded-lg p-2 text-muted-foreground hover:text-destructive" title="Leave group"><LeaveIcon className="h-4 w-4" /></button>
                </div>
              </div>

              {showAddMember && (
                <div className="border-b border-border p-3">
                  <div className="flex gap-2">
                    <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchMembers()} placeholder="Search username..." className="flex-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground" />
                    <button onClick={searchMembers} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">Search</button>
                  </div>
                  {memberResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {memberResults.map((u) => (
                        <div key={u.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-1.5">
                          <span className={`text-sm font-medium ${getRankColor(u.rating)}`}>{u.username}</span>
                          <button onClick={() => addMember(u.id)} className="rounded bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20">Add</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div ref={chatRef} className="h-[50vh] overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => {
                      const isMine = msg.sender_id === profile.id;
                      return (
                        <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                            {!isMine && (
                              <p className={`mb-1 text-xs font-semibold ${getRankColor(msg.senderProfile?.rating || 1000)}`}>
                                {msg.senderProfile?.username || "User"}
                              </p>
                            )}
                            {msg.message}
                            <p className={`mt-1 text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-border p-4">
                <div className="flex gap-2">
                  <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendGroupMessage()} placeholder="Type a message..." className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
                  <button onClick={sendGroupMessage} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"><Send className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-2xl border border-border bg-card">
              <p className="text-muted-foreground">Select a group or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
