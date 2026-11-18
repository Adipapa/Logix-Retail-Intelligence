# Security Specification & Payload-First TDD — Logix Retail Platform

## 1. Data Invariants
1. **Verified Management Identity**: Every read or write across all collections requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Ownership & Admin Gate**: Every operational document stores `ownerUid` matching `request.auth.uid` on creation; reads, updates, and deletes are restricted to `resource.data.ownerUid == request.auth.uid || isAdmin()`.
3. **PII Isolation**: User profile documents in `/users/{userId}` are readable only by the owning user (`userId == request.auth.uid`) or `isAdmin()`.
4. **Role Escalation Lock**: Standard users cannot self-assign `role: "admin"` on `/users/{userId}` create or update; only the bootstrapped admin (`MuhammedGaye15@gmail.com` with `email_verified == true`) or an `/admins/{uid}` entry holds admin privileges.
5. **Immutable Audit Trail**: Documents in `/audit_logs/{auditId}` are append-only (`allow update: if false; allow delete: if false;`) and `createdAt` fields are immutable across updates.
6. **Strict Schema & Bounds**: Every document enforces `.keys().hasAll(...)` and `.keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, `isValidId()` regex (`^[a-zA-Z0-9_\-]+$`) on document IDs, bounded strings (`.size()`), and bounded arrays (`aliases.size() <= 10`, `pumpReadings.size() <= 16`).
7. **Zero Query Delegation**: Every `allow list` rule evaluates `resource.data.ownerUid == request.auth.uid || isAdmin()` without calling `get()` or `exists()`.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated List**: Anonymous read on `/daily_reports`.
2. **Unverified Email Write**: Authenticated token with `email_verified: false` attempting write to `/stations/kotu`.
3. **Self-Assigned Admin Role**: User creating `/users/{uid}` with `role: "admin"` when not bootstrapped admin.
4. **Cross-Tenant Ownership Spoof**: User A writing `/source_workbooks/wb1` with `ownerUid: "user_B"`.
5. **Shadow / Ghost Field Injection**: Creating `/stations/kotu` with an extra undeclared field `isVerified: true`.
6. **ID Poisoning**: Creating `/daily_reports/../../etc/passwd` or a 200-char ID violating `isValidId()`.
7. **Resource Exhaustion (1MB String)**: Writing `noteText` exceeding 600 chars in `/daily_reports/{reportId}`.
8. **Unbounded Array Injection**: Writing 25 items into `pumpReadings` (max 16) or 20 items into `aliases` (max 10).
9. **Immutable Field Mutation**: Updating `workbookId` or `createdAt` or `ownerUid` on an existing `/daily_reports/{reportId}`.
10. **Audit Log Tampering**: Attempting `update` or `delete` on `/audit_logs/{auditId}`.
11. **Cross-User PII Read**: Non-admin user reading `/users/{otherUserId}`.
12. **Blanket List Query Bypass**: Non-admin issuing an unfiltered `collection(db, 'daily_reports')` list query without `where('ownerUid', '==', uid)`.
