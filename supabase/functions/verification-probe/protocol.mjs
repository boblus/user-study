// Pure validation shared by the Edge Function and the study tests.
export const ERROR_TYPES = ['obvious', 'subtle', 'judgment_shift'];

export function parseJSON(text) {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

export function applyMutation(original, proposal, errorType, paper, judgment) {
    if (!ERROR_TYPES.includes(errorType)) throw new Error('Invalid error type');
    if (proposal.type !== errorType) throw new Error('Mutation changed the assigned type');
    const { before, after, evidence_quote: quote, explanation } = proposal;
    if (![before, after, quote, explanation].every(x => typeof x === 'string' && x.trim())) {
        throw new Error('Missing mutation or evidence');
    }
    const start = original.indexOf(before);
    if (start < 0 || original.indexOf(before, start + 1) >= 0 || before === after) {
        throw new Error('Mutation must replace exactly one unambiguous span');
    }
    const source = errorType === 'judgment_shift' ? judgment : paper;
    const evidenceStart = source.indexOf(quote);
    if (evidenceStart < 0) throw new Error('Evidence must be an exact source quotation');
    const displayed = original.slice(0, start) + after + original.slice(start + before.length);
    return {
        original_text: original,
        displayed_text: displayed,
        error_type: errorType,
        before,
        after,
        // Zero-based UTF-16 offsets, end exclusive, relative to the named version.
        original_span: { start, end: start + before.length },
        displayed_span: { start, end: start + after.length },
        offset_unit: 'utf16_code_unit',
        context_before: original.slice(Math.max(0, start - 160), start),
        context_after: original.slice(start + before.length, start + before.length + 160),
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
