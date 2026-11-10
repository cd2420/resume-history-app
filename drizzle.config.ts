import { defineConfig } from "drizzle-kit";

// Migrations only: the app still queries through supabase-js so RLS keeps applying.
// DATABASE_URL is a tooling-only Postgres connection string; never add it to Vercel.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for drizzle-kit");

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  // Supabase owns auth, storage, vault, cron and friends.
  schemaFilter: ["public"],
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
