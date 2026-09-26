CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel_id" uuid,
	"customer_id" uuid,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"chat_type" text,
	"customer_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"mapping_proposal" jsonb,
	"consent_posted_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"industry" text DEFAULT 'trucking' NOT NULL,
	"watch_criteria" jsonb DEFAULT '{"items":[]}'::jsonb NOT NULL,
	"sla" jsonb NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"settings" jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'broker' NOT NULL,
	"assigned_user_id" uuid,
	"brief" text DEFAULT '' NOT NULL,
	"brief_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"day" date NOT NULL,
	"summary" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"items" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"briefs" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"dedupe_key" text,
	"first_enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"participant_id" uuid,
	"external_id" text NOT NULL,
	"text" text NOT NULL,
	"lang" text,
	"sent_at" timestamp with time zone NOT NULL,
	"reply_to_external_id" text,
	"untrusted_flag" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text NOT NULL,
	"side" text DEFAULT 'unknown' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"customer_id" uuid,
	"chat_type" text,
	"rule_text" text NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"created_from" text DEFAULT 'edit' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" integer NOT NULL,
	"audience" text NOT NULL,
	"customer_id" uuid,
	"channel_id" uuid,
	"task_id" uuid,
	"responsible_user_id" uuid,
	"title" jsonb NOT NULL,
	"reason" jsonb NOT NULL,
	"evidence_quote" text,
	"evidence_message_id" uuid,
	"dedupe_key" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"customer_id" uuid,
	"task_id" uuid,
	"intent" text NOT NULL,
	"proposed_text" text NOT NULL,
	"rationale" jsonb NOT NULL,
	"used_context" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"final_text" text,
	"edit_reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"send_mode" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"evidence_message_id" uuid,
	"explanation" jsonb NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel_id" uuid,
	"title" jsonb NOT NULL,
	"kind" text NOT NULL,
	"ref" text,
	"status" text DEFAULT 'received' NOT NULL,
	"deadline_at" timestamp with time zone,
	"assignee_user_id" uuid,
	"stuck_reason" jsonb,
	"risk" integer DEFAULT 0 NOT NULL,
	"created_from_message_id" uuid,
	"last_event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"team" text,
	"telegram_user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD CONSTRAINT "playbook_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD CONSTRAINT "playbook_rules_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD CONSTRAINT "playbook_rules_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_evidence_message_id_messages_id_fk" FOREIGN KEY ("evidence_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_evidence_message_id_messages_id_fk" FOREIGN KEY ("evidence_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_from_message_id_messages_id_fk" FOREIGN KEY ("created_from_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_runs_company_idx" ON "analysis_runs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "analysis_runs_channel_idx" ON "analysis_runs" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "analysis_runs_customer_idx" ON "analysis_runs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "audit_company_idx" ON "audit_log" USING btree ("company_id","at");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_ext_uq" ON "channels" USING btree ("company_id","source","external_id");--> statement-breakpoint
CREATE INDEX "channels_company_idx" ON "channels" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "channels_customer_idx" ON "channels" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_company_idx" ON "customers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customers_assigned_idx" ON "customers" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_summaries_uq" ON "daily_summaries" USING btree ("customer_id","day");--> statement-breakpoint
CREATE INDEX "daily_summaries_company_idx" ON "daily_summaries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "digests_company_idx" ON "digests" USING btree ("company_id","audience","generated_at");--> statement-breakpoint
CREATE INDEX "handoffs_company_idx" ON "handoffs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "handoffs_from_idx" ON "handoffs" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "handoffs_to_idx" ON "handoffs" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "jobs_pending_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_pending_dedupe_uq" ON "jobs" USING btree ("dedupe_key") WHERE status = 'pending' and dedupe_key is not null;--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_ext_uq" ON "messages" USING btree ("channel_id","external_id");--> statement-breakpoint
CREATE INDEX "messages_channel_sent_idx" ON "messages" USING btree ("channel_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_company_idx" ON "messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "messages_participant_idx" ON "messages" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_ext_uq" ON "participants" USING btree ("company_id","source","external_id");--> statement-breakpoint
CREATE INDEX "participants_company_idx" ON "participants" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rules_company_status_idx" ON "playbook_rules" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "rules_customer_idx" ON "playbook_rules" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "rules_decided_by_idx" ON "playbook_rules" USING btree ("decided_by");--> statement-breakpoint
CREATE INDEX "signals_company_status_audience_idx" ON "signals" USING btree ("company_id","status","audience");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_open_dedupe_uq" ON "signals" USING btree ("company_id","dedupe_key") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "signals_customer_idx" ON "signals" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "signals_channel_idx" ON "signals" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "signals_task_idx" ON "signals" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "signals_responsible_idx" ON "signals" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "signals_evidence_idx" ON "signals" USING btree ("evidence_message_id");--> statement-breakpoint
CREATE INDEX "suggestions_company_status_idx" ON "suggestions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "suggestions_channel_idx" ON "suggestions" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "suggestions_customer_idx" ON "suggestions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "suggestions_task_idx" ON "suggestions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "suggestions_decided_by_idx" ON "suggestions" USING btree ("decided_by");--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_events_company_idx" ON "task_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "task_events_evidence_idx" ON "task_events" USING btree ("evidence_message_id");--> statement-breakpoint
CREATE INDEX "tasks_company_status_idx" ON "tasks" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "tasks_customer_idx" ON "tasks" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "tasks_channel_idx" ON "tasks" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "tasks_created_from_idx" ON "tasks" USING btree ("created_from_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_company_idx" ON "users" USING btree ("company_id");