CREATE TYPE "public"."institution_plan" AS ENUM('trial', 'basic', 'pro');--> statement-breakpoint
ALTER TABLE "institution" ADD COLUMN "plan" "institution_plan" DEFAULT 'trial' NOT NULL;
