# Workout cloud sync

Project: workout-note (jllctiakquheiajiqzym). Cloud schema and ownership policies are deployed. Only the public publishable key is shipped.

Server verification passed: insert/update, stale revision conflict, cross-account read and write isolation, anonymous access blocked. Transactional fixtures were rolled back. Security advisors returned no lints after restricting the automatic-RLS trigger function.

Client mock checks passed: guest preservation, no implicit import, changed-date-only saves, conflict handling, account isolation, failure status and JS syntax. Browser sessions and actual signup email delivery still require user verification.

Login saves to the server when a Save button is pressed. Background polling runs every 30 seconds and on page return. Guest records stay local; explicit Import uploads missing dates only. Offline server writes do not report success and are not queued.

Pending admin configuration: Auth Site URL / redirect allowlist should be https://ujewon22325.github.io/workout/ . Default SMTP limits recipients to organization members; use the Supabase account email initially or configure custom SMTP before inviting others.
