# GroupGuard — Bot specification

**Archetype:** community

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Automated group moderation bot with verification, spam detection, admin controls, and transparent logging. Requires verification within 30 minutes, auto-kicks non-compliant users, detects spam patterns, and maintains audit logs with explanations for all actions.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Group admins
- Moderators

## Success criteria

- Auto-verification of new members within 30 minutes
- Spam detection with configurable thresholds
- Admin action logs with explainable moderation decisions
- Trusted user exemptions for admins and marked accounts

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open admin dashboard for verified moderators
- **Verify me** (button, actor: user, callback: verify:user) — Initiate verification process for new members
  - inputs: user_id, join_time
  - outputs: verification_status
- **/warn** (command, actor: admin, command: /warn) — Issue warning with optional reason
- **/trust** (command, actor: admin, command: /trust) — Mark/unmark user as trusted

## Flows

### New member verification
_Trigger:_ user_join

1. Send welcome with verification button
2. Start 30-minute timer
3. Check for non-link message
4. Verify or auto-kick

_Data touched:_ Member, PendingVerification

### Spam detection
_Trigger:_ message_post

1. Check message content
2. Evaluate account age
3. Detect message repetition
4. Auto-kick if threshold breached

_Data touched:_ Member, ActionLog

### Admin action logging
_Trigger:_ /warn|/mute|/kick|/ban

1. Record action
2. Notify admin
3. Append to log

_Data touched:_ ActionLog

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Member** _(retention: persistent)_ — User status tracking
  - fields: user_id, join_time, verification_state, trusted_flag
- **ActionLog** _(retention: persistent)_ — Moderation event history
  - fields: timestamp, issuer, target, action_type, reason
- **WelcomeMessage** _(retention: persistent)_ — Customizable greeting and rules
  - fields: text, last_updated

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- /set_welcome
- /set_rules
- /view_log
- /report_summary
- /trust

## Notifications

- Verification success/failure explanations
- Spam detection alerts
- Admin action confirmations

## Permissions & privacy

- Only admins can modify settings
- Trusted users exempt from automated actions
- Action logs retain for 90 days

## Edge cases

- User rejoins after auto-kick
- Admin sends command without verification
- Message contains both text and link

## Required tests

- End-to-end verification flow with timeout
- Spam detection false positive test
- Admin command logging accuracy

## Assumptions

- 30-minute verification window is optimal
- Auto-kick is preferred over permanent ban
- Admin chat receives all critical alerts
