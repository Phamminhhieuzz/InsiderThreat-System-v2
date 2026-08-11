/**
 * Device Validator Service
 * Checks for virtual camera software that could be used to spoof FaceID
 * Uses navigator.mediaDevices.enumerateDevices() to detect suspicious devices
 */

// Blacklist of known virtual camera software device name patterns
const VIRTUAL_CAMERA_BLACKLIST = [
    'virtual',
    'obs',
    'manycam',
    'splitcam',
    'xsplit',
    'camtwist',
    'snap camera',
    'e2esoft',
    'droidcam',
    'iriun',
    'epoccam',
    'newtek',
    'avatarify',
    'chromacam',
    'mmhmm',
    'prism',
    'streamlabs',
];

export interface DeviceValidationResult {
    isValid: boolean;
    blockedDevice?: string;
    allDevices: string[];
}

/**
 * Check if any connected video input device is a known virtual camera
 */
export async function validateVideoDevices(): Promise<DeviceValidationResult> {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        const deviceNames = videoDevices.map(d => d.label.toLowerCase());

        for (const device of videoDevices) {
            const label = device.label.toLowerCase();
            for (const keyword of VIRTUAL_CAMERA_BLACKLIST) {
                if (label.includes(keyword)) {
                    console.warn(`[DeviceValidator] 🚨 Virtual camera detected: "${device.label}"`);
                    return {
                        isValid: false,
                        blockedDevice: device.label,
                        allDevices: deviceNames,
                    };
                }
            }
        }

        console.log(`[DeviceValidator] ✅ All ${videoDevices.length} video device(s) are legitimate`);
        return {
            isValid: true,
            allDevices: deviceNames,
        };
    } catch (error) {
        console.error('[DeviceValidator] Error enumerating devices:', error);
        // If we can't check, allow (don't break legitimate use)
        return { isValid: true, allDevices: [] };
    }
}

/**
 * Generate a cryptographically random nonce for anti-replay
 */
export function generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}
