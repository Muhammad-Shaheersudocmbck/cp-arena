import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PenLine, Trash2, Pencil, X, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getRankColor, SAFE_PROFILE_COLUMNS } from "@/lib/types";
import type { Profile } from "@/lib/types";

interface Blog {
  id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function BlogsPage() {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: blogs = [] } = useQuery({
    queryKey: ["blogs"],
    queryFn: async () => {
      const { data } = await supabase.from("blogs").select("*").order("created_at", { ascending: false });
      return (data || []) as Blog[];
    },
  });

  const authorIds = [...new Set(blogs.map((b) => b.author_id))];
  const { data: authors = [] } = useQuery({
    queryKey: ["blog-authors", authorIds],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", authorIds);
      return (data || []) as Profile[];
    },
  });

  const getAuthor = (id: string) => authors.find((a) => a.id === id);

  const saveBlog = useMutation({
    mutationFn: async () => {
      if (!profile || !title.trim() || !content.trim()) return;
      if (editingId) {
        const { error } = await supabase.from("blogs").update({ title: title.trim(), content: content.trim() }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blogs").insert({ author_id: profile.id, title: title.trim(), content: content.trim() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] });
      setShowForm(false);
      setEditingId(null);
      setTitle("");
      setContent("");
      toast.success(editingId ? "Blog updated!" : "Blog published!");
    },
    onError: () => toast.error("Failed to save blog"),
  });

  const deleteBlog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blogs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] });
      toast.success("Blog deleted");
    },
  });

  const startEdit = (blog: Blog) => {
    setEditingId(blog.id);
    setTitle(blog.title);
    setContent(blog.content);
    setShowForm(true);
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">
          <span className="text-gradient">Blogs</span>
        </h1>
        {profile && (
          <button
            onClick={() => { setShowForm(!showForm); setEditingId(null); setTitle(""); setContent(""); }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "Write Blog"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">
            {editingId ? "Edit Blog" : "New Blog Post"}
          </h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Blog title..."
            className="mb-3 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your blog content..."
            rows={8}
            className="mb-3 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={() => saveBlog.mutate()}
            disabled={!title.trim() || !content.trim() || saveBlog.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <PenLine className="h-4 w-4" />
            {editingId ? "Update" : "Publish"}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {blogs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No blogs yet. Be the first to write one!</p>
        ) : (
          blogs.map((blog) => {
            const author = getAuthor(blog.author_id);
            const canEdit = profile?.id === blog.author_id || isAdmin;
            return (
              <div key={blog.id} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground">{blog.title}</h2>
                    <div className="mt-1 flex items-center gap-2">
                      {author && (
                        <Link to={`/profile/${author.id}`} className="flex items-center gap-2">
                          <img src={author.avatar || ""} alt="" className="h-5 w-5 rounded-full" />
                          <span className={`text-xs font-semibold ${getRankColor(author.rating)}`}>{author.username}</span>
                        </Link>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(blog.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(blog)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteBlog.mutate(blog.id)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground/80">{blog.content}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
