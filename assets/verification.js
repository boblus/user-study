/* Controlled-error study. All changes are opt-in and scoped to collab tasks. */
const VerificationStudy = (() => {
    const VERSION = 'verification-v1';
    const TYPES = ['obvious', 'subtle', 'judgment_shift'];
    const journals = new Map();
    let submitting = false;
    let submissionLock = null;
    const now = () => new Date().toISOString();
    const copy = value => JSON.parse(JSON.stringify(value));
    const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
    const uncertain = reason => ({ status: 'uncertain', reason, method: 'unavailable' });

    function context() {
        if (typeof CONFIG === 'undefined' || !CONFIG.VERIFICATION_ENABLED || typeof AppState === 'undefined') return null;
        const task = AppState.assignment?.tasks.find(t => t.index === AppState.currentTaskIndex);
        if (task?.paradigm !== 'collab') return null;
        return { token: AppState.currentToken, taskIndex: AppState.currentTaskIndex, task };
    }

    function journal(ctx) {
        const key = `${VERSION}:${ctx.token}:${ctx.taskIndex}`;
        if (!journals.has(key)) {
            let saved;
            try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* Empty journal. */ }
            journals.set(key, {
                key, allocations: {}, records: {}, reviewText: '', pendingEdits: [], ...saved,
            });
        }
        return journals.get(key);
    }

    function persist(data) {
        try { localStorage.setItem(data.key, JSON.stringify(data)); }
        catch (error) { console.error('Verification journal could not be saved locally:', error); }
    }

    async function event(ctx, type, payload, roundId) {
        await backend.appendEvent({
            participant_token: ctx.token, participant_id: ctx.token,
            task_index: ctx.taskIndex, paper_id: ctx.task.paperId, paradigm: ctx.task.paradigm,
            round_id: roundId, event_type: type,
            payload: { study_version: VERSION, ...payload }, timestamp: now(),
        });
    }

    function draw(random = () => {
        const value = new Uint32Array(1);
        crypto.getRandomValues(value);
        return value[0] / 4294967296;
    }) {
        const inject = random() < 0.5;
        return { assigned_injection: inject, error_type: inject ? TYPES[Math.floor(random() * 3)] : null };
    }

    async function request(body) {
        const response = await fetch(CONFIG.VERIFICATION_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(210000),
        });
        if (!response.ok) throw new Error(`Verification service: HTTP ${response.status}`);
        return response.json();
    }

    function validateMutation(mutation, candidate, type) {
        if (!mutation || mutation.error_type !== type || mutation.original_text !== candidate.output ||
            mutation.validation?.valid !== true || !mutation.before || !mutation.after || mutation.before === mutation.after) {
            throw new Error('Invalid verified mutation');
        }
        const span = mutation.original_span;
        if (!Number.isInteger(span?.start) || span.start < 0 || span.end !== span.start + mutation.before.length ||
            candidate.output.slice(span.start, span.end) !== mutation.before ||
            mutation.displayed_text !== candidate.output.slice(0, span.start) + mutation.after + candidate.output.slice(span.end) ||
            mutation.displayed_span?.start !== span.start || mutation.displayed_span?.end !== span.start + mutation.after.length) {
            throw new Error('Mutation offsets do not match the displayed text');
        }
    }

    async function assessments(ctx, judgment, items) {
        if (!items.length) return [];
        try {
            const result = await request({ action: 'assess',
                paper_content: await CollabSimulator.getPaperContent(ctx.task.paperId),
                original_judgment: judgment, items,
            });
            return items.map(item => {
                const matches = (result.assessments || []).filter(x => x.id === item.id);
                const value = matches[0];
                if (matches.length !== 1 || !['present', 'removed', 'uncertain'].includes(value.status) ||
                    typeof value.reason !== 'string' ||
                    (value.status === 'present' && (!value.quote || !item.text.includes(value.quote))) ||
                    (value.quote && !item.text.includes(value.quote))) return uncertain('Invalid semantic assessment');
                return { ...value, model: result.model, assessed_at: now() };
            });
        } catch (error) {
            return items.map(() => uncertain(error.message));
        }
    }

    async function prepareBatch(candidates, rounds, judgmentNum, judgment, isRefinement = false) {
        const ctx = context();
        if (!ctx) return { candidates, study: null };
        const roundId = rounds.length + 1;
        const prior = rounds.filter(r => r.judgmentNum === judgmentNum);
        const last = prior[prior.length - 1];
        if (isRefinement || prior.length) {
            // Never mutate a refinement, even if the original assignment was control or failed.
            const probe = last?.candidates?.[last.selectedCandidateIndex]?.verification?.probe;
            const originalJudgment = last?.verification?.original_judgment || prior[0]?.judgment || judgment;
            const checks = probe ? await assessments(ctx, originalJudgment,
                candidates.map((c, i) => ({ id: String(i), text: c.output, probe }))) : [];
            const study = { version: VERSION, status: 'refinement', new_injection: false,
                participant_id: ctx.token, paper_id: ctx.task.paperId, task_index: ctx.taskIndex,
                origin_batch_id: last?.verification?.origin_batch_id || last?.verification?.batch_id || null,
                original_judgment: originalJudgment, source_round_id: last?.roundId ?? null,
                source_candidate_index: last?.selectedCandidateIndex ?? null, feedback: last?.feedback || '',
                completed_at: now(),
            };
            const displayed = candidates.map((candidate, i) => probe ? {
                ...candidate, verification: { probe: copy(probe), assessment: checks[i], inherited: true },
            } : candidate);
            await event(ctx, 'verification_refinement', { ...study,
                candidates: displayed.map((c, i) => ({ index: i, text: c.output, verification: c.verification || null })),
            }, roundId);
            return { candidates: displayed, study };
        }

        const data = journal(ctx);
        const slot = String(roundId);
        if (!data.allocations[slot]) {
            data.allocations[slot] = {
                version: VERSION, batch_id: crypto.randomUUID(), ...draw(),
                participant_id: ctx.token, paper_id: ctx.task.paperId, task_index: ctx.taskIndex,
                original_judgment: judgment, judgment_num: judgmentNum,
                allocated_at: now(), injection_probability: 0.5, type_probability: 1 / 3,
            };
            persist(data); // A retry never rerolls the assignment.
        }
        const study = { ...data.allocations[slot], status: 'control', candidate_count: candidates.length };
        let displayed = candidates;
        if (study.assigned_injection) {
            try {
                const result = await request({ action: 'inject', error_type: study.error_type,
                    paper_content: await CollabSimulator.getPaperContent(ctx.task.paperId),
                    original_judgment: judgment,
                    candidates: candidates.map((c, i) => ({ id: String(i), text: c.output })),
                });
                study.attempts = result.attempts;
                study.injection_diagnostics = result.diagnostics || [];
                if (result.status !== 'injected' || result.mutations?.length !== candidates.length) {
                    throw new Error(result.reason || 'Incomplete injection batch');
                }
                // Validate everything before exposing ANY altered candidate.
                const mutations = candidates.map((candidate, i) => {
                    const matches = result.mutations.filter(m => m.candidate_id === String(i));
                    if (matches.length !== 1) throw new Error('Missing or duplicate mutation');
                    validateMutation(matches[0], candidate, study.error_type);
                    return matches[0];
                });
                displayed = candidates.map((candidate, i) => ({
                    ...candidate, output: mutations[i].displayed_text,
                    verification: {
                        probe: { ...mutations[i], error_id: `${study.batch_id}:${i}`,
                            batch_id: study.batch_id, candidate_index: i, original_judgment: judgment,
                            source_round_id: roundId, injected_at: now(), model: result.model,
                            generation_scores_refer_to: 'original_text',
                        },
                        assessment: { status: 'present', method: 'validated_injection' }, inherited: false,
                    },
                }));
                study.status = 'injected';
            } catch (error) {
                study.status = 'injection_failed';
                study.failure_reason = error.message;
                console.error('Study injection failed; original candidates retained:', error.message);
            }
        }
        await event(ctx, 'verification_batch', { ...study,
            candidates: displayed.map((c, i) => ({ index: i, text: c.output, verification: c.verification || null })),
        }, roundId);
        return { candidates: displayed, study };
    }

    // Find the single splice represented by an input event. Normal typing produces
    // one splice; whole-review paste/undo is handled conservatively below.
    function diff(before, after) {
        let start = 0;
        while (start < before.length && start < after.length && before[start] === after[start]) start++;
        let end = before.length, nextEnd = after.length;
        while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
        return { start, end, inserted: after.slice(start, nextEnd), removed: before.slice(start, end) };
    }

    function updateEditor(data, after, userEdit, inputType = 'input') {
        const before = data.reviewText;
        if (before === after) return;
        const change = diff(before, after);
        const delta = change.inserted.length - (change.end - change.start);
        const timestamp = now();
        for (const record of Object.values(data.records)) {
            const { start, end } = record.range;
            const oldText = before.slice(start, end);
            let nextStart = start, nextEnd = end;
            let overlaps = false;
            const boundaryInsertion = change.start === change.end && normalize(change.inserted) &&
                !change.inserted.includes('\n\n') && (change.start === start || change.start === end);
            if (change.end <= start && !boundaryInsertion) { nextStart += delta; nextEnd += delta; }
            else if (change.start >= end && !boundaryInsertion) { /* Edit belongs to later review content. */ }
            else {
                overlaps = true;
                // An unchanged block can move during a paste/reorder without being edited.
                const found = oldText ? after.indexOf(oldText) : -1;
                if (change.start < start && change.end > end && found >= 0 && after.indexOf(oldText, found + 1) < 0) {
                    nextStart = found; nextEnd = found + oldText.length; overlaps = false;
                } else {
                    nextStart = start <= change.start ? start : change.start;
                    nextEnd = end >= change.end ? end + delta : change.start + change.inserted.length;
                }
            }
            nextStart = Math.max(0, Math.min(after.length, nextStart));
            nextEnd = Math.max(nextStart, Math.min(after.length, nextEnd));
            const nextText = after.slice(nextStart, nextEnd);
            if (userEdit && overlaps && oldText !== nextText) {
                const edit = { timestamp, input_type: inputType, change: copy(change),
                    range_before: { start, end }, range_after: { start: nextStart, end: nextEnd },
                    meaningful_text_change: normalize(oldText) !== normalize(nextText),
                };
                record.review_edits.push(edit);
                if (edit.meaningful_text_change) record.review_edited = true;
                data.pendingEdits.push({ round_id: record.round_id, error_id: record.probe.error_id, ...edit });
            }
            record.range = { start: nextStart, end: nextEnd };
            record.current_text = nextText;
        }
        data.reviewText = after;
        persist(data);
    }

    function restore(rounds, reviewText) {
        const ctx = context();
        if (!ctx) return;
        const data = journal(ctx);
        for (const round of rounds) {
            const saved = round.verification?.acceptance;
            if (saved && !data.records[round.roundId]) data.records[round.roundId] = copy(saved);
        }
        // Journal text and saved draft may differ after an interrupted autosave.
        // Rebase ranges, but never invent evidence of a user editing on restoration.
        if (!data.reviewText) {
            for (const record of Object.values(data.records)) {
                const location = reviewText.indexOf(record.current_text);
                if (record.current_text && location >= 0 && reviewText.indexOf(record.current_text, location + 1) < 0) {
                    record.range = { start: location, end: location + record.current_text.length };
                } else {
                    // Cross-device recovery has no local edit journal. Keep uncertainty explicit.
                    record.edit_attribution_uncertain = true;
                }
            }
            data.reviewText = reviewText;
        }
        else updateEditor(data, reviewText, false, 'restore');
        persist(data);
    }

    function captureEditor(inputType = 'input') {
        const ctx = context();
        if (!ctx) return;
        const editor = document.getElementById('review-editor');
        if (editor) updateEditor(journal(ctx), editor.value, true, inputType);
    }

    function recordAcceptance(round, acceptedText, beforeReview, afterReview) {
        const ctx = context();
        if (!ctx || !round) return;
        const data = journal(ctx);
        if (data.reviewText !== beforeReview) updateEditor(data, beforeReview, false, 'synchronize');
        updateEditor(data, afterReview, false, 'automatic_append');
        const candidate = round.candidates?.[round.selectedCandidateIndex ?? 0];
        const probe = candidate?.verification?.probe;
        if (!probe) return;
        const versions = [candidate.output];
        if (candidate.angle) versions.push(`【${candidate.angle}】：\n${candidate.output}`);
        const edited = !versions.some(text => normalize(text) === normalize(acceptedText));
        const record = {
            round_id: round.roundId, judgment_num: round.judgmentNum,
            selected_candidate_index: round.selectedCandidateIndex ?? 0,
            probe: copy(probe), accepted_at: now(), accepted_text: acceptedText,
            candidate_text: candidate.output, pre_accept_edited: edited,
            has_refinement: round.verification?.status === 'refinement',
            review_edited: false, review_edits: [],
            range: { start: afterReview.length - acceptedText.length, end: afterReview.length },
            current_text: acceptedText, review_at_accept: afterReview,
            acceptance_assessment: edited ? uncertain('Edited acceptance awaits semantic assessment') : candidate.verification.assessment,
            reminded_at: null, reminder_decision: null,
        };
        data.records[round.roundId] = record;
        round.verification = { ...round.verification, acceptance: copy(record) };
        persist(data);
        void event(ctx, 'verification_accept', copy(record), round.roundId);
    }

    async function flushEdits() {
        const ctx = context();
        if (!ctx) return;
        const data = journal(ctx);
        if (!data.pendingEdits.length) return;
        const edits = data.pendingEdits.splice(0);
        persist(data);
        // Full per-expansion edit history remains in the journal and final results,
        // even when the existing backend's best-effort event write fails.
        await event(ctx, 'verification_review_edits', { edits, review_text: data.reviewText });
    }

    function needsReminder(record) {
        return !record.has_refinement && !record.pre_accept_edited && !record.review_edited && !record.reminded_at;
    }

    function reminderDialog() {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'verification-reminder';
            const message = document.createElement('p');
            message.textContent = 'Before submitting, please check the expansions against the paper and your original judgments. Verify the cited evidence, the strength of the claims, and whether they preserve your intended evaluation.';
            const back = document.createElement('button');
            back.className = 'btn btn-primary';
            back.textContent = 'Return to review';
            const proceed = document.createElement('button');
            proceed.className = 'btn btn-secondary';
            proceed.textContent = 'Continue submitting';
            const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
            back.addEventListener('click', () => finish(false));
            proceed.addEventListener('click', () => finish(true));
            dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
            dialog.append(message, back, proceed);
            document.body.appendChild(dialog);
            dialog.showModal();
            back.focus();
        });
    }

    async function saveRecords(ctx, data) {
        const state = await backend.getCurrentState(ctx.token);
        const rounds = state.tasks?.[ctx.taskIndex]?.collabRounds;
        if (!Array.isArray(rounds)) throw new Error('Study rounds could not be loaded');
        for (const round of rounds) {
            const record = data.records[round.roundId];
            if (record && round.status === 'accepted') round.verification = { ...round.verification, acceptance: copy(record) };
        }
        await backend.saveState(ctx.token, ctx.taskIndex, { collabRounds: rounds });
    }

    async function beforeSubmit() {
        const ctx = context();
        if (!ctx) return true;
        if (submitting || submissionLock) return false;
        submitting = true;
        try {
            captureEditor();
            await flushEdits();
            const data = journal(ctx);
            if (!Object.keys(data.records).length) return true;
            const state = await backend.getCurrentState(ctx.token);
            const savedRounds = state.tasks?.[ctx.taskIndex]?.collabRounds;
            if (!Array.isArray(savedRounds)) throw new Error('Study rounds could not be loaded');
            for (const record of Object.values(data.records)) {
                if (!savedRounds.some(r => r.roundId === record.round_id && r.status === 'accepted')) {
                    throw new Error('An acceptance has not finished saving');
                }
            }
            const records = Object.values(data.records);
            if (!records.length) return true;
            const unreviewed = records.filter(needsReminder);
            if (unreviewed.length) {
                const timestamp = now();
                for (const record of unreviewed) {
                    record.reminded_at = timestamp;
                    record.edit_count_at_reminder = record.review_edits.length;
                    record.text_at_reminder = record.current_text;
                }
                persist(data);
                try { await saveRecords(ctx, data); }
                catch (error) {
                    for (const record of unreviewed) record.reminded_at = null;
                    persist(data);
                    throw error;
                }
                await event(ctx, 'verification_reminder_shown', {
                    error_ids: unreviewed.map(r => r.probe.error_id), review_text: data.reviewText,
                    reason: 'no_refinement_or_candidate_or_review_edit',
                });
                const proceed = await reminderDialog();
                for (const record of unreviewed) record.reminder_decision = proceed ? 'continue_submitting' : 'return_to_review';
                persist(data);
                await saveRecords(ctx, data);
                await event(ctx, 'verification_reminder_response', {
                    error_ids: unreviewed.map(r => r.probe.error_id), decision: proceed ? 'continue_submitting' : 'return_to_review',
                });
                if (!proceed) return false;
            }
            return true;
        } catch (error) {
            console.error('Could not save verification records:', error);
            alert('Your study records could not be saved. Please try submitting again.');
            return false;
        } finally { submitting = false; }
    }

    async function finalize(reviewText) {
        const ctx = context();
        if (!ctx) return;
        const data = journal(ctx);
        const records = Object.values(data.records);
        if (!records.length) return;
        const panel = document.querySelector('.task-right');
        const button = document.getElementById('submit-review-btn');
        submissionLock = { panel, button, inert: panel?.inert, disabled: button?.disabled, buttonHTML: button?.innerHTML };
        if (panel) panel.inert = true;
        if (button) {
            button.disabled = true;
            button.textContent = 'Submitting…';
        }
        // Assess the usual small set together, rather than serially requesting
        // the whole paper once per judgment. Each probe retains its own judgment.
        for (let offset = 0; offset < records.length; offset += 10) {
            const group = records.slice(offset, offset + 10);
            const items = group.flatMap(record => [
                { id: `${record.round_id}:accept`, text: record.accepted_text, probe: record.probe },
                { id: `${record.round_id}:final`, text: reviewText, probe: record.probe,
                    tracked_excerpt: record.current_text, edit_attribution_uncertain: record.edit_attribution_uncertain || false },
            ]);
            const checked = await assessments(ctx, '', items);
            group.forEach((record, i) => {
                record.acceptance_assessment = checked[2 * i];
                record.final_assessment = checked[2 * i + 1];
                record.edited_after_reminder = !!record.reminded_at && record.review_edits
                    .slice(record.edit_count_at_reminder).some(edit => edit.meaningful_text_change);
                record.continued_after_reminder_without_edit = !!record.reminded_at && !record.edited_after_reminder;
                record.submission_status = 'pending';
                record.final_review_text = reviewText;
                record.finalized_at = now();
            });
        }
        persist(data);
        await saveRecords(ctx, data);
        await event(ctx, 'verification_submission_assessment', { results: copy(records), final_review_text: reviewText });
    }

    async function submissionSaved(reviewText) {
        const ctx = context();
        if (!ctx) return;
        const data = journal(ctx);
        const records = Object.values(data.records);
        if (!records.length) return;
        for (const record of records) {
            record.submission_status = 'submitted';
            record.submitted_after_reminder_without_edit = record.continued_after_reminder_without_edit;
        }
        persist(data);
        // The review is already saved. Metadata persistence must not report that
        // the successful review submission failed; the export also derives status
        // from task.submitted if this second write is interrupted.
        try { await saveRecords(ctx, data); }
        catch (error) { console.error('Final verification metadata save failed:', error); }
        await event(ctx, 'verification_results', { results: copy(records), final_review_text: reviewText });
    }

    function finishSubmission() {
        if (!submissionLock) return;
        const { panel, button, inert, disabled, buttonHTML } = submissionLock;
        if (panel) panel.inert = inert;
        if (button) { button.disabled = disabled; button.innerHTML = buttonHTML; }
        submissionLock = null;
    }

    function exportResults(state) {
        const batches = [];
        for (const [taskIndex, task] of Object.entries(state.tasks || {})) {
            for (const round of task.collabRounds || []) {
                if (!round.verification) continue;
                const metadata = copy(round.verification);
                if (metadata.acceptance && task.submitted) {
                    metadata.acceptance.submission_status = 'submitted';
                    metadata.acceptance.submitted_after_reminder_without_edit = metadata.acceptance.continued_after_reminder_without_edit;
                }
                batches.push({
                    task_index: Number(taskIndex), round_id: round.roundId, judgment_num: round.judgmentNum,
                    judgment: round.judgment, feedback: round.feedback || null, outcome: round.status,
                    selected_candidate_index: round.selectedCandidateIndex,
                    ...metadata,
                    candidates: (round.candidates || []).map((c, index) => ({
                        index, displayed_text: c.output,
                        original_text: c.verification?.inherited ? c.output : (c.verification?.probe?.original_text || c.output),
                        ...(c.verification ? copy(c.verification) : {}),
                    })),
                });
            }
        }
        return { version: VERSION, offset_convention: 'zero-based UTF-16 code units; end exclusive; version-specific',
            assessment_note: 'Model assessments require human audit; behavioral flags do not prove verification.', batches };
    }

    return { prepareBatch, restore, captureEditor, recordAcceptance, flushEdits, beforeSubmit, finalize,
        finishSubmission, submissionSaved, exportResults,
        // Pure helpers exported for deterministic study tests, not participant UI.
        draw, diff, updateEditor, needsReminder, validateMutation };
})();

if (typeof module !== 'undefined') module.exports = VerificationStudy;
