import { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

// Safe columns to select from profiles (excludes email for privacy)
export const SAFE_PROFILE_COLUMNS = "id, user_id, username, avatar, rating, rank, cf_handle, cf_rating, wins, losses, draws, is_banned, created_at, updated_at, online_at" as const;
export type Match = Tables<"matches">;
export type QueueEntry = Tables<"queue">;
export type Report = Tables<"reports">;
export type MatchMessage = Tables<"match_messages">;
export type UserRole = Tables<"user_roles">;

export type AppRole = "user" | "admin" | "super_admin";
export type MatchStatus = "waiting" | "active" | "finished";

// Types for tables added via migration (not yet in generated types)
export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  read_at: string | null;
  edited_at: string | null;
  reply_to: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  created_by: string;
  expires_at: string | null;
  created_at: string;
}

export interface BlacklistedProblem {
  id: string;
  contest_id: number;
  problem_index: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export interface SiteSetting {
  key: string;
  value: Record<string, any>;
  updated_at: string;
  updated_by: string | null;
}

export interface Blog {
  id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface GroupChat {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
}

export interface GroupChatMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export interface Contest {
  id: string;
  title: string;
  description: string;
  created_by: string;
  start_time: string | null;
  duration: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ContestAuthor {
  id: string;
  contest_id: string;
  user_id: string;
  added_by: string;
  created_at: string;
}

export interface ContestProblem {
  id: string;
  contest_id: string;
  problem_order: number;
  problem_label: string;
  problem_url: string;
  problem_name: string;
  points: number;
  cf_contest_id?: number;
  cf_problem_index?: string;
  created_at: string;
}

export interface ContestRegistration {
  id: string;
  contest_id: string;
  user_id: string;
  registered_at: string;
}

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
  scoreA: number
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
