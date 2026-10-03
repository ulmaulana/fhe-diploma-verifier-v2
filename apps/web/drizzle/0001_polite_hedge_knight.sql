CREATE TABLE "credential_drafts" (
	"credential_id" text PRIMARY KEY NOT NULL,
	"owner_wallet" text NOT NULL,
	"body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credential_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "signed_credentials" (
	"credential_id" text PRIMARY KEY NOT NULL,
	"owner_wallet" text NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signed_credentials" ENABLE ROW LEVEL SECURITY;