# TVET MEMO — Database Schema Reference


## Design principles

- **Multi-tenant by design** — every table (except `institution`) carries `institution_id`. All queries must include it. No cross-tenant data leakage is possible at the application layer.
- **RBAC lives in the database** — `role.send_scope`, `role.content_access`, and `role.admin_rights` are JSONB columns storing the permission matrix. Role logic is data-driven, not hard-coded.
- **Immutable audit trail** — `audit_log` is append-only. No row is ever updated or deleted. Sensitive actions write here automatically via a service layer trigger.
- **Traceability at the recipient level** — `memo_recipient` tracks delivered, read, and acknowledged timestamps independently per recipient. This is the core value of the system.
- **Soft deletes via `is_active`** — users, institutions, and roles are never hard-deleted. Deactivation preserves referential integrity and satisfies Kenya DPA data retention obligations.

---

## Entity overview

| Table | Rows represent | Tenant-scoped |
|---|---|---|
| `institution` | A TVET school or college | — (root) |
| `role` | A configurable role in the hierarchy | Yes |
| `department` | An academic/support department | Yes |
| `user` | Any person (staff, trainer, trainee) | Yes |
| `session` | An authenticated device session | Yes (via user) |
| `memo` | A sent or scheduled memo | Yes |
| `memo_recipient` | One recipient of one memo | Yes (via memo) |
| `attachment` | A file attached to a memo | Yes (via memo) |
| `notification` | A single FCM or email dispatch attempt | Yes |
| `message_thread` | A reply thread on a memo | Yes |
| `audit_log` | An immutable record of a sensitive action | Yes |

---

## Tables

---

### 1. `institution`

Root tenant table. One row per school or college.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Unique institution identifier |
| `name` | `varchar(255)` | NOT NULL | Full institution name |
| `subdomain` | `varchar(100)` | UNIQUE, NOT NULL | URL slug, e.g. `kisumu-tvet` |
| `logo_url` | `text` | NULLABLE | Hosted logo for branding |
| `contact_email` | `varchar(255)` | NOT NULL | Primary admin contact |
| `country_code` | `char(2)` | NOT NULL, default `'KE'` | ISO 3166-1 alpha-2 |
| `timezone` | `varchar(64)` | NOT NULL, default `'Africa/Nairobi'` | For scheduled memo delivery |
| `is_active` | `boolean` | NOT NULL, default `true` | Soft deactivation flag |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Record creation time |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Last modification time |

---

### 2. `role`

Configurable hierarchy roles. Seeded with 8 defaults but fully data-driven.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Role identifier |
| `institution_id` | `uuid` | FK → `institution.id`, NOT NULL | Tenant scope |
| `name` | `varchar(100)` | NOT NULL | e.g. `Principal`, `Head of Department` |
| `hierarchy_level` | `smallint` | NOT NULL | 1 = highest (BoG), 8 = lowest (Trainee) |
| `send_scope` | `jsonb` | NOT NULL, default `'{}'` | Who this role may send memos to |
| `content_access` | `jsonb` | NOT NULL, default `'{}'` | Which content this role can view |
| `admin_rights` | `jsonb` | NOT NULL, default `'{}'` | Administrative capabilities |
| `is_default` | `boolean` | NOT NULL, default `false` | Whether this is a seeded default role |
| `is_active` | `boolean` | NOT NULL, default `true` | Soft delete |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

**Permission JSON shape (example for `send_scope`):**
```json
{
  "can_broadcast": true,
  "can_target_roles": ["trainer", "support_staff", "trainee"],
  "can_target_departments": true,
  "can_target_individuals": true,
  "max_hierarchy_level": 8
}
```

**Unique constraint:** `(institution_id, name)`

---

### 3. `department`

Academic or support departments within an institution.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Department identifier |
| `institution_id` | `uuid` | FK → `institution.id`, NOT NULL | Tenant scope |
| `name` | `varchar(150)` | NOT NULL | e.g. `Department of ICT` |
| `code` | `varchar(20)` | NULLABLE | Short code, e.g. `ICT` |
| `head_user_id` | `uuid` | FK → `user.id`, NULLABLE | HoD — nullable until assigned |
| `is_active` | `boolean` | NOT NULL, default `true` | Soft delete |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |

**Unique constraint:** `(institution_id, name)`

---

### 4. `user`

All persons in the system — staff, trainers, trainees, admins.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | User identifier |
| `institution_id` | `uuid` | FK → `institution.id`, NOT NULL | Tenant scope |
| `role_id` | `uuid` | FK → `role.id`, NOT NULL | Assigned role |
| `department_id` | `uuid` | FK → `department.id`, NULLABLE | Assigned department |
| `first_name` | `varchar(100)` | NOT NULL | — |
| `last_name` | `varchar(100)` | NOT NULL | — |
| `email` | `varchar(255)` | NOT NULL | Login credential |
| `staff_number` | `varchar(50)` | NULLABLE | For CSV import matching |
| `phone_number` | `varchar(20)` | NULLABLE | For SMS OTP fallback |
| `password_hash` | `text` | NOT NULL | bcrypt or argon2 hash |
| `totp_secret` | `text` | NULLABLE | Base32 TOTP seed (encrypted at rest) |
| `totp_enabled` | `boolean` | NOT NULL, default `false` | Whether 2FA is active |
| `fcm_token` | `text` | NULLABLE | Latest device push token |
| `preferred_lang` | `char(2)` | NOT NULL, default `'en'` | `en` or `sw` (Phase 2) |
| `avatar_url` | `text` | NULLABLE | Profile photo |
| `is_active` | `boolean` | NOT NULL, default `true` | Soft deactivation |
| `must_change_password` | `boolean` | NOT NULL, default `true` | Force reset on first login |
| `last_login_at` | `timestamptz` | NULLABLE | — |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |

**Unique constraints:**
- `(institution_id, email)`
- `(institution_id, staff_number)` where `staff_number IS NOT NULL`

---

### 5. `session`

Authenticated device sessions. Supports multi-device login and per-device revocation.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Session identifier |
| `user_id` | `uuid` | FK → `user.id`, NOT NULL | Owning user |
| `token_hash` | `text` | UNIQUE, NOT NULL | SHA-256 hash of the JWT — never store raw token |
| `device_name` | `varchar(150)` | NULLABLE | e.g. `Samsung Galaxy A32` |
| `device_type` | `varchar(20)` | NULLABLE | `mobile`, `web`, `api` |
| `ip_address` | `inet` | NULLABLE | IP at login time |
| `user_agent` | `text` | NULLABLE | Browser/app user agent |
| `is_active` | `boolean` | NOT NULL, default `true` | Set to false on logout or revocation |
| `expires_at` | `timestamptz` | NOT NULL | JWT expiry mirrored here for fast lookup |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Login time |

---

### 6. `memo`

The central communication record.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Memo identifier |
| `institution_id` | `uuid` | FK → `institution.id`, NOT NULL | Tenant scope |
| `sender_id` | `uuid` | FK → `user.id`, NOT NULL | Author of the memo |
| `subject` | `varchar(255)` | NOT NULL | Memo subject line |
| `body` | `text` | NOT NULL | Full memo body (rich text / markdown) |
| `priority` | `memo_priority` | NOT NULL, default `'normal'` | See enums |
| `category` | `memo_category` | NOT NULL | See enums |
| `status` | `memo_status` | NOT NULL, default `'draft'` | See enums |
| `target_type` | `memo_target_type` | NOT NULL | See enums |
| `target_payload` | `jsonb` | NOT NULL, default `'{}'` | Target role IDs, dept IDs, or user IDs |
| `requires_ack` | `boolean` | NOT NULL, default `false` | Whether acknowledgement is mandatory |
| `ack_deadline_at` | `timestamptz` | NULLABLE | Optional deadline for acknowledgement |
| `scheduled_at` | `timestamptz` | NULLABLE | Future send time (null = send immediately) |
| `expires_at` | `timestamptz` | NULLABLE | When memo becomes inactive |
| `sent_at` | `timestamptz` | NULLABLE | Set by worker after all recipients are inserted |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Draft creation time |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Last edit time |

**`target_payload` shape examples:**
```json
{ "type": "broadcast" }
{ "type": "department", "department_ids": ["uuid-1", "uuid-2"] }
{ "type": "role", "role_ids": ["uuid-hod", "uuid-trainer"] }
{ "type": "individual", "user_ids": ["uuid-alice", "uuid-bob"] }
```

---

### 7. `memo_recipient`

One row per recipient per memo. This table is the source of truth for delivery traceability.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | — |
| `memo_id` | `uuid` | FK → `memo.id`, NOT NULL | Parent memo |
| `user_id` | `uuid` | FK → `user.id`, NOT NULL | Recipient |
| `delivered_at` | `timestamptz` | NULLABLE | Set when FCM/SMTP dispatch succeeds |
| `read_at` | `timestamptz` | NULLABLE | Set when recipient opens the memo |
| `acknowledged_at` | `timestamptz` | NULLABLE | Set when recipient taps acknowledge |
| `ack_type` | `ack_type_enum` | NULLABLE | See enums |
| `ack_reply` | `text` | NULLABLE | Free-text reply when ack_type = `reply` |

**Unique constraint:** `(memo_id, user_id)` — one row per memo per recipient

---

### 8. `attachment`

Files attached to memos. Stored in S3-compatible object storage; only the key is in the DB.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | — |
| `memo_id` | `uuid` | FK → `memo.id`, NOT NULL | Parent memo |
| `uploaded_by` | `uuid` | FK → `user.id`, NOT NULL | Uploader |
| `original_filename` | `varchar(255)` | NOT NULL | Display name shown to recipients |
| `storage_key` | `text` | UNIQUE, NOT NULL | S3 object key — never a public URL |
| `mime_type` | `varchar(100)` | NOT NULL | e.g. `application/pdf` |
| `size_bytes` | `integer` | NOT NULL | File size for display |
| `version` | `smallint` | NOT NULL, default `1` | Phase 2 document version control |
| `uploaded_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

### 9. `notification`

Tracks every individual dispatch attempt (FCM or SMTP) with retry state.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | — |
| `institution_id` | `uuid` | FK → `institution.id`, NOT NULL | Tenant scope |
| `user_id` | `uuid` | FK → `user.id`, NOT NULL | Intended recipient |
| `memo_id` | `uuid` | FK → `memo.id`, NOT NULL | Triggering memo |
| `channel` | `notification_channel` | NOT NULL | `fcm` or `smtp` |
| `status` | `notification_status` | NOT NULL, default `'pending'` | See enums |
| `retry_count` | `smallint` | NOT NULL, default `0` | Number of retry attempts |
| `error_message` | `text` | NULLABLE | Last error detail on failure |
| `scheduled_at` | `timestamptz` | NOT NULL, default `now()` | When to attempt dispatch |
| `sent_at` | `timestamptz` | NULLABLE | Actual dispatch time on success |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

### 10. `message_thread`

Bottom-up reply channel. Free-text replies on a specific memo between two users.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | — |
| `institution_id` | `uuid` | FK → `institution.id`, NOT NULL | Tenant scope |
| `memo_id` | `uuid` | FK → `memo.id`, NOT NULL | Parent memo |
| `sender_id` | `uuid` | FK → `user.id`, NOT NULL | Message author |
| `recipient_id` | `uuid` | FK → `user.id`, NOT NULL | Intended reader |
| `body` | `text` | NOT NULL | Message content |
| `is_read` | `boolean` | NOT NULL, default `false` | Read receipt |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

### 11. `audit_log`

Immutable record of all sensitive actions. Never updated or deleted.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | — |
| `institution_id` | `uuid` | FK → `institution.id`, NOT NULL | Tenant scope |
| `actor_id` | `uuid` | FK → `user.id`, NULLABLE | Who performed the action (null = system) |
| `action` | `varchar(100)` | NOT NULL | e.g. `memo.send`, `user.deactivate`, `role.assign` |
| `entity_type` | `varchar(50)` | NOT NULL | e.g. `memo`, `user`, `role` |
| `entity_id` | `uuid` | NOT NULL | ID of the affected record |
| `before_state` | `jsonb` | NULLABLE | Snapshot before change |
| `after_state` | `jsonb` | NULLABLE | Snapshot after change |
| `ip_address` | `inet` | NULLABLE | Actor's IP address |
| `user_agent` | `text` | NULLABLE | Actor's device/browser |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Immutable timestamp |

**Audited actions (minimum set):**

| Action | Trigger |
|---|---|
| `memo.send` | Memo dispatched to recipients |
| `memo.schedule` | Memo queued for future send |
| `memo.archive` | Memo archived |
| `memo.delete` | Memo deleted (admin only) |
| `user.create` | New user registered or imported |
| `user.deactivate` | User account deactivated |
| `user.role_assign` | User role changed |
| `user.dept_assign` | User department changed |
| `user.password_reset` | Password reset initiated |
| `user.2fa_enable` | 2FA activated on account |
| `user.2fa_disable` | 2FA deactivated on account |
| `document.access` | Attachment opened or downloaded |
| `session.revoke` | Session forcibly ended |
| `role.create` | New role created |
| `role.update` | Role permissions modified |
| `bulk_import.run` | CSV import executed |

---


## Relationship summary

```
institution
├── role            (1 : many)
├── department      (1 : many)
├── user            (1 : many)
│   ├── role        (many : 1)
│   ├── department  (many : 1, nullable)
│   └── session     (1 : many)
├── memo            (1 : many, via sender_id → user)
│   ├── memo_recipient  (1 : many)
│   ├── attachment      (1 : many)
│   ├── notification    (1 : many)
│   └── message_thread  (1 : many)
└── audit_log       (1 : many)
```

---

## Key constraints & rules

**Multi-tenancy**
- Every query from the application layer must include `institution_id` in the `WHERE` clause.
- The API middleware injects `institution_id` from the verified JWT — the client never sends it directly.
- Violation of this rule = cross-tenant data leakage. Enforce with Row Level Security (RLS) in PostgreSQL as a database-level backstop.

**Referential integrity**
- `department.head_user_id` is nullable — a department can exist without a head.
- `user.department_id` is nullable — support staff or BoG members may not belong to a department.
- `audit_log.actor_id` is nullable — system-generated events (e.g. scheduled memo send) have no human actor.

**Soft deletes**
- Never `DELETE` from `user`, `role`, `institution`, or `department`. Set `is_active = false`.
- `memo` can be hard-deleted only by an admin; the action must be logged in `audit_log` first.

**Immutability**
- `audit_log` rows must never be `UPDATE`d or `DELETE`d. Enforce with a PostgreSQL trigger or application-layer constraint.
- `memo_recipient` delivered/read/acknowledged timestamps are set once and never overwritten.

**Passwords & secrets**
- `user.password_hash` must use bcrypt (cost ≥ 12) or argon2id.
- `user.totp_secret` must be encrypted at rest using application-level encryption (AES-256-GCM), not just hashed.
- `session.token_hash` stores SHA-256(jwt) — the raw JWT is never persisted.

