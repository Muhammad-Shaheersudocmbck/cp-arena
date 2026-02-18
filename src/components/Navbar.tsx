import { Swords, Trophy, Users, BarChart3, Shield, LogOut, User, Menu, X, PenLine, Megaphone, AlertTriangle, MessageSquare, Bell } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/matchmaking", label: "Arena", icon: Swords },
  { href: "/contests", label: "Contests", icon: Trophy },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/blogs", label: "Blogs", icon: PenLine },
  { href: "/announcements", label: "News", icon: Megaphone },
  { href: "/support", label: "Support", icon: AlertTriangle },
];

export default function Navbar() {
  const { profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-dms", profile?.id],
    enabled: !!profile,
    refetchInterval: 10000,
    queryFn: async () => {
      const { count } = await supabase
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", profile!.id)
        .is("read_at", null);
      return count || 0;
    },
  });

  const { data: unreadNotifs = 0 } = useQuery({
    queryKey: ["unread-notifs", profile?.id],
    enabled: !!profile,
    refetchInterval: 15000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile!.id)
        .eq("read", false);
      return count || 0;
    },
  });

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Swords className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            STEM <span className="text-gradient">ARENA</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/admin"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                location.pathname === "/admin" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          )}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Link to="/friends" className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground">
            <MessageSquare className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <Link to="/notifications" className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground">
            <Bell className="h-5 w-5" />
            {unreadNotifs > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadNotifs > 99 ? "99+" : unreadNotifs}
              </span>
            )}
          </Link>
          {profile && (
            <Link
              to={`/profile/${profile.id}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <img src={profile.avatar || ""} alt="avatar" className="h-6 w-6 rounded-full" />
              <span>{profile.username}</span>
            </Link>
          )}
          <button onClick={signOut} className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <Link to="/friends" className="relative rounded-lg p-2 text-muted-foreground">
            <MessageSquare className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <Link to="/notifications" className="relative rounded-lg p-2 text-muted-foreground">
            <Bell className="h-5 w-5" />
            {unreadNotifs > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
          </Link>
          <button className="rounded-lg p-2 text-muted-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 pb-4 lg:hidden">
          {navItems.map((item) => (
            <Link key={item.href} to={item.href} onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground">
              <Shield className="h-4 w-4" /> Admin
            </Link>
          )}
          {profile && (
            <Link to={`/profile/${profile.id}`} onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground">
              <User className="h-4 w-4" /> Profile
            </Link>
          )}
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
