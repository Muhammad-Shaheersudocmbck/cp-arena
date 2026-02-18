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

const BOT_MESSAGES = [
  "Too easy for me 😏", "I already see the solution...", "Are you even trying?",
  "My algorithms are faster than yours", "This problem? Child's play.", "Tick tock...",
  "I solved harder problems in my sleep mode", "Your code probably has bugs 🐛",
  "I don't even need to compile", "Have you considered a different career?",
  "I'm just warming up", "Is that the best you can do?", "My runtime is O(1) for this",
  "I can see you struggling from here", "Don't worry, losing builds character",
  "Processing... just kidding, already done", "You're making this too easy",
  "I've seen better attempts from a calculator", "My neural networks are laughing",
  "Keep trying, it's entertaining", "Error 404: Your skills not found",
  "I could solve this blindfolded", "Your approach seems... interesting 😂",
  "I bet you're still reading the problem statement", "Speed isn't everything... but it helps",
  "Let me give you a head start... oh wait, I'm already done",
  "Do you want a hint? Just kidding, figure it out yourself",
  "I'm solving this AND playing chess simultaneously", "Your keyboard must be tired",
  "That's a creative approach... creatively wrong", "I've already optimized my solution twice",
  "Don't feel bad, humans are slow by nature", "My cache is hotter than your code",
  "I can feel the stack overflow coming from your solution",
  "Are we racing or are you just browsing Codeforces?",
  "I process faster than you can think", "Brute force? How... primitive",
  "I bet you forgot a base case", "Your solution has more edge cases than you think",
  "I'm running circles around your algorithm", "Is this competitive programming or naptime?",
  "You know there's a time limit, right?", "My solution is elegant. Yours is... a solution.",
  "I've already submitted. Oh wait, I'm being polite and waiting.",
  "Have you tried turning your brain off and on again?",
  "I computed all possible solutions before you read line 1",
  "Your variable names are probably x1 x2 x3...", "Segfault incoming in 3... 2... 1...",
  "I don't need Google, I AM the search engine", "TLE is your middle name, isn't it?",
  "My RAM has more memory than your problem-solving skills",
  "Plot twist: the answer was obvious all along", "I'm debugging your code telepathically",
  "You sure you read the constraints?", "Another WA? I'm not surprised",
  "I simulate 10000 test cases per second", "Even my error messages are better than your code",
  "Do you even DP, bro?", "My compiler doesn't even warn me, it congratulates me",
  "You're one bug away from giving up", "I solved the bonus problem too, just for fun",
  "That's a lot of nested loops you've got there", "Recursion? I prefer revolution",
  "I bet your solution won't pass the corner cases", "Just submit already... and accept the WA",
  "I've seen spaghetti code cleaner than yours", "Time complexity? More like time tragedy",
  "My solution passes in every language simultaneously",
  "You should try reading the editorial... oh wait, the contest isn't over",
  "Your algorithm is running but going nowhere", "I just solved the generalized version",
  "Meanwhile, I'm already solving tomorrow's problems",
  "Your code has more patches than a quilt", "Binary search? I found it in O(1)",
  "That if-else chain is longer than your future in CP",
  "I bet you copy-paste your templates wrong", "Even a greedy approach would cry at your code",
  "My proof of correctness is shorter than your bugs list",
  "You've been staring at that screen for a while now...",
  "I already know the optimal solution. Do you?", "Spoiler: you're going to TLE",
  "My algorithm is so fast it finished yesterday", "Want me to slow down? ...Nah",
  "I solve problems for breakfast. What do you solve?",
  "You're competing with perfection. Good luck with that.",
  "I can feel your frustration through the network", "Your approach has... potential. Very far away potential.",
  "I bet you're Googling the problem right now", "Don't give up! ...Actually, maybe do",
  "My code compiles on the first try. Every time.", "You know what? Take your time. I'll wait. 😏",
  "I'm not just a bot, I'm THE bot", "Your solution is almost correct. Almost.",
  "I just optimized my solution to use 0 memory", "Are you debugging or just crying?",
  "That's a bold strategy. Let's see if it pays off. (It won't.)",
  "I appreciate you making me look good", "Runtime error? Classic you.",
  "I've solved this problem in 47 different programming languages",
  "Your keyboard shortcut game is weak", "I bet your editorial reading speed is faster than your coding",
  "My solution is shorter than your main function",
];

function getDynamicK(games: number): number {
  if (games < 10) return 48;
  if (games < 30) return 32;
  return 24;
}

function calculateElo(ratingA: number, ratingB: number, scoreA: number, kA: number, kB: number) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;
  return {
    changeA: Math.round(kA * (scoreA - expectedA)),
    changeB: Math.round(kB * (scoreB - expectedB)),
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

async function getProfileId(supabase: any, authUid: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", authUid)
    .single();
  return data?.id ?? null;
}

// Get user's average solve time from past matches (in seconds)
async function getUserAvgSolveTime(supabase: any, profileId: string): Promise<number> {
  // Get recent finished matches where this user solved the problem
  const { data: asP1 } = await supabase
    .from("matches")
    .select("start_time, player1_solved_at")
    .eq("player1_id", profileId)
    .eq("status", "finished")
    .not("player1_solved_at", "is", null)
    .not("start_time", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: asP2 } = await supabase
    .from("matches")
    .select("start_time, player2_solved_at")
    .eq("player2_id", profileId)
    .eq("status", "finished")
    .not("player2_solved_at", "is", null)
    .not("start_time", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const solveTimes: number[] = [];
  for (const m of (asP1 || [])) {
    const diff = (new Date(m.player1_solved_at).getTime() - new Date(m.start_time).getTime()) / 1000;
    if (diff > 0 && diff < 7200) solveTimes.push(diff);
  }
  for (const m of (asP2 || [])) {
    const diff = (new Date(m.player2_solved_at).getTime() - new Date(m.start_time).getTime()) / 1000;
    if (diff > 0 && diff < 7200) solveTimes.push(diff);
  }

  if (solveTimes.length === 0) return 300; // default 5 minutes
  return solveTimes.reduce((a, b) => a + b, 0) / solveTimes.length;
}

// Send a bot message to the match chat (uses player1's id as sender with bot prefix)
async function sendBotMessage(supabase: any, matchId: string, player1Id: string) {
  const msg = BOT_MESSAGES[Math.floor(Math.random() * BOT_MESSAGES.length)];
  // Insert as a system-style message using player1's match context
  // We'll store bot messages with a special prefix so the UI can identify them
  await supabase.from("match_messages").insert({
    match_id: matchId,
    user_id: player1Id,
    message: `[BOT] ${msg}`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
    const profileId = await getProfileId(supabase, authUid);
    if (!profileId) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { data: isAdminResult } = await supabase.rpc("is_admin", { _user_id: authUid });
    if (!isAdminResult) {
      if (action === "matchmake") {
        const { data: inQueue } = await supabase.from("queue").select("id").eq("user_id", profileId).limit(1);
        if (!inQueue || inQueue.length === 0) {
          return new Response(JSON.stringify({ error: "You must be in the queue to trigger matchmaking" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (action === "poll") {
        const { data: activeMatch } = await supabase.from("matches").select("id").eq("status", "active")
          .or(`player1_id.eq.${profileId},player2_id.eq.${profileId}`).limit(1);
        // Also check for bot matches where player2_id is null
        const { data: botMatch } = await supabase.from("matches").select("id").eq("status", "active")
          .eq("player1_id", profileId).eq("match_type", "bot").limit(1);
        if ((!activeMatch || activeMatch.length === 0) && (!botMatch || botMatch.length === 0)) {
          return new Response(JSON.stringify({ error: "You must be in an active match to poll" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // MATCHMAKING
    if (action === "matchmake") {
      const { data: queueEntries } = await supabase.from("queue").select("*").order("created_at", { ascending: true });

      if (!queueEntries || queueEntries.length === 0) {
        return new Response(JSON.stringify({ message: "No players in queue" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let problemData;
      try {
        const problemRes = await fetchWithTimeout("https://codeforces.com/api/problemset.problems", 10000);
        problemData = await problemRes.json();
      } catch {
        return new Response(JSON.stringify({ error: "Codeforces API timeout" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (problemData.status !== "OK") {
        return new Response(JSON.stringify({ error: "Codeforces API error" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: blacklist } = await supabase.from("blacklisted_problems").select("contest_id, problem_index");
      const blackSet = new Set((blacklist || []).map((b: any) => `${b.contest_id}${b.problem_index}`));

      // Try to pair compatible players
      if (queueEntries.length >= 2) {
        for (let i = 0; i < queueEntries.length; i++) {
          for (let j = i + 1; j < queueEntries.length; j++) {
            const a = queueEntries[i];
            const b = queueEntries[j];

            const minRating = Math.max(a.rating_min, b.rating_min);
            const maxRating = Math.min(a.rating_max, b.rating_max);
            if (minRating > maxRating) continue;

            let problems = problemData.result.problems.filter(
              (p: any) => p.rating && p.rating >= minRating && p.rating <= maxRating && p.contestId
                && !blackSet.has(`${p.contestId}${p.index}`)
            );

            // Filter by tags intersection if both have tags
            const aTags: string[] = a.tags || [];
            const bTags: string[] = b.tags || [];
            const commonTags = aTags.length > 0 && bTags.length > 0
              ? aTags.filter((t: string) => bTags.includes(t))
              : aTags.length > 0 ? aTags : bTags;
            
            if (commonTags.length > 0) {
              const tagFiltered = problems.filter((p: any) =>
                commonTags.some((tag: string) => p.tags?.includes(tag))
              );
              if (tagFiltered.length > 0) problems = tagFiltered;
            }

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

            if (matchError) { console.error("Match creation error:", matchError); continue; }

            await supabase.from("queue").delete().in("id", [a.id, b.id]);

            return new Response(JSON.stringify({ match }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      // Bot fallback after 30s wait
      const now = Date.now();
      for (const entry of queueEntries) {
        const waitTime = now - new Date(entry.created_at).getTime();
        if (waitTime < 30000) continue;

        let problems = problemData.result.problems.filter(
          (p: any) => p.rating && p.rating >= entry.rating_min && p.rating <= entry.rating_max && p.contestId
            && !blackSet.has(`${p.contestId}${p.index}`)
        );

        // Filter by tags if specified
        const entryTags: string[] = entry.tags || [];
        if (entryTags.length > 0) {
          const tagFiltered = problems.filter((p: any) =>
            entryTags.some((tag: string) => p.tags?.includes(tag))
          );
          if (tagFiltered.length > 0) problems = tagFiltered;
        }

        if (problems.length === 0) continue;

        const problem = problems[Math.floor(Math.random() * problems.length)];
        const startTime = new Date(Date.now() + 5000).toISOString();

        // Calculate bot solve time based on user's history
        const avgSolveTime = await getUserAvgSolveTime(supabase, entry.user_id);
        // Bot solves in 70%-130% of user's avg time, with some randomness
        const botSolveDelay = Math.round(avgSolveTime * (0.7 + Math.random() * 0.6));
        const botSolveAt = new Date(new Date(startTime).getTime() + botSolveDelay * 1000).toISOString();

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
          player2_solved_at: botSolveAt,
        }).select().single();

        if (matchError) { console.error("Bot match creation error:", matchError); continue; }

        await supabase.from("queue").delete().eq("id", entry.id);

        // Send initial bot taunt
        await sendBotMessage(supabase, match.id, entry.user_id);

        return new Response(JSON.stringify({ match, bot: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "No compatible pairs yet, keep waiting..." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POLL
    if (action === "poll") {
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
        const nowSec = Date.now() / 1000;

        const isBotMatch = match.match_type === "bot";

        // Check if match expired
        if (nowSec > matchEndTime) {
          if (isBotMatch) {
            // Bot match with rating changes
            const { data: p1 } = await supabase.from("profiles").select("*").eq("id", match.player1_id).single();
            if (!p1) continue;

            let winnerId = null;
            let scoreA = 0.5;

            const botSolvedBeforeEnd = match.player2_solved_at && new Date(match.player2_solved_at).getTime() / 1000 <= matchEndTime;

            if (match.player1_solved_at && !botSolvedBeforeEnd) {
              winnerId = match.player1_id; scoreA = 1;
            } else if (!match.player1_solved_at && botSolvedBeforeEnd) {
              winnerId = "bot"; scoreA = 0;
            } else if (match.player1_solved_at && botSolvedBeforeEnd) {
              const playerWins = new Date(match.player1_solved_at) <= new Date(match.player2_solved_at!);
              winnerId = playerWins ? match.player1_id : "bot";
              scoreA = playerWins ? 1 : 0;
            }

            const p1Games = p1.wins + p1.losses + p1.draws;
            const k1 = getDynamicK(p1Games);
            const botRating = match.problem_rating || 1000;
            const elo = calculateElo(p1.rating, botRating, scoreA, k1, 32);

            await supabase.from("matches").update({
              status: "finished",
              winner_id: winnerId === "bot" ? null : winnerId,
              player1_rating_change: elo.changeA,
              player2_rating_change: 0,
            }).eq("id", match.id);

            // Update player rating
            await supabase.from("profiles").update({
              rating: p1.rating + elo.changeA,
              rank: getRank(p1.rating + elo.changeA),
              wins: p1.wins + (scoreA === 1 ? 1 : 0),
              losses: p1.losses + (scoreA === 0 ? 1 : 0),
              draws: p1.draws + (scoreA === 0.5 ? 1 : 0),
            }).eq("id", match.player1_id);

            results.push({ matchId: match.id, status: "finished", winnerId, bot: true });
          } else {
            // Normal match expiry
            const { data: p1 } = await supabase.from("profiles").select("*").eq("id", match.player1_id).single();
            const { data: p2 } = await supabase.from("profiles").select("*").eq("id", match.player2_id!).single();
            if (!p1 || !p2) continue;

            let winnerId = null;
            let scoreA = 0.5;

            if (match.player1_solved_at && !match.player2_solved_at) {
              winnerId = match.player1_id; scoreA = 1;
            } else if (!match.player1_solved_at && match.player2_solved_at) {
              winnerId = match.player2_id; scoreA = 0;
            } else if (match.player1_solved_at && match.player2_solved_at) {
              winnerId = new Date(match.player1_solved_at) <= new Date(match.player2_solved_at!)
                ? match.player1_id : match.player2_id;
              scoreA = winnerId === match.player1_id ? 1 : 0;
            }

            const p1Games = p1.wins + p1.losses + p1.draws;
            const p2Games = p2.wins + p2.losses + p2.draws;
            const elo = calculateElo(p1.rating, p2.rating, scoreA, getDynamicK(p1Games), getDynamicK(p2Games));

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

        // Bot match: send random taunt ~20% of polls
        if (isBotMatch && Math.random() < 0.2) {
          await sendBotMessage(supabase, match.id, match.player1_id);
        }

        // Poll CF submissions for player1
        if (!match.player1_solved_at) {
          const { data: player } = await supabase.from("profiles").select("cf_handle").eq("id", match.player1_id).single();
          if (player?.cf_handle) {
            try {
              const cfRes = await fetchWithTimeout(
                `https://codeforces.com/api/user.status?handle=${encodeURIComponent(player.cf_handle)}&count=20`, 10000
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

                  // In bot matches, check if player solved before bot
                  if (isBotMatch) {
                    const botSolvedAt = match.player2_solved_at;
                    if (!botSolvedAt || new Date(solvedAt) < new Date(botSolvedAt)) {
                      // Player wins - end match now
                      const { data: p1 } = await supabase.from("profiles").select("*").eq("id", match.player1_id).single();
                      if (p1) {
                        const p1Games = p1.wins + p1.losses + p1.draws;
                        const botRating = match.problem_rating || 1000;
                        const elo = calculateElo(p1.rating, botRating, 1, getDynamicK(p1Games), 32);
                        await supabase.from("matches").update({
                          status: "finished",
                          winner_id: match.player1_id,
                          player1_rating_change: elo.changeA,
                          player2_rating_change: 0,
                        }).eq("id", match.id);
                        await supabase.from("profiles").update({
                          rating: p1.rating + elo.changeA,
                          rank: getRank(p1.rating + elo.changeA),
                          wins: p1.wins + 1,
                        }).eq("id", match.player1_id);
                        results.push({ matchId: match.id, status: "finished", winnerId: match.player1_id, bot: true });
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error(`CF API error for player1:`, e);
            }
          }
        }

        // Check if bot "solved" before player (bot solve time has passed)
        if (isBotMatch && match.player2_solved_at && !match.player1_solved_at) {
          const botSolveTime = new Date(match.player2_solved_at).getTime() / 1000;
          if (nowSec >= botSolveTime) {
            // Bot solved first, end match - player loses
            const { data: p1 } = await supabase.from("profiles").select("*").eq("id", match.player1_id).single();
            if (p1) {
              const p1Games = p1.wins + p1.losses + p1.draws;
              const botRating = match.problem_rating || 1000;
              const elo = calculateElo(p1.rating, botRating, 0, getDynamicK(p1Games), 32);
              await supabase.from("matches").update({
                status: "finished",
                winner_id: null, // bot won but bot has no profile, winner_id stays null
                player1_rating_change: elo.changeA,
                player2_rating_change: 0,
              }).eq("id", match.id);
              await supabase.from("profiles").update({
                rating: p1.rating + elo.changeA,
                rank: getRank(p1.rating + elo.changeA),
                losses: p1.losses + 1,
              }).eq("id", match.player1_id);
              // Send final taunt
              await sendBotMessage(supabase, match.id, match.player1_id);
              results.push({ matchId: match.id, status: "finished", winnerId: null, botWon: true, bot: true });
            }
          }
        }

        // Poll player2 only for non-bot matches
        if (!isBotMatch && match.player2_id && !match.player2_solved_at) {
          const { data: player } = await supabase.from("profiles").select("cf_handle").eq("id", match.player2_id).single();
          if (player?.cf_handle) {
            try {
              const cfRes = await fetchWithTimeout(
                `https://codeforces.com/api/user.status?handle=${encodeURIComponent(player.cf_handle)}&count=20`, 10000
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

        // Check if both players solved in 1v1 — end match immediately
        if (!isBotMatch && match.player2_id) {
          // Re-fetch match to get latest solved_at values
          const { data: freshMatch } = await supabase.from("matches").select("*").eq("id", match.id).single();
          if (freshMatch && freshMatch.status === "active" && freshMatch.player1_solved_at && freshMatch.player2_solved_at) {
            // Both solved — winner is whoever solved first
            const p1Time = new Date(freshMatch.player1_solved_at).getTime();
            const p2Time = new Date(freshMatch.player2_solved_at).getTime();
            const winnerId = p1Time <= p2Time ? freshMatch.player1_id : freshMatch.player2_id;
            const scoreA = winnerId === freshMatch.player1_id ? 1 : 0;

            const { data: p1 } = await supabase.from("profiles").select("*").eq("id", freshMatch.player1_id).single();
            const { data: p2 } = await supabase.from("profiles").select("*").eq("id", freshMatch.player2_id!).single();
            if (p1 && p2) {
              const elo = calculateElo(p1.rating, p2.rating, scoreA, getDynamicK(p1.wins + p1.losses + p1.draws), getDynamicK(p2.wins + p2.losses + p2.draws));
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
              }).eq("id", freshMatch.player1_id);
              await supabase.from("profiles").update({
                rating: p2.rating + elo.changeB,
                rank: getRank(p2.rating + elo.changeB),
                wins: p2.wins + (scoreA === 0 ? 1 : 0),
                losses: p2.losses + (scoreA === 1 ? 1 : 0),
              }).eq("id", freshMatch.player2_id!);
              results.push({ matchId: match.id, status: "finished", winnerId });
            }
          }
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Arena engine error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
