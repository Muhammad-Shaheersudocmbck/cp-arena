import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_ACTIONS = ["matchmake", "poll"] as const;
type ValidAction = (typeof VALID_ACTIONS)[number];

interface CFSubmission {
  id: number;
  contestId: number;
  problem: { contestId: number; index: string };
  verdict: string;
  creationTimeSeconds: number;
}

function calculateElo(ratingA: number, ratingB: number, scoreA: number) {
  const K = 32;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;
  return {
    changeA: Math.round(K * (scoreA - expectedA)),
    changeB: Math.round(K * (scoreB - expectedB)),
  };
}

function getRank(rating: number): string {
  if (rating < 900) return "Beginner";
  if (rating < 1100) return "Newbie";
  if (rating < 1300) return "Pupil";
  if (rating < 1500) return "Specialist";
  if (rating < 1700) return "Expert";
  if (rating < 1900) return "Candidate Master";
  if (rating < 2100) return "Master";
  return "Grandmaster";
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// Helper: look up profile.id from auth uid
async function getProfileId(supabase: any, authUid: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", authUid)
    .single();
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authentication check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUid = claimsData.claims.sub;
    
    // Look up profile ID from auth uid
    const profileId = await getProfileId(supabase, authUid);
    if (!profileId) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate input
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = body.action;
    if (typeof action !== "string" || !VALID_ACTIONS.includes(action as ValidAction)) {
      return new Response(JSON.stringify({ error: "Invalid action. Must be one of: " + VALID_ACTIONS.join(", ") }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization check using profile ID (not auth uid)
    const { data: isAdminResult } = await supabase.rpc("is_admin", { _user_id: authUid });
    if (!isAdminResult) {
      if (action === "matchmake") {
        const { data: inQueue } = await supabase
          .from("queue")
          .select("id")
          .eq("user_id", profileId)
          .limit(1);
        if (!inQueue || inQueue.length === 0) {
          return new Response(JSON.stringify({ error: "You must be in the queue to trigger matchmaking" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (action === "poll") {
        const { data: activeMatch } = await supabase
          .from("matches")
          .select("id")
          .eq("status", "active")
          .or(`player1_id.eq.${profileId},player2_id.eq.${profileId}`)
          .limit(1);
        if (!activeMatch || activeMatch.length === 0) {
          return new Response(JSON.stringify({ error: "You must be in an active match to poll" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // MATCHMAKING
    if (action === "matchmake") {
      const { data: queueEntries } = await supabase
        .from("queue")
        .select("*")
        .order("created_at", { ascending: true });

      if (!queueEntries || queueEntries.length === 0) {
        return new Response(JSON.stringify({ message: "No players in queue" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch problems once for all pairing attempts
      let problemData;
      try {
        const problemRes = await fetchWithTimeout("https://codeforces.com/api/problemset.problems", 10000);
        problemData = await problemRes.json();
      } catch {
        return new Response(JSON.stringify({ error: "Codeforces API timeout" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (problemData.status !== "OK") {
        return new Response(JSON.stringify({ error: "Codeforces API error" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get blacklisted problems
      const { data: blacklist } = await supabase
        .from("blacklisted_problems")
        .select("contest_id, problem_index");
      const blackSet = new Set((blacklist || []).map((b: any) => `${b.contest_id}${b.problem_index}`));

      // Try to pair compatible players
      if (queueEntries.length >= 2) {
        for (let i = 0; i < queueEntries.length; i++) {
          for (let j = i + 1; j < queueEntries.length; j++) {
            const a = queueEntries[i];
            const b = queueEntries[j];

            // Use intersection of rating ranges
            const minRating = Math.max(a.rating_min, b.rating_min);
            const maxRating = Math.min(a.rating_max, b.rating_max);
            if (minRating > maxRating) continue;

            const problems = problemData.result.problems.filter(
              (p: any) => p.rating && p.rating >= minRating && p.rating <= maxRating && p.contestId
                && !blackSet.has(`${p.contestId}${p.index}`)
            );

            if (problems.length === 0) continue;

            const problem = problems[Math.floor(Math.random() * problems.length)];
            const startTime = new Date(Date.now() + 10000).toISOString();

            const { data: match, error: matchError } = await supabase.from("matches").insert({
              player1_id: a.user_id,
              player2_id: b.user_id,
              contest_id: problem.contestId,
              problem_index: problem.index,
              problem_name: problem.name,
              problem_rating: problem.rating,
              start_time: startTime,
              duration: Math.min(a.duration, b.duration),
              status: "active",
            }).select().single();

            if (matchError) {
              console.error("Match creation error:", matchError);
              continue;
            }

            // Remove both from queue
            await supabase.from("queue").delete().in("id", [a.id, b.id]);

            return new Response(JSON.stringify({ match }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      // No human pair found. Check if any player has been waiting > 30s — give them a bot match
      const now = Date.now();
      for (const entry of queueEntries) {
        const waitTime = now - new Date(entry.created_at).getTime();
        if (waitTime < 30000) continue; // wait at least 30s before bot

        // Find a suitable problem
        const problems = problemData.result.problems.filter(
          (p: any) => p.rating && p.rating >= entry.rating_min && p.rating <= entry.rating_max && p.contestId
            && !blackSet.has(`${p.contestId}${p.index}`)
        );
        if (problems.length === 0) continue;

        const problem = problems[Math.floor(Math.random() * problems.length)];
        const startTime = new Date(Date.now() + 5000).toISOString();

        // Create match with match_type = 'bot' and no player2 (bot match)
        const { data: match, error: matchError } = await supabase.from("matches").insert({
          player1_id: entry.user_id,
          player2_id: null,
          contest_id: problem.contestId,
          problem_index: problem.index,
          problem_name: problem.name,
          problem_rating: problem.rating,
          start_time: startTime,
          duration: entry.duration,
          status: "active",
          match_type: "bot",
        }).select().single();

        if (matchError) {
          console.error("Bot match creation error:", matchError);
          continue;
        }

        await supabase.from("queue").delete().eq("id", entry.id);

        return new Response(JSON.stringify({ match, bot: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "No compatible pairs yet, keep waiting..." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POLL: Check active matches for CF solutions
    if (action === "poll") {
      // Only poll matches the caller is in (unless admin)
      let matchQuery = supabase.from("matches").select("*").eq("status", "active");
      if (!isAdminResult) {
        matchQuery = matchQuery.or(`player1_id.eq.${profileId},player2_id.eq.${profileId}`);
      }
      const { data: activeMatches } = await matchQuery;

      if (!activeMatches || activeMatches.length === 0) {
        return new Response(JSON.stringify({ message: "No active matches" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];

      for (const match of activeMatches) {
        if (!match.start_time) continue;
        const matchStartTime = new Date(match.start_time).getTime() / 1000;
        const matchEndTime = matchStartTime + match.duration;
        const now = Date.now() / 1000;

        // Skip bot matches for CF polling (bot has no cf_handle)
        const isBotMatch = match.match_type === "bot";

        // Check if match expired
        if (now > matchEndTime) {
          if (isBotMatch) {
            // Bot match: if player solved, they win; otherwise draw (no rating change)
            let winnerId = null;
            if (match.player1_solved_at) winnerId = match.player1_id;

            await supabase.from("matches").update({
              status: "finished",
              winner_id: winnerId,
              player1_rating_change: 0,
              player2_rating_change: 0,
            }).eq("id", match.id);

            results.push({ matchId: match.id, status: "finished", winnerId, bot: true });
          } else {
            // Normal match expiry with rating changes
            const { data: p1 } = await supabase.from("profiles").select("*").eq("id", match.player1_id).single();
            const { data: p2 } = await supabase.from("profiles").select("*").eq("id", match.player2_id!).single();
            if (!p1 || !p2) continue;

            let winnerId = null;
            let scoreA = 0.5;

            if (match.player1_solved_at && !match.player2_solved_at) {
              winnerId = match.player1_id;
              scoreA = 1;
            } else if (!match.player1_solved_at && match.player2_solved_at) {
              winnerId = match.player2_id;
              scoreA = 0;
            } else if (match.player1_solved_at && match.player2_solved_at) {
              winnerId = new Date(match.player1_solved_at) <= new Date(match.player2_solved_at)
                ? match.player1_id : match.player2_id;
              scoreA = winnerId === match.player1_id ? 1 : 0;
            }

            const elo = calculateElo(p1.rating, p2.rating, scoreA);

            await supabase.from("matches").update({
              status: "finished",
              winner_id: winnerId,
              player1_rating_change: elo.changeA,
              player2_rating_change: elo.changeB,
            }).eq("id", match.id);

            await supabase.from("profiles").update({
              rating: p1.rating + elo.changeA,
              rank: getRank(p1.rating + elo.changeA),
              wins: p1.wins + (scoreA === 1 ? 1 : 0),
              losses: p1.losses + (scoreA === 0 ? 1 : 0),
              draws: p1.draws + (scoreA === 0.5 ? 1 : 0),
            }).eq("id", match.player1_id);

            await supabase.from("profiles").update({
              rating: p2.rating + elo.changeB,
              rank: getRank(p2.rating + elo.changeB),
              wins: p2.wins + (scoreA === 0 ? 1 : 0),
              losses: p2.losses + (scoreA === 1 ? 1 : 0),
              draws: p2.draws + (scoreA === 0.5 ? 1 : 0),
            }).eq("id", match.player2_id!);

            results.push({ matchId: match.id, status: "finished", winnerId });
          }
          continue;
        }

        // Poll CF submissions for player1 (always exists)
        if (!match.player1_solved_at) {
          const { data: player } = await supabase.from("profiles").select("cf_handle").eq("id", match.player1_id).single();
          if (player?.cf_handle) {
            try {
              const cfRes = await fetchWithTimeout(
                `https://codeforces.com/api/user.status?handle=${encodeURIComponent(player.cf_handle)}&count=20`,
                10000
              );
              const cfData = await cfRes.json();
              if (cfData.status === "OK") {
                const solved = cfData.result.find((sub: CFSubmission) =>
                  sub.problem.contestId === match.contest_id &&
                  sub.problem.index === match.problem_index &&
                  sub.verdict === "OK" &&
                  sub.creationTimeSeconds >= matchStartTime
                );
                if (solved) {
                  const solvedAt = new Date(solved.creationTimeSeconds * 1000).toISOString();
                  await supabase.from("matches").update({ player1_solved_at: solvedAt }).eq("id", match.id);
                  results.push({ matchId: match.id, player: "player1", solvedAt });

                  // In bot matches, if player solves it, end the match immediately (they win, no rating change)
                  if (isBotMatch) {
                    await supabase.from("matches").update({
                      status: "finished",
                      winner_id: match.player1_id,
                      player1_rating_change: 0,
                      player2_rating_change: 0,
                    }).eq("id", match.id);
                    results.push({ matchId: match.id, status: "finished", winnerId: match.player1_id, bot: true });
                  }
                }
              }
            } catch (e) {
              console.error(`CF API error for player1:`, e);
            }
          }
        }

        // Poll player2 only if it's not a bot match and player2 exists
        if (!isBotMatch && match.player2_id && !match.player2_solved_at) {
          const { data: player } = await supabase.from("profiles").select("cf_handle").eq("id", match.player2_id).single();
          if (player?.cf_handle) {
            try {
              const cfRes = await fetchWithTimeout(
                `https://codeforces.com/api/user.status?handle=${encodeURIComponent(player.cf_handle)}&count=20`,
                10000
              );
              const cfData = await cfRes.json();
              if (cfData.status === "OK") {
                const solved = cfData.result.find((sub: CFSubmission) =>
                  sub.problem.contestId === match.contest_id &&
                  sub.problem.index === match.problem_index &&
                  sub.verdict === "OK" &&
                  sub.creationTimeSeconds >= matchStartTime
                );
                if (solved) {
                  const solvedAt = new Date(solved.creationTimeSeconds * 1000).toISOString();
                  await supabase.from("matches").update({ player2_solved_at: solvedAt }).eq("id", match.id);
                  results.push({ matchId: match.id, player: "player2", solvedAt });
                }
              }
            } catch (e) {
              console.error(`CF API error for player2:`, e);
            }
          }
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Arena engine error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
