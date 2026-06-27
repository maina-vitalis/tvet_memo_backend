CREATE TYPE "public"."session_actor_type" AS ENUM('user', 'super_admin');--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "actor_type" "session_actor_type" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "super_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_super_admin_id_super_admin_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."super_admin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_actor_fk_check" CHECK ((
        "session"."actor_type" = 'user'
        AND "session"."user_id" IS NOT NULL
        AND "session"."super_admin_id" IS NULL
      ) OR (
        "session"."actor_type" = 'super_admin'
        AND "session"."super_admin_id" IS NOT NULL
        AND "session"."user_id" IS NULL
      ));