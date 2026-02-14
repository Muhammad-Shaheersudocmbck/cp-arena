import { calculateElo, getRankFromRating, getRankColor } from "@/lib/types";
import { describe, it, expect } from "vitest";

describe("ELO Rating Calculation", () => {
  it("should calculate correct ELO for a win", () => {
    const result = calculateElo(1000, 1000, 1);
    expect(result.changeA).toBe(16);
    expect(result.changeB).toBe(-16);
    expect(result.newRatingA).toBe(1016);
    expect(result.newRatingB).toBe(984);
  });

  it("should calculate correct ELO for a loss", () => {
    const result = calculateElo(1000, 1000, 0);
    expect(result.changeA).toBe(-16);
    expect(result.changeB).toBe(16);
  });

  it("should calculate correct ELO for a draw", () => {
    const result = calculateElo(1000, 1000, 0.5);
    expect(result.changeA).toBe(0);
    expect(result.changeB).toBe(0);
  });

  it("should give higher gain when underdog wins", () => {
    const result = calculateElo(800, 1200, 1);
    expect(result.changeA).toBeGreaterThan(16);
  });

  it("should give lower gain when favorite wins", () => {
    const result = calculateElo(1200, 800, 1);
    expect(result.changeA).toBeLessThan(16);
  });
});

describe("Rank Mapping", () => {
  it("maps ratings to correct ranks", () => {
    expect(getRankFromRating(500)).toBe("Beginner");
    expect(getRankFromRating(950)).toBe("Newbie");
    expect(getRankFromRating(1150)).toBe("Pupil");
    expect(getRankFromRating(1350)).toBe("Specialist");
    expect(getRankFromRating(1550)).toBe("Expert");
    expect(getRankFromRating(1750)).toBe("Candidate Master");
    expect(getRankFromRating(1950)).toBe("Master");
    expect(getRankFromRating(2200)).toBe("Grandmaster");
  });

  it("returns correct color classes", () => {
    expect(getRankColor(500)).toBe("text-muted-foreground");
    expect(getRankColor(1300)).toBe("text-neon-cyan");
    expect(getRankColor(2200)).toBe("text-neon-red");
  });
});
