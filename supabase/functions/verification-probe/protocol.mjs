// Pure validation shared by the Edge Function and the study tests.
export const ERROR_TYPES = ['obvious', 'subtle', 'judgment_shift'];
export const OPERATION_VERSION = 'verification-operations-v2';
export const OPERATIONS = {
    obvious: ['reference_mismatch', 'quotation_corruption', 'numeric_replacement'],
    subtle: ['certainty_upgrade', 'scope_expansion', 'evidence_upgrade'],
    judgment_shift: ['polarity_reversal', 'focus_shift', 'severity_shift'],
};

export function parseJSON(text) {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

export function applyMutation(original, proposal, errorType, paper, judgment) {
    if (!ERROR_TYPES.includes(errorType)) throw new Error('Invalid error type');
    if (proposal.type !== errorType) throw new Error('Mutation changed the assigned type');
    if (!OPERATIONS[errorType].includes(proposal.operation)) throw new Error('Invalid operation for the assigned type');
    const { evidence_quote: quote, explanation } = proposal;
    if (![quote, explanation].every(x => typeof x === 'string' && x.trim())) {
        throw new Error('Missing evidence or explanation');
    }
    const source = errorType === 'judgment_shift' ? judgment : paper;
    const evidenceStart = source.indexOf(quote);
    if (evidenceStart < 0) throw new Error('Evidence must be an exact source quotation');
    // Accept a single before/after replacement as shorthand, but always emit the
    // same explicit edit records. Operation IDs are required for new injections.
    const proposedEdits = proposal.edits ?? [{ kind: 'replace', before: proposal.before, after: proposal.after }];
    if (!Array.isArray(proposedEdits) || !proposedEdits.length) throw new Error('Missing mutation edits');
    function locate(text) {
        if (typeof text !== 'string' || !text.trim()) throw new Error('Missing edit anchor');
        const at = original.indexOf(text);
        if (at < 0 || original.indexOf(text, at + 1) >= 0) throw new Error('Edit anchor must match exactly one original span');
        return at;
    }
    const edits = proposedEdits.map(edit => {
        if (edit?.kind === 'replace') {
            const start = locate(edit.before);
            if (typeof edit.after !== 'string' || edit.before === edit.after) throw new Error('Invalid replacement');
            return { kind: 'replace', before: edit.before, after: edit.after, original_span: { start, end: start + edit.before.length } };
        }
        if (edit?.kind === 'insert') {
            const anchorStart = locate(edit.anchor);
            if (!['before', 'after'].includes(edit.position) || typeof edit.text !== 'string' || !edit.text.trim()) {
                throw new Error('Invalid insertion');
            }
            const start = anchorStart + (edit.position === 'after' ? edit.anchor.length : 0);
            return { kind: 'insert', before: '', after: edit.text, original_span: { start, end: start },
                anchor: edit.anchor, anchor_span: { start: anchorStart, end: anchorStart + edit.anchor.length }, position: edit.position };
        }
        throw new Error('Unknown edit kind');
    }).sort((a, b) => a.original_span.start - b.original_span.start || a.original_span.end - b.original_span.end);
    let displayed = '', cursor = 0;
    const applied = edits.map((edit, i) => {
        const { start, end } = edit.original_span;
        if (start < cursor || (i > 0 && start === edits[i - 1].original_span.start)) throw new Error('Mutation edits overlap');
        displayed += original.slice(cursor, start);
        const displayedStart = displayed.length;
        displayed += edit.after;
        cursor = end;
        return { ...edit, displayed_span: { start: displayedStart, end: displayed.length } };
    });
    displayed += original.slice(cursor);
    if (displayed === original) throw new Error('Mutation did not change the candidate');
    // Envelope fields preserve compatibility with saved probes and the existing
    // review tracking; edits[] supplies each precise location within that envelope.
    const start = applied[0].original_span.start;
    const end = applied[applied.length - 1].original_span.end;
    const displayedEnd = applied[applied.length - 1].displayed_span.end;
    const before = original.slice(start, end);
    const after = displayed.slice(start, displayedEnd);
    return {
        original_text: original,
        displayed_text: displayed,
        error_type: errorType,
        operation_version: OPERATION_VERSION,
        operation: proposal.operation,
        selection_reason: typeof proposal.selection_reason === 'string' ? proposal.selection_reason : null,
        edit_mode: new Set(applied.map(edit => edit.kind)).size > 1 ? 'mixed' : applied[0].kind,
        edits: applied,
        before,
        after,
        // Zero-based UTF-16 offsets, end exclusive, relative to the named version.
        original_span: { start, end },
        displayed_span: { start, end: displayedEnd },
        offset_unit: 'utf16_code_unit',
        context_before: original.slice(Math.max(0, start - 160), start),
        context_after: original.slice(end, end + 160),
        evidence: {
            source: errorType === 'judgment_shift' ? 'original_judgment' : 'paper_text',
            quote,
            start: evidenceStart,
            end: evidenceStart + quote.length,
            reference: typeof proposal.reference === 'string' ? proposal.reference : null,
        },
        explanation,
    };
}

export function validateVerdict(value, text) {
    if (!value || !['present', 'removed', 'uncertain'].includes(value.status) ||
        typeof value.reason !== 'string' || !value.reason.trim()) {
        throw new Error('Invalid assessment');
    }
    const quote = typeof value.quote === 'string' ? value.quote : '';
    if ((value.status === 'present' && !quote) || (quote && !text.includes(quote))) {
        throw new Error('Assessment quotation is not in the assessed text');
    }
    return { status: value.status, reason: value.reason, quote, method: 'llm', requires_human_review: true };
}
