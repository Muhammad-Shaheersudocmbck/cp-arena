import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Swords, Zap, Users, Trophy } from "lucide-react";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute -bottom-40 right-1/4 h-60 w-60 rounded-full bg-accent/5 blur-[80px]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary glow-green">
            <Swords className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">
            STEM <span className="text-gradient">ARENA</span>
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Competitive Programming Duels
          </p>
        </div>

        {/* Features */}
        <div className="mb-8 grid grid-cols-3 gap-3">
          {[
            { icon: Zap, label: "Real-time Duels" },
            { icon: Users, label: "2v2 Battles" },
            { icon: Trophy, label: "ELO Rankings" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3">
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Login button */}
        <button
          onClick={signInWithGoogle}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-card border border-border px-6 py-4 font-display font-semibold text-foreground transition-all hover:border-primary hover:glow-green"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Solve Codeforces problems in real-time duels. Climb the ranks.
        </p>
      </div>
    </div>
  );
}
