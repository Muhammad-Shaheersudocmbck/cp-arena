import { Profile } from "@/lib/types";
import RatingBadge from "./RatingBadge";
import { Link } from "react-router-dom";

interface PlayerCardProps {
  profile: Profile;
  showLink?: boolean;
  compact?: boolean;
}

export default function PlayerCard({ profile, showLink = true, compact = false }: PlayerCardProps) {
  const content = (
    <div className={`flex items-center gap-3 ${compact ? "" : "rounded-xl border border-border bg-card p-4"}`}>
      <img
        src={profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.id}`}
        alt={profile.username || "Player"}
        className={`rounded-full ${compact ? "h-8 w-8" : "h-12 w-12"}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-display font-semibold ${compact ? "text-sm" : "text-base"}`}>
          {profile.username || "Anonymous"}
        </p>
        <div className="flex items-center gap-2">
          <RatingBadge rating={profile.rating} size="sm" />
          {profile.cf_handle && (
            <span className="text-xs text-muted-foreground font-mono">
              CF: {profile.cf_handle}
            </span>
          )}
        </div>
      </div>
      {!compact && (
        <div className="text-right text-xs text-muted-foreground">
          <p className="text-neon-green">{profile.wins}W</p>
          <p className="text-destructive">{profile.losses}L</p>
          <p>{profile.draws}D</p>
        </div>
      )}
    </div>
  );

  if (showLink) {
    return <Link to={`/profile/${profile.id}`} className="block transition-transform hover:scale-[1.02]">{content}</Link>;
  }
  return content;
}
