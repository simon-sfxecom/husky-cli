/**
 * PII Filter for GDPR-Compliant Embeddings
 *
 * Sanitizes content before embedding to remove personally identifiable information (PII).
 * This enables:
 * - DSGVO/GDPR compliance
 * - Use of US-hosted models (OpenAI, Anthropic US)
 * - Automatic SOP generation from learnings
 * - Unlimited retention (no Löschrecht)
 */

// PII patterns to detect and redact
const PII_PATTERNS = [
    // Email addresses
    {
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '[EMAIL]',
        name: 'Email',
    },
    // Order/Ticket IDs (5+ digits)
    {
        regex: /\b(?:order|ticket|bestellung|auftrag)[:\s#]*(\d{5,})\b/gi,
        replacement: (match: string) => match.replace(/\d{5,}/g, '[ORDER_ID]'),
        name: 'Order/Ticket ID',
    },
    // Phone numbers (German/international)
    {
        regex: /\b(?:\+49|0049|0)\s*\d{2,5}[\s/-]?\d{3,10}\b/g,
        replacement: '[PHONE]',
        name: 'Phone Number',
    },
    // Names (heuristic: Capitalized words in sequence, 2-3 words)
    // Only redact if looks like a full name (First Last or First Middle Last)
    {
        regex: /\b([A-Z][a-zäöüß]+)\s+([A-Z][a-zäöüß]+)(?:\s+([A-Z][a-zäöüß]+))?\b/g,
        replacement: '[NAME]',
        name: 'Name (heuristic)',
        // Whitelist common technical terms to avoid false positives
        skip: (match: string) => {
            const whitelist = ['Cloud Run', 'Cloud Functions', 'Cloud Storage', 'Git Commit', 'Pull Request', 'Status Code'];
            return whitelist.some(term => match.includes(term));
        },
    },
    // German street addresses
    {
        regex: /\b([A-ZÄÖÜ][a-zäöüß]+(?:straße|str\.|weg|platz|allee))\s+\d+[a-z]?\b/gi,
        replacement: '[ADDRESS]',
        name: 'Street Address',
    },
    // IBAN/Bank accounts
    {
        regex: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{0,4}\b/g,
        replacement: '[IBAN]',
        name: 'IBAN',
    },
    // Credit card numbers (groups of 4 digits)
    {
        regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        replacement: '[CARD_NUMBER]',
        name: 'Credit Card',
    },
];

export interface SanitizeResult {
    sanitized: string;
    redactedTypes: string[];
    redactionCount: number;
}

/**
 * Sanitize content by removing PII
 */
export function sanitizeForEmbedding(content: string, allowPii: boolean = false): SanitizeResult {
    if (allowPii) {
        return {
            sanitized: content,
            redactedTypes: [],
            redactionCount: 0,
        };
    }

    let sanitized = content;
    const redactedTypes = new Set<string>();
    let redactionCount = 0;

    for (const pattern of PII_PATTERNS) {
        // Check if pattern should be skipped
        if (pattern.skip && pattern.skip(sanitized)) {
            continue;
        }

        // Apply pattern
        const before = sanitized;
        sanitized = sanitized.replace(pattern.regex, (match: string) => {
            redactionCount++;
            redactedTypes.add(pattern.name);

            // If replacement is a function, call it
            if (typeof pattern.replacement === 'function') {
                return pattern.replacement(match);
            }
            return pattern.replacement as string;
        });

        // Check if anything was actually replaced
        if (sanitized !== before) {
            redactedTypes.add(pattern.name);
        }
    }

    return {
        sanitized,
        redactedTypes: Array.from(redactedTypes),
        redactionCount,
    };
}

/**
 * Check if content contains PII
 */
export function containsPII(content: string): boolean {
    const result = sanitizeForEmbedding(content);
    return result.redactionCount > 0;
}

/**
 * Preview what would be redacted (for debugging)
 */
export function previewRedaction(content: string): {
    original: string;
    sanitized: string;
    changes: Array<{ type: string; count: number }>;
} {
    const result = sanitizeForEmbedding(content);

    // Count by type
    const typeCounts: Record<string, number> = {};
    for (const type of result.redactedTypes) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    return {
        original: content,
        sanitized: result.sanitized,
        changes: Object.entries(typeCounts).map(([type, count]) => ({ type, count })),
    };
}
