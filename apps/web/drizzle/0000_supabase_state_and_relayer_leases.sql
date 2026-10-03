-- IF NOT EXISTS preserves databases created by the previous prototype.
-- The original verification_state(id, body) shape and check are unchanged.
CREATE TABLE IF NOT EXISTS "verification_relayer_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"owner" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_relayer_leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "verification_state_id_check" CHECK ("verification_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "verification_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- These tables have no browser-facing policies. Use the server-only database
-- owner connection; Supabase anon/authenticated REST clients cannot read them.
INSERT INTO "verification_state" ("id", "body")
VALUES (1, '{"sessions":{},"jobs":{},"rates":{},"audit":[]}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
