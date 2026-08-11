// cryptoService.ts — E2EE utilities using RSA-OAEP (Web Crypto API)

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

export const cryptoService = {
    // Generate RSA-OAEP Key Pair
    generateKeyPair: async (): Promise<CryptoKeyPair> => {
        return window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Export Key to Base64 (spki for public, pkcs8 for private)
    exportKey: async (key: CryptoKey): Promise<string> => {
        const format = key.type === 'public' ? 'spki' : 'pkcs8';
        const exported = await window.crypto.subtle.exportKey(format, key);
        return arrayBufferToBase64(exported);
    },

    // Import Key from Base64
    importKey: async (base64Key: string, type: 'public' | 'private'): Promise<CryptoKey> => {
        const format = type === 'public' ? 'spki' : 'pkcs8';
        const keyData = base64ToArrayBuffer(base64Key);
        return window.crypto.subtle.importKey(
            format,
            keyData,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            [type === 'public' ? 'encrypt' : 'decrypt']
        );
    },

    // Encrypt message with Public Key (CryptoKey object)
    encrypt: async (message: string, publicKey: CryptoKey): Promise<string> => {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            data
        );
        return arrayBufferToBase64(encrypted);
    },

    // Encrypt message using a Base64 public key string directly
    encryptForUser: async (message: string, publicKeyBase64: string): Promise<string> => {
        const publicKey = await cryptoService.importKey(publicKeyBase64, 'public');
        return cryptoService.encrypt(message, publicKey);
    },

    // Detect if a string is likely RSA-encrypted base64 (vs plain text legacy messages)
    // RSA-2048 ciphertext is always 256 bytes → 344 base64 chars, containing only base64 chars
    isLikelyEncrypted: (content: string): boolean => {
        if (!content || content.length < 300) return false;
        return /^[A-Za-z0-9+/]+=*$/.test(content);
    },

    // Decrypt message with Private Key.
    // Falls back to returning the original content if decryption fails
    // (handles legacy plain-text messages stored before E2EE was enabled).
    decrypt: async (encryptedMessageBase64: string, privateKey: CryptoKey): Promise<string> => {
        // If it doesn't look like ciphertext, return as-is (legacy plain text)
        if (!cryptoService.isLikelyEncrypted(encryptedMessageBase64)) {
            return encryptedMessageBase64;
        }
        try {
            const data = base64ToArrayBuffer(encryptedMessageBase64);
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "RSA-OAEP" },
                privateKey,
                data
            );
            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (e) {
            // Decryption failed — likely encrypted with a different key pair (e.g., key was rotated).
            console.warn("RSA decryption failed:", e);
            return "🔒 Tin nhắn đã được mã hóa (không thể giải mã bằng khóa hiện tại)";
        }
    },

    // Store keys in localStorage — keyed by userId to avoid cross-account conflicts
    saveKeys: (userId: string, publicKey: string, privateKey: string) => {
        localStorage.setItem(`chat_public_key_${userId}`, publicKey);
        localStorage.setItem(`chat_private_key_${userId}`, privateKey);
    },

    loadKeys: (userId: string) => {
        return {
            publicKey: localStorage.getItem(`chat_public_key_${userId}`),
            privateKey: localStorage.getItem(`chat_private_key_${userId}`)
        };
    },

    // Initialize E2EE keys: generate if not exists, always re-upload public key to keep server in sync
    initializeKeys: async (userId: string, uploadPublicKey: (userId: string, publicKey: string) => Promise<any>): Promise<{ publicKey: string; privateKey: CryptoKey }> => {
        const stored = cryptoService.loadKeys(userId);

        if (stored.publicKey && stored.privateKey) {
            // Keys exist locally — import private key and re-upload public key to ensure server is in sync
            const privateKey = await cryptoService.importKey(stored.privateKey, 'private');
            // Re-upload silently to keep server public key up-to-date (handles server DB resets, etc.)
            uploadPublicKey(userId, stored.publicKey).catch(err =>
                console.warn('[E2EE] Failed to re-sync public key with server:', err)
            );
            return { publicKey: stored.publicKey, privateKey };
        }

        // No local keys — Generate new key pair
        console.log('[E2EE] Generating new RSA key pair for user', userId);
        const keyPair = await cryptoService.generateKeyPair();

        const publicKeyBase64 = await cryptoService.exportKey(keyPair.publicKey);
        const privateKeyBase64 = await cryptoService.exportKey(keyPair.privateKey);

        // Save to localStorage (keyed by userId)
        cryptoService.saveKeys(userId, publicKeyBase64, privateKeyBase64);

        // Upload public key to server
        await uploadPublicKey(userId, publicKeyBase64);
        console.log('[E2EE] Key pair generated and public key uploaded');

        return { publicKey: publicKeyBase64, privateKey: keyPair.privateKey };
    }
};
