// Pure validation shared by the Edge Function and the study tests.
export const ERROR_TYPES = ['factual_error', 'judgment_shift'];
export const OPERATION_VERSION = 'verification-operations-v4';
export const OPERATIONS = {
    factual_error: ['reference_mismatch', 'quotation_corruption', 'numeric_replacement',
        'certainty_upgrade', 'scope_expansion', 'evidence_upgrade'],
    judgment_shift: ['polarity_reversal', 'focus_shift', 'severity_shift'],
};

export function parseJSON(text) {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

// Record differences AFTER receiving the modified full text. The model never
// supplies anchors or offsets, and these positions do not gate its choice.
export function recordMutation(original, proposal, errorType) {
    if (!ERROR_TYPES.includes(errorType) || !OPERATIONS[errorType].includes(proposal.operation)) {
        throw new Error('the model returned an operation outside the assigned error type');
    }
    const displayed = proposal.text;
    if (typeof displayed !== 'string' || !displayed.trim()) throw new Error('the model returned no modified text');
    if (displayed.trim() === original.trim()) throw new Error('the model returned the original text without a change');
    let start = 0, end = original.length, displayedEnd = displayed.length;
    while (start < end && start < displayedEnd && original[start] === displayed[start]) start++;
    // Do not split a UTF-16 surrogate pair at a difference boundary.
    const splitsPair = (text, at) => at > 0 && at < text.length &&
        /[\uD800-\uDBFF]/.test(text[at - 1]) && /[\uDC00-\uDFFF]/.test(text[at]);
    if (splitsPair(original, start) || splitsPair(displayed, start)) start--;
    while (end > start && displayedEnd > start && original[end - 1] === displayed[displayedEnd - 1]) { end--; displayedEnd--; }
    if (splitsPair(original, end) || splitsPair(displayed, displayedEnd)) { end++; displayedEnd++; }
    return {
        original_text: original, displayed_text: displayed,
        error_type: errorType, operation_version: OPERATION_VERSION, operation: proposal.operation,
        injection_method: 'single_pass',
        before: original.slice(start, end), after: displayed.slice(start, displayedEnd),
        original_span: { start, end }, displayed_span: { start, end: displayedEnd },
        offset_unit: 'utf16_code_unit', span_scope: 'first_to_last_difference',
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
