import { createClient } from "@supabase/supabase-js";

const HELP = `Live Supabase cloud-save acceptance check

Required environment variables:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_TEST_EMAIL
  SUPABASE_TEST_PASSWORD
  CLOUD_SAVE_TEST_CONFIRM_DISPOSABLE_ACCOUNT=yes

Optional environment variable:
  SUPABASE_TEST_DIFFICULTY=easy|realistic|simulation

The selected account must be disposable and must not already have a save in
the selected difficulty. The command creates one row, updates it through the
same conflict target used by the game, verifies that exactly one row exists,
then deletes it and confirms cleanup.`;

const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD"
];
const ALLOWED_DIFFICULTIES = new Set(["easy", "realistic", "simulation"]);

if (process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const missingEnvironment = REQUIRED_ENVIRONMENT.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
  console.error("Cloud acceptance cannot start. Missing environment variables:", missingEnvironment.join(", "));
  process.exit(1);
}

if (process.env.CLOUD_SAVE_TEST_CONFIRM_DISPOSABLE_ACCOUNT !== "yes") {
  console.error("Cloud acceptance refused. Set CLOUD_SAVE_TEST_CONFIRM_DISPOSABLE_ACCOUNT=yes only for a disposable account.");
  process.exit(1);
}

const supabaseUrl = validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;
const difficulty = process.env.SUPABASE_TEST_DIFFICULTY ?? "easy";

if (!ALLOWED_DIFFICULTIES.has(difficulty)) {
  console.error("Cloud acceptance refused. SUPABASE_TEST_DIFFICULTY must be easy, realistic, or simulation.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

let currentStep = "auth.signInWithPassword";
let userId = null;
let testRowCreated = false;

try {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  assertSupabaseSuccess(signInError);
  userId = signInData.user?.id ?? null;
  if (!userId) throw new Error("Supabase returned no authenticated user.");

  currentStep = "game_saves.preflight";
  const { data: existingRows, error: preflightError } = await supabase
    .from("game_saves")
    .select("user_id,difficulty")
    .eq("user_id", userId)
    .eq("difficulty", difficulty);
  assertSupabaseSuccess(preflightError);
  if ((existingRows ?? []).length > 0) {
    throw new Error("The selected account already has a save in this difficulty. Use an empty disposable account or another difficulty.");
  }

  currentStep = "game_saves.insert";
  const firstSave = createAcceptanceSave(difficulty, 1);
  assertCompactSaveJson(firstSave);
  const { error: insertError } = await supabase.from("game_saves").upsert(
    createSaveRow(userId, difficulty, firstSave),
    { onConflict: "user_id,difficulty" }
  );
  assertSupabaseSuccess(insertError);
  testRowCreated = true;

  currentStep = "game_saves.update";
  const secondSave = createAcceptanceSave(difficulty, 2);
  assertCompactSaveJson(secondSave);
  const { error: updateError } = await supabase.from("game_saves").upsert(
    createSaveRow(userId, difficulty, secondSave),
    { onConflict: "user_id,difficulty" }
  );
  assertSupabaseSuccess(updateError);

  currentStep = "game_saves.verify-single-row";
  const { data: savedRows, error: selectError } = await supabase
    .from("game_saves")
    .select("difficulty,game_state")
    .eq("user_id", userId)
    .eq("difficulty", difficulty);
  assertSupabaseSuccess(selectError);
  if (savedRows?.length !== 1) throw new Error(`Expected exactly one cloud row after two upserts; found ${savedRows?.length ?? 0}.`);
  if (savedRows[0]?.game_state?.acceptanceRevision !== 2) throw new Error("The second upsert did not replace the first test revision.");
  if (savedRows[0]?.game_state?.money !== 123_456_789) throw new Error("The canonical money field changed during the cloud round trip.");

  currentStep = "game_saves.delete";
  const { data: deletedRows, error: deleteError } = await deleteTestRow(supabase, userId, difficulty);
  assertSupabaseSuccess(deleteError);
  if (deletedRows?.length !== 1) throw new Error(`Expected to delete one test row; deleted ${deletedRows?.length ?? 0}. Check the game_saves delete RLS policy.`);

  currentStep = "game_saves.verify-cleanup";
  const { count, error: cleanupSelectError } = await supabase
    .from("game_saves")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("difficulty", difficulty);
  assertSupabaseSuccess(cleanupSelectError);
  if (count !== 0) throw new Error(`Cleanup verification expected zero rows; found ${count ?? "unknown"}.`);
  testRowCreated = false;

  console.log("Cloud save acceptance passed: auth, insert, update, select, uniqueness, canonical cash, delete, and cleanup.");
} catch (error) {
  console.error("Cloud save acceptance failed.", safeErrorDetails(currentStep, error));
  process.exitCode = 1;
} finally {
  if (testRowCreated && userId) {
    const { data: cleanupRows, error: cleanupError } = await deleteTestRow(supabase, userId, difficulty);
    if (cleanupError) {
      console.error("Cloud save acceptance cleanup failed.", safeErrorDetails("game_saves.cleanup", cleanupError));
      process.exitCode = 1;
    } else if (cleanupRows?.length !== 1) {
      console.error("Cloud save acceptance cleanup failed.", {
        step: "game_saves.cleanup",
        message: `Expected to delete one test row; deleted ${cleanupRows?.length ?? 0}. Check the game_saves delete RLS policy.`
      });
      process.exitCode = 1;
    }
  }
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error("Cloud save acceptance logout failed.", safeErrorDetails("auth.signOut", signOutError));
    process.exitCode = 1;
  }
}

function validateSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error("Supabase URL is invalid. Use the project root URL, for example https://xxxx.supabase.co");
    process.exit(1);
  }

  if (parsed.protocol !== "https:" || (parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) {
    console.error("Supabase URL is invalid. Use the project root URL, for example https://xxxx.supabase.co");
    process.exit(1);
  }
  return parsed.origin;
}

function createSaveRow(id, selectedDifficulty, gameState) {
  return {
    user_id: id,
    difficulty: selectedDifficulty,
    save_name: `${selectedDifficulty}-save`,
    game_state: gameState,
    updated_at: gameState.updatedAt
  };
}

function createAcceptanceSave(selectedDifficulty, acceptanceRevision) {
  const now = new Date().toISOString();
  const gameTime = Date.UTC(2026, 0, 1, 6);
  return {
    saveFormatVersion: 2,
    acceptanceRevision,
    airlineName: "Codex Cloud Acceptance",
    difficulty: selectedDifficulty,
    gameStatus: "active",
    bailoutsUsed: 0,
    baseAirportId: "lhr",
    baseAirports: ["lhr"],
    primaryBaseAirport: "lhr",
    expandedAirportIds: ["lhr"],
    money: 123_456_789,
    startedAtRealMs: gameTime,
    baseGameTimeMs: gameTime,
    currentGameTimeMs: gameTime,
    timeMultiplier: 1,
    isPaused: false,
    fleet: [],
    routes: [],
    flightLogSummary: [],
    totalProfit: 0,
    completedFlights: 0,
    passengerCount: 0,
    cargoTransportedTons: 0,
    lastTickRealMs: gameTime,
    language: "en",
    updatedAt: now
  };
}

function deleteTestRow(client, id, selectedDifficulty) {
  return client.from("game_saves").delete().eq("user_id", id).eq("difficulty", selectedDifficulty).select("user_id");
}

function assertCompactSaveJson(gameState) {
  const json = JSON.stringify(gameState);
  const sizeBytes = Buffer.byteLength(json, "utf8");
  if (sizeBytes > 900_000) throw new Error(`Compact acceptance save is too large: ${sizeBytes} bytes.`);
}

function assertSupabaseSuccess(error) {
  if (error) throw error;
}

function safeErrorDetails(step, error) {
  if (!error || typeof error !== "object") return { step, message: String(error ?? "Unknown error") };
  return {
    step,
    message: typeof error.message === "string" ? error.message : "Unknown Supabase error",
    code: typeof error.code === "string" ? error.code : undefined,
    status: typeof error.status === "number" ? error.status : undefined,
    details: typeof error.details === "string" ? error.details : undefined,
    hint: typeof error.hint === "string" ? error.hint : undefined
  };
}
