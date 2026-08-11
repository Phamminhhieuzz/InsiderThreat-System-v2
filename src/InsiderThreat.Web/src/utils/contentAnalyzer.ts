// Sensitive keyword detection for content safety
const SENSITIVE_KEYWORDS = [
    'password', 'credential', 'secret', 'confidential',
    'banking', 'credit card', 'ssn', 'social security',
    'private key', 'api key', 'token', 'access key',
    'account number', 'pin', 'cvv', 'security code'
];

export interface ContentAnalysisResult {
    isSensitive: boolean;
    flaggedKeywords: string[];
    warningMessage: string;
}

export function detectSensitiveContent(text: string): ContentAnalysisResult {
    if (!text || text.trim().length === 0) {
        return {
            isSensitive: false,
            flaggedKeywords: [],
            warningMessage: ''
        };
    }

    const lowerText = text.toLowerCase();
    const flagged: string[] = [];

    for (const keyword of SENSITIVE_KEYWORDS) {
        if (lowerText.includes(keyword)) {
            flagged.push(keyword);
        }
    }

    const isSensitive = flagged.length > 0;

    return {
        isSensitive,
        flaggedKeywords: flagged,
        warningMessage: isSensitive
            ? `Your post contains potentially sensitive information: ${flagged.join(', ')}. Please review before sharing.`
            : ''
    };
}
