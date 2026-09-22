# Workout cloud sync

Project: workout-note (jllctiakquheiajiqzym). Cloud schema and ownership policies are deployed. Only the public publishable key is shipped. PR #1 is merged and the public app displays account controls.

Server verification passed: insert/update, stale revision conflict, cross-account read and write isolation, anonymous access blocked. Transactional fixtures were rolled back. Security advisors returned no lints after restricting the automatic-RLS trigger function.

Client mock checks passed: guest preservation, no implicit import, changed-date-only saves, conflict handling, account isolation, failure status and JS syntax. Actual signup email delivery and end-to-end use on two devices still require user verification.

Login saves to the server when a Save button is pressed. Background polling runs every 30 seconds and on page return. Guest records stay local; explicit Import uploads missing dates only. Offline server writes do not report success and are not queued.

Auth Site URL and exact redirect allowlist are configured to https://ujewon22325.github.io/workout/ . Email confirmation remains enabled. Default SMTP limits recipients to organization members; use the Supabase account email initially or configure custom SMTP before inviting others. The workout app requires its own email/password account, separate from the Supabase dashboard login.
