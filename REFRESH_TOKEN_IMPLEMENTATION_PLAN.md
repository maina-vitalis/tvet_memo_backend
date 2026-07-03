# Token & Session Refresh Implementation Plan (High Priority)

**Date**: 2026-07-03
**Goal**: Replace long-lived single JWTs with short-lived access tokens + revocable refresh tokens.
Refresh token becomes the primary revocable credential. Access JWTs become short (15m default).

**Key Decisions (documented for review)**:
1. **Access Token**: JWT, short expiry (15 minutes). Signed with existing JWT secret. Contains claims for identity + roleId (no full role embedded to keep payload small). `exp` claim used by clients.
2. **Refresh Token**: Opaque secure random string (uuid). Stored as SHA256 hash in DB only. Long expiry (7 days). Rotated on successful refresh (old one invalidated).
3. **Storage in DB**: Extend existing `session` table (keeps device tracking, ip, ua, actor together):
   - `refreshTokenHash`
   - `refreshExpiresAt`
   - `deviceId` (client-generated or server, for multi-device management)
   - `tokenHash` will now represent the *latest* access token hash (for optional immediate revocation of a specific access, though less critical with short expiry).
4. **Revocation**: Revoking a session (via logout) invalidates the refresh token + marks session inactive. Future: support "sign out all devices".
5. **Rotation**: On /refresh, validate refresh, issue new access, generate + store *new* refresh hash, mark previous refresh used/revoked.
6. **Clients**: Both admin (Next) and mobile (RN) will use Axios. Implement request queueing on 401 to prevent thundering herd of refreshes.
7. **Storage Strategy**:
   - Mobile (RN): expo-secure-store for BOTH tokens (never plain AsyncStorage for secrets).
   - Admin web: Start with secure localStorage (access + refresh). Future improvement: httpOnly secure cookie for refreshToken via dedicated auth API routes. Document the threat.
8. **Expiry handling**: Return `expiresIn` as **number (seconds)** for access. Clients should also decode JWT `exp` for proactive refresh.
9. **Super Admin**: Will also receive refresh tokens for consistency (small scope increase).
10. **Backward**: We will break current clients (they must be updated together). Old long tokens will stop working after change.
11. **DeviceId**: Clients should generate a stable deviceId (uuid stored locally) and send on all auth calls (login, refresh). Stored on session.
12. **Queueing pattern**: Classic "one refresh at a time" + subscriber queue. See implementation comments.
13. **Error handling**: 401 after failed refresh → force full logout + redirect + friendly message.
14. **mustChangePassword**: Still respected. Setup flows return tokens too.
15. **Audit**: Log auth.login, auth.refresh, session.revoke with more metadata.
16. **Migration note**: Adding columns to session will require a new drizzle migration (`drizzle-kit generate`).

**Phased Execution Order** (follow strictly for safety):
- Backend schema + helpers first
- Backend service logic
- Backend endpoints + update all callers
- Update response types everywhere
- Then Admin Axios + auth layer
- Then Mobile secure + Axios refresh
- Global handlers
- Documentation/comments in every change

**Risks & Mitigations**:
- Token desync: Always revoke on logout. Rotate refresh.
- Race on refresh: The queue + single in-flight promise.
- RN secure store: Must load early on app boot.
- Testing: After each phase, test happy login, 401 refresh, expired refresh, logout, concurrent tabs.

**Files Likely Touched** (initial):
Backend:
- src/database/schema/sessions.ts + relations + index
- src/common/utils/crypto.util.ts (new generators)
- src/config/configuration.ts
- src/modules/auth/session.service.ts (major refactor)
- src/modules/auth/auth.service.ts
- src/modules/auth/auth.controller.ts + dto
- src/modules/super-admin-auth/...
- src/common/types/...

Admin:
- New or update axios client with interceptors
- auth features (store, hooks, apis)
- login/setup files (many fetch -> axios)

Mobile:
- package (add expo-secure-store)
- shared/utils/apiClient.ts (enhance)
- features/auth/...

**Response Shape (new standardized)**:
{
  accessToken: string,
  refreshToken: string,
  tokenType: 'Bearer',
  expiresIn: number,   // seconds until access expires
  user?: {...},
  superAdmin?: {...},
  mustChangePassword?: boolean,
  institution?: {...}
}

Clients must update their result types.

For review: Every function changed will have a block comment:
  /**
   * [REFRESH TOKENS] Description of why + how this was updated.
   * - Short access now issued here.
   * - Refresh token generated + hashed + stored.
   * Review notes: ...
   */
