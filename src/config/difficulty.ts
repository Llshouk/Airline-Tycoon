export type GameDifficulty = "simulation" | "easy" | "realistic";

export type DifficultyConfig = {
  difficulty: GameDifficulty;
  label: string;
  speedMultiplier: 1 | 50 | 100;
  startingCashMultiplier: number;
  revenueMultiplier: number;
  bankruptcyBailoutAmount: number;
  bankruptcyBailoutLimit: number | "unlimited";
  gameOverOnBankruptcy: boolean;
  allowLosses: boolean;
};

export const DIFFICULTY_CONFIGS: Record<GameDifficulty, DifficultyConfig> = {
  simulation: {
    difficulty: "simulation",
    label: "Simulation",
    speedMultiplier: 100,
    startingCashMultiplier: 10,
    revenueMultiplier: 5,
    bankruptcyBailoutAmount: 10_000_000_000,
    bankruptcyBailoutLimit: "unlimited",
    gameOverOnBankruptcy: false,
    allowLosses: true
  },
  easy: {
    difficulty: "easy",
    label: "Easy",
    speedMultiplier: 50,
    startingCashMultiplier: 1,
    revenueMultiplier: 1,
    bankruptcyBailoutAmount: 1_000_000_000,
    bankruptcyBailoutLimit: 1,
    gameOverOnBankruptcy: false,
    allowLosses: true
  },
  realistic: {
    difficulty: "realistic",
    label: "Realistic",
    speedMultiplier: 1,
    startingCashMultiplier: 1,
    revenueMultiplier: 1,
    bankruptcyBailoutAmount: 0,
    bankruptcyBailoutLimit: 0,
    gameOverOnBankruptcy: true,
    allowLosses: true
  }
};

export const DEFAULT_DIFFICULTY: GameDifficulty = "easy";
export const DIFFICULTY_ORDER: GameDifficulty[] = ["simulation", "easy", "realistic"];

export function getDifficultyConfig(difficulty: GameDifficulty | string | null | undefined) {
  return DIFFICULTY_CONFIGS[isGameDifficulty(difficulty) ? difficulty : DEFAULT_DIFFICULTY];
}

export function isGameDifficulty(value: unknown): value is GameDifficulty {
  return value === "simulation" || value === "easy" || value === "realistic";
}
