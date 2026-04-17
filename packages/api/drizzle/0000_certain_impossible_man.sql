CREATE TYPE "public"."owner_type" AS ENUM('user', 'group');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bureaus" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geometry" geometry(Geometry, 4326) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bureau_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bureau_id" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_bureau_id_bureaus_id_fk" FOREIGN KEY ("bureau_id") REFERENCES "public"."bureaus"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_geometry" ON "geo_features" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties" ON "geo_features" USING gin ("properties");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bureau" ON "geo_features" USING btree ("bureau_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_owner" ON "geo_features" USING btree ("owner_id","owner_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_updated" ON "geo_features" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_name_search" ON "geo_features" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_members_pkey" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_groups" ON "group_members" USING btree ("user_id");