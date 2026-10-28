# Feedback log: `feature/conditions`

Branch 1 of the content phase ([content.md](../content.md)). Conditions are the topics articles belong to (Migraine, Insomnia…). `articles.condition_id` is required, so they come first.

## Round 0: what was built

- **API:**
  - `GET/POST /admin/conditions` and `PATCH/DELETE /admin/conditions/:id`, behind authenticate → admin role → 2FA. Validated with zod `.strict()`, with specific messages (character counts, an example slug). Every write is audited.
  - Public `GET /conditions`: published only, cached 1 h on the server (cleared on every admin change), `Cache-Control: public, max-age=300`.
  - **Slug from the name:** "Stress & Anxiety" → `stress-and-anxiety`. Names with no English letters (e.g. Hindi) get `SLUG_REQUIRED` and must use a typed slug.
  - **Duplicates:** `409 NAME_TAKEN` / `SLUG_TAKEN` with the field path. A soft-deleted condition frees its name and slug.
  - **Delete protection:** refused while articles use the condition (`409 CONDITION_IN_USE`, "2 articles use this condition. Move them to another condition first.").
- **Admin page:** a list with article counts and status, and a create/edit form. The slug follows the name until edited by hand (in edit mode it never changes on its own, so links stay stable). Character counter on the summary, errors clear on edit, and an inline delete confirmation.
- **Other:** Postman folders "Conditions" and "Admin · Conditions" (with the hostile requests), docs/api.md rows, and a "conditions list (MySQL)" load scenario.

## Round 1: Reviewer

The multi-agent review **did not run**: both reviewers hit "session limit · resets 4:50am" before reading any code. The empty result was not treated as a pass. The review was done inline, and the multi-agent review will be re-run after the reset.

| Finding | Change |
|---|---|
| Two admins creating the same name at the same moment both pass the app check; MySQL's unique index stops the second, which got a vague "Already exists" with no field | The save maps the constraint to the same `NAME_TAKEN` / `SLUG_TAKEN` message and field. The DB test runs two parallel creates. **This test caught a second bug:** MySQL reports the *index* (`conditions_name_alive`), not the column, so the first version blamed the slug. Fixed, and proven with the app check removed (the constraint path alone gives `NAME_TAKEN`) |
| The "Published" checkbox didn't clear an error banner | It now does, like every other field |
| After clicking Delete, focus should be on the safe choice | "Keep" gets focus, so a reflexive Enter never deletes (tested) |
| A text-area `aria-invalid` expression was hard to read | Made explicit. Behaviour was already correct |

## Round 2: Tester

- **Backend:** 13 real-DB tests:
  - access: none, member, admin without 2FA;
  - create with an auto slug, both duplicate kinds, the race, Hindi names, exact messages, smuggled fields;
  - hostile text (`'); DROP TABLE…`, `<img onerror>`) stored as plain text with the table intact;
  - list, update, delete-in-use, delete then reuse, and the audit trail.
- **Frontend:** 6 page tests:
  - listing;
  - create with the slug following the name and exact messages;
  - Hindi names and a bad slug;
  - a duplicate shown under the field;
  - delete confirmation with focus on Keep and the in-use message;
  - edit.
- **Real browser:** 20/20 steps (2 new: the slug follows the name; a published condition appears in the public list), no console errors.
- **Load:** "conditions list (MySQL)": 500 connections, all 200, no errors.
  - In one run, "login flood" missed its p99 limit. Throughput was about half of yesterday's in **every** scenario (the machine had < 1 GB free RAM), and the rerun passed. The security behaviour held both times: every flood request got 429. The threshold was **not** loosened.
- **QA:** backend 215 tests (94.7% merged coverage), frontend 156 tests (91.8%), 0 vulnerabilities, bundle within budget.

## Open

- Re-run the multi-agent review after the session limit resets.
