import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PenLine, Trash2, Pencil, X, Plus, MessageCircle, Send } from "lucide-react";
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

interface BlogComment {
  id: string;
  blog_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
}

export default function BlogsPage() {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expandedBlog, setExpandedBlog] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

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

  // All profiles for @mentions
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["all-profiles-mention"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS);
      return (data || []) as Profile[];
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["blog-comments", expandedBlog],
    enabled: !!expandedBlog,
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_comments")
        .select("*")
        .eq("blog_id", expandedBlog!)
        .order("created_at", { ascending: true });
      return (data || []) as BlogComment[];
    },
  });

  const commentAuthorIds = [...new Set(comments.map((c) => c.author_id))];
  const { data: commentAuthors = [] } = useQuery({
    queryKey: ["comment-authors", commentAuthorIds],
    enabled: commentAuthorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).in("id", commentAuthorIds);
      return (data || []) as Profile[];
    },
  });

  const getAuthor = (id: string) => authors.find((a) => a.id === id) || commentAuthors.find((a) => a.id === id);

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

  const addComment = useMutation({
    mutationFn: async (blogId: string) => {
      if (!profile || !commentText.trim()) return;
      const { error } = await supabase.from("blog_comments").insert({
        blog_id: blogId,
        author_id: profile.id,
        content: commentText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-comments"] });
      setCommentText("");
      toast.success("Comment posted!");
    },
    onError: () => toast.error("Failed to post comment"),
  });

  const editComment = useMutation({
    mutationFn: async (id: string) => {
      if (!editCommentText.trim()) return;
      const { error } = await supabase.from("blog_comments")
        .update({ content: editCommentText.trim(), edited_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-comments"] });
      setEditingCommentId(null);
      setEditCommentText("");
      toast.success("Comment updated");
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-comments"] });
      toast.success("Comment deleted");
    },
  });

  const startEdit = (blog: Blog) => {
    setEditingId(blog.id);
    setTitle(blog.title);
    setContent(blog.content);
    setShowForm(true);
  };

  // Render text with @mentions highlighted and linked
  const renderWithMentions = (text: string) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const username = part.slice(1);
        const mentioned = allProfiles.find((p) => p.username?.toLowerCase() === username.toLowerCase());
        if (mentioned) {
          return (
            <Link key={i} to={`/profile/${mentioned.id}`} className="font-semibold text-primary hover:underline">
              {part}
            </Link>
          );
        }
      }
      return <span key={i}>{part}</span>;
    });
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
          <p className="mb-2 text-xs text-muted-foreground">Use @username to mention users</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Blog title..."
            className="mb-3 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your blog content... Use @username to mention"
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
            const isExpanded = expandedBlog === blog.id;
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
                <div className="whitespace-pre-wrap text-sm text-foreground/80">{renderWithMentions(blog.content)}</div>

                {/* Comments section */}
                <div className="mt-4 border-t border-border pt-3">
                  <button
                    onClick={() => setExpandedBlog(isExpanded ? null : blog.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {isExpanded ? "Hide Comments" : "Comments"}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      {comments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No comments yet</p>
                      ) : (
                        comments.map((comment) => {
                          const cAuthor = getAuthor(comment.author_id);
                          const canEditComment = profile?.id === comment.author_id;
                          const canDeleteComment = profile?.id === comment.author_id || isAdmin;
                          return (
                            <div key={comment.id} className="group rounded-lg bg-secondary/50 p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {cAuthor && (
                                    <Link to={`/profile/${cAuthor.id}`} className="flex items-center gap-1.5">
                                      <img src={cAuthor.avatar || ""} alt="" className="h-4 w-4 rounded-full" />
                                      <span className={`text-xs font-semibold ${getRankColor(cAuthor.rating)}`}>{cAuthor.username}</span>
                                    </Link>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(comment.created_at).toLocaleString()}
                                    {comment.edited_at && " (edited)"}
                                  </span>
                                </div>
                                <div className="hidden gap-0.5 group-hover:flex">
                                  {canEditComment && (
                                    <button onClick={() => { setEditingCommentId(comment.id); setEditCommentText(comment.content); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                  {canDeleteComment && (
                                    <button onClick={() => deleteComment.mutate(comment.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {editingCommentId === comment.id ? (
                                <div className="mt-1 flex gap-1">
                                  <input value={editCommentText} onChange={(e) => setEditCommentText(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && editComment.mutate(comment.id)}
                                    className="flex-1 rounded bg-background px-2 py-1 text-xs text-foreground" autoFocus />
                                  <button onClick={() => editComment.mutate(comment.id)} className="text-xs text-primary">✓</button>
                                  <button onClick={() => setEditingCommentId(null)} className="text-xs text-muted-foreground">✗</button>
                                </div>
                              ) : (
                                <div className="mt-1 text-xs text-foreground/80">{renderWithMentions(comment.content)}</div>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Add comment */}
                      {profile && (
                        <div className="flex gap-2">
                          <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addComment.mutate(blog.id)}
                            placeholder="Write a comment... Use @username to mention"
                            className="flex-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                          />
                          <button
                            onClick={() => addComment.mutate(blog.id)}
                            disabled={!commentText.trim()}
                            className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
