import { getRankColor, getRankFromRating } from "@/lib/types";

interface RatingBadgeProps {
  rating: number;
  showRank?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function RatingBadge({ rating, showRank = true, size = "md" }: RatingBadgeProps) {
  const rank = getRankFromRating(rating);
  const colorClass = getRankColor(rating);
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-secondary font-mono font-semibold ${colorClass} ${sizeClasses[size]}`}>
      {rating}
      {showRank && <span className="text-muted-foreground font-normal">• {rank}</span>}
    </span>
  );
}
