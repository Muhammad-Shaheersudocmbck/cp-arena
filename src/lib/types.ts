import { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Match = Tables<"matches">;
export type QueueEntry = Tables<"queue">;
export type Report = Tables<"reports">;
export type MatchMessage = Tables<"match_messages">;
export type UserRole = Tables<"user_roles">;

export type AppRole = "user" | "admin" | "super_admin";
export type MatchStatus = "waiting" | "active" | "finished";

export function getRankFromRating(rating: number): string {
  if (rating < 900) return "Beginner";
  if (rating < 1100) return "Newbie";
  if (rating < 1300) return "Pupil";
  if (rating < 1500) return "Specialist";
  if (rating < 1700) return "Expert";
  if (rating < 1900) return "Candidate Master";
  if (rating < 2100) return "Master";
  return "Grandmaster";
}

export function getRankColor(rating: number): string {
  if (rating < 900) return "text-muted-foreground";
  if (rating < 1100) return "text-muted-foreground";
  if (rating < 1300) return "text-neon-green";
  if (rating < 1500) return "text-neon-cyan";
  if (rating < 1700) return "text-neon-purple";
  if (rating < 1900) return "text-neon-orange";
  if (rating < 2100) return "text-neon-orange";
  return "text-neon-red";
}

export function calculateElo(
  ratingA: number,
  ratingB: number,
  scoreA: number // 1 = win, 0 = loss, 0.5 = draw
): { newRatingA: number; newRatingB: number; changeA: number; changeB: number } {
  const K = 32;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;

  const changeA = Math.round(K * (scoreA - expectedA));
  const changeB = Math.round(K * (scoreB - expectedB));

  return {
    newRatingA: ratingA + changeA,
    newRatingB: ratingB + changeB,
    changeA,
    changeB,
  };
}
