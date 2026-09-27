CREATE TABLE "llm_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"output" jsonb NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"request_tokens_milli" integer NOT NULL,
	"token_tokens" integer NOT NULL,
	"refilled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" date NOT NULL,
	"day_count" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp with time zone,
	"last_status" integer,
	"last_error" text,
	"last_headers" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD COLUMN "cached" boolean DEFAULT false NOT NULL;