import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

interface RatingGraphProps {
  matches: {
    id: string;
    player1_id: string;
    player2_id: string | null;
    player1_rating_change: number | null;
    player2_rating_change: number | null;
    created_at: string;
  }[];
  profileId: string;
  currentRating: number;
}

const RANK_BANDS = [
  { min: 0, max: 900, label: "Beginner", color: "hsla(0, 0%, 50%, 0.06)" },
  { min: 900, max: 1100, label: "Newbie", color: "hsla(0, 0%, 60%, 0.06)" },
  { min: 1100, max: 1300, label: "Pupil", color: "hsla(142, 100%, 50%, 0.06)" },
  { min: 1300, max: 1500, label: "Specialist", color: "hsla(185, 100%, 50%, 0.06)" },
  { min: 1500, max: 1700, label: "Expert", color: "hsla(270, 100%, 60%, 0.06)" },
  { min: 1700, max: 1900, label: "Candidate Master", color: "hsla(30, 100%, 50%, 0.06)" },
  { min: 1900, max: 2100, label: "Master", color: "hsla(30, 100%, 50%, 0.1)" },
  { min: 2100, max: 3000, label: "Grandmaster", color: "hsla(0, 100%, 50%, 0.1)" },
];

const RANK_LINES = [
  { value: 900, label: "Newbie", color: "hsl(var(--muted-foreground))" },
  { value: 1100, label: "Pupil", color: "hsl(142, 100%, 50%)" },
  { value: 1300, label: "Specialist", color: "hsl(185, 100%, 50%)" },
  { value: 1500, label: "Expert", color: "hsl(270, 100%, 60%)" },
  { value: 1700, label: "CM", color: "hsl(30, 100%, 50%)" },
  { value: 1900, label: "Master", color: "hsl(30, 100%, 60%)" },
  { value: 2100, label: "GM", color: "hsl(0, 100%, 50%)" },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="text-xs text-muted-foreground">{data.date}</p>
      <p className="font-mono text-sm font-bold text-primary">{data.rating}</p>
      {data.change !== undefined && data.change !== null && data.change !== 0 && (
        <p className={`font-mono text-xs font-semibold ${data.change > 0 ? "text-primary" : "text-destructive"}`}>
          {data.change > 0 ? "+" : ""}{data.change}
        </p>
      )}
    </div>
  );
}

export default function RatingGraph({ matches, profileId, currentRating }: RatingGraphProps) {
  const data = useMemo(() => {
    // Sort matches oldest first, filter out +0 rating changes
    const sorted = [...matches]
      .filter((m) => {
        const isP1 = m.player1_id === profileId;
        const isP2 = m.player2_id === profileId;
        if (!isP1 && !isP2) return false;
        const change = isP1 ? m.player1_rating_change : m.player2_rating_change;
        return change !== null && change !== undefined && change !== 0;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (sorted.length === 0) return [];

    // Reconstruct rating timeline working backwards from current rating
    const changes: { date: string; change: number }[] = sorted.map((m) => {
      const isP1 = m.player1_id === profileId;
      return {
        date: new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        change: (isP1 ? m.player1_rating_change : m.player2_rating_change) || 0,
      };
    });

    // Work backwards from current rating to find starting point
    let rating = currentRating;
    for (let i = changes.length - 1; i >= 0; i--) {
      rating -= changes[i].change;
    }

    // Now build the timeline forward
    const points = [{ date: "Start", rating, change: null as number | null }];
    for (const c of changes) {
      rating += c.change;
      points.push({ date: c.date, rating, change: c.change });
    }

    return points;
  }, [matches, profileId, currentRating]);

  if (data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">Play matches to see your rating graph</p>
      </div>
    );
  }

  const ratings = data.map((d) => d.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const padding = 50;
  const yMin = Math.max(0, Math.floor((minRating - padding) / 100) * 100);
  const yMax = Math.ceil((maxRating + padding) / 100) * 100;

  // Determine visible rank lines & bands
  const visibleRankLines = RANK_LINES.filter((r) => r.value >= yMin && r.value <= yMax);
  const visibleBands = RANK_BANDS.filter((b) => b.max > yMin && b.min < yMax);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Rating History</h2>
        <span className="font-mono text-sm text-muted-foreground">{data.length - 1} match{data.length - 1 !== 1 ? "es" : ""}</span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="date"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Colored rank area bands */}
          {visibleBands.map((band) => (
            <ReferenceArea
              key={band.label}
              y1={Math.max(band.min, yMin)}
              y2={Math.min(band.max, yMax)}
              fill={band.color}
              fillOpacity={1}
              ifOverflow="hidden"
            />
          ))}
          {visibleRankLines.map((line) => (
            <ReferenceLine
              key={line.value}
              y={line.value}
              stroke={line.color}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: line.label,
                position: "right",
                fill: line.color,
                fontSize: 10,
                opacity: 0.7,
              }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="rating"
            stroke="url(#lineGradient)"
            strokeWidth={2.5}
            fill="url(#ratingGradient)"
            dot={{ fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2, r: 3 }}
            activeDot={{ fill: "hsl(var(--primary))", stroke: "hsl(var(--primary-foreground))", strokeWidth: 2, r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
