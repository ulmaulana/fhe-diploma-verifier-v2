CREATE TABLE "credential_documents" (
	"credential_id" text PRIMARY KEY NOT NULL,
	"issuer_id" text NOT NULL,
	"body" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credential_documents" ENABLE ROW LEVEL SECURITY;