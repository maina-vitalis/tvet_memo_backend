ALTER TABLE "institution" ADD COLUMN "school_code" varchar(50);--> statement-breakpoint
UPDATE "institution" SET "school_code" = "subdomain" WHERE "school_code" IS NULL;--> statement-breakpoint
ALTER TABLE "institution" ALTER COLUMN "school_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "institution" ADD CONSTRAINT "institution_school_code_unique" UNIQUE("school_code");