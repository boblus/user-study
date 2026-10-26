# Controlled-error verification study

This function is independent of the existing `rapid-task` / `generate-review` generator. Do not replace the generator or run `supabase/schema.sql` to install this feature. No database migration is required.

## Deployment

Deploy this function to the same Supabase project used in `assets/config.js`, before publishing the updated frontend:

```sh
supabase functions deploy verification-probe --project-ref YOUR_PROJECT_REF
```

The deployed folder must contain both `index.ts` and `protocol.mjs`. Keep the normal Supabase JWT verification enabled; the frontend uses the existing project anon key.

The function reads the existing project secrets `API_VERSION` (`groq`, `openai`, or `cerebras`) and `API_KEY`. Optional overrides, scoped to this new function:

- `VERIFICATION_API_VERSION`
- `VERIFICATION_API_KEY`
- `VERIFICATION_MODEL`

Provider defaults mirror the local generator configuration. A provider must support the configured model. API keys remain in Supabase secrets, not frontend files. The frontend endpoint is `CONFIG.VERIFICATION_FUNCTION_URL`; `CONFIG.VERIFICATION_ENABLED` switches the new functionality on/off and is currently `true`.

No live deployment or real-model call is performed by the automated tests. Before collecting study data, exercise the deployed service and manually audit sample mutations of all three types. Semantic construction, validation, and assessment use LLM calls and are not human-certified ground truth.

## Assignment and behavior

- Only a new judgment's first candidate batch is randomized: 50% control, 50% assigned injection. Conditional on injection, `obvious`, `subtle`, and `judgment_shift` each have probability 1/3.
- Every candidate in an injected batch receives the same error type. Each candidate has a separate error ID and one localized replacement. All replacements must validate before any are displayed.
- Assignment is persisted locally before requesting mutations. Retries for the same round never reroll the type. A missing service, invalid evidence, incomplete batch, or exhausted retries yields `injection_failed`, retains the original candidates, and is never counted as control or successful exposure. Report assignment and actual delivery rates separately.
- Refinement never creates a new injection. It carries the selected candidate's original error ID forward and assesses whether that error survived. A successfully generated refinement counts as refinement; simply opening/cancelling the feedback box does not.
- Accept appends normally, without a reminder. Both initial and refinement Accept paths record the selected candidate and accepted text.
- At Submit, an accepted injected expansion is eligible for a generic reminder only if it has no completed refinement, no pre-Accept content edit, no review-box content edit, and no previous reminder. Merely changing an angle label, whitespace, or an unrelated comment does not count. Automatic append/autosave does not count.
- The reminder does not name the error, type, or affected candidate. The user can return to the review or continue submitting unchanged. The same accepted expansion is reminded at most once, including after reload.
- Editing is a behavioral signal, not proof of correction. Undo retains the fact that editing occurred; semantic assessments separately inspect the accepted and final text. `present`, `removed`, and `uncertain` refer only to the tracked injected error. Unrelated model errors are outside these labels.
- Plain-text editing is tracked per accepted expansion using versioned ranges and input splices. Local recovery retains edit history. Cross-device recovery without the journal can be ambiguous and is marked `edit_attribution_uncertain`; it does not invent evidence of checking.

## Results

The existing `backend.exportAllData(participantToken)` now includes `verificationStudy`. It contains a row per study batch, including all candidates, not only the selected one. The original `state` and `events` remain available.

| Location / field | Meaning |
| --- | --- |
| `verificationStudy.version` | Protocol version |
| `batches[].task_index`, `round_id`, `judgment_num` | Task, round, judgment identifiers; participant identity is in the enclosing export |
| `batch_id`, `assigned_injection`, `error_type`, `allocated_at` | Original random assignment and timestamp |
| `status` | `control`, `injected`, `injection_failed`, or `refinement` |
| `origin_batch_id`, `source_round_id`, `source_candidate_index` | Refinement ancestry |
| `candidates[].original_text`, `displayed_text` | This round's pre-intervention and displayed versions; refinements are not modified |
| `candidates[].probe.error_id` | Stable original error identity, retained across refinement |
| `probe.original_text`, `displayed_text`, `before`, `after` | Original injection versions and exact replaced/replacement spans |
| `probe.original_span`, `displayed_span` | Zero-based UTF-16 character offsets, end exclusive, in the named version; not PDF line numbers |
| `probe.context_before`, `context_after` | Surrounding original text |
| `probe.evidence` | Exact paper/judgment quotation, source offsets, and reference label if available |
| `probe.explanation`, `validation`, `model` | Why the manipulation is an error and its independent validation-call result |
| `probe.generation_scores_refer_to` | `original_text`: existing logprobs/uncertainty are not probabilities of the altered text |
| `acceptance.accepted_text`, `candidate_text`, `accepted_at` | Text and selection snapshot at acceptance |
| `acceptance.pre_accept_edited`, `has_refinement`, `review_edited` | Behavioral evidence used for the reminder rule |
| `acceptance.review_edits[]` | Input type/time, removed/inserted text, and affected review ranges before/after each edit |
| `acceptance.reminded_at`, `reminder_decision`, `text_at_reminder` | Reminder and response history |
| `acceptance.edited_after_reminder` | Whether a content edit occurred after the reminder |
| `acceptance.continued_after_reminder_without_edit` | Unedited continuation at submission assessment; not yet proof of successful submission |
| `acceptance.submission_status` | `pending` assessment or `submitted` after the review save succeeds |
| `acceptance.submitted_after_reminder_without_edit` | Successful submission without editing after the reminder |
| `acceptance.acceptance_assessment`, `final_assessment` | Error survival at acceptance and final submission, including reason, supporting quotation, model, and uncertainty |
| `acceptance.final_review_text` | Final text inspected for error survival, including content moved elsewhere in the review |

Storage uses `task_state.collab_rounds[].verification` and candidate metadata, plus existing `events.payload`. Ongoing edit history is also journaled in localStorage, flushed as events on autosave, and checkpointed into round records before submission. Final export derives successful submission from `task_state.submitted` if the final metadata write was interrupted.

New event types: `verification_batch`, `verification_refinement`, `verification_accept`, `verification_review_edits`, `verification_reminder_shown`, `verification_reminder_response`, `verification_submission_assessment`, and `verification_results`. The last event is emitted only after the review was saved successfully. Existing `generate` events continue to contain the original model outputs and scores.

## Tests

With Node.js 22.13 or newer:

```sh
node --test tests/verification.test.cjs tests/verification-edge.test.cjs
```

Tests use in-memory state, a small DOM substitute, and mocked model responses. They execute the actual app handlers and the Edge Function request handler, without touching participant data or calling the production services.
