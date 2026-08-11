import * as faceapi from '@vladmandic/face-api';

let essentialModelsLoaded = false;
let recognitionModelLoaded = false;
let essentialLoadPromise: Promise<boolean> | null = null;
let recognitionLoadPromise: Promise<boolean> | null = null;

const MODEL_URL = '/models';
const getApi = () => faceapi;

/**
 * Force CPU backend at import time — DO NOT call tf.ready().
 *
 * WHY: tf.ready() tries backends in priority order:
 *   webgl → wasm → cpu
 * On most servers/machines without GPU:
 *   - webgl fails silently
 *   - wasm: server returns HTML (404) instead of .wasm file → HANGS forever
 *   - cpu: never reached because wasm blocks
 *
 * Fix: call setBackend('cpu') synchronously WITHOUT tf.ready().
 * loadFromUri() handles the rest of initialization internally.
 */
try {
    const _api = getApi();
    if ((_api as any).tf?.setBackend) {
        (_api as any).tf.setBackend('cpu');
        console.log('[FaceAPI] ✅ Forced CPU backend (no tf.ready())');
    }
} catch (e) {
    console.warn('[FaceAPI] Could not set initial backend:', e);
}

/**
 * Load essential models (TinyFaceDetector + FaceLandmark68Net)
 * These are needed for face detection and registration.
 */
export const loadFaceApiModels = async (timeoutMs = 30000): Promise<boolean> => {
    if (essentialModelsLoaded) return true;
    if (essentialLoadPromise) return essentialLoadPromise;

    essentialLoadPromise = (async () => {
        const api = getApi();
        const t0 = performance.now();
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        try {
            console.log('[FaceAPI] ⏳ Loading models from /models...');

            const timeout = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error(`Timeout ${timeoutMs / 1000}s — kiểm tra /models trên server`)),
                    timeoutMs
                );
            });

            await Promise.race([
                Promise.all([
                    api.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
                        .then(() => console.log('[FaceAPI] ✅ TinyFaceDetector loaded')),
                    api.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
                        .then(() => console.log('[FaceAPI] ✅ FaceLandmark68Net loaded')),
                ]),
                timeout,
            ]);

            essentialModelsLoaded = true;
            const backend = (api as any).tf?.getBackend?.() ?? 'unknown';
            console.log(`[FaceAPI] ✅ Done in ${(performance.now() - t0).toFixed(0)}ms (backend: ${backend})`);

            preloadRecognitionModel(); // background
            return true;
        } catch (err) {
            console.error('[FaceAPI] ❌ Failed to load models:', err);
            essentialLoadPromise = null;
            throw err;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    })();

    return essentialLoadPromise;
};

const preloadRecognitionModel = () => {
    if (recognitionModelLoaded || recognitionLoadPromise) return;
    recognitionLoadPromise = loadRecognitionModel();
};

export const loadRecognitionModel = async (timeoutMs = 60000): Promise<boolean> => {
    if (recognitionModelLoaded) return true;
    if (recognitionLoadPromise) return recognitionLoadPromise;

    recognitionLoadPromise = (async () => {
        const api = getApi();
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
            console.log('[FaceAPI] ⏳ Loading recognition model (~6.4MB)...');

            const timeout = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error(`Recognition model timeout ${timeoutMs / 1000}s`)),
                    timeoutMs
                );
            });

            await Promise.race([
                api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                    .then(() => {
                        recognitionModelLoaded = true;
                        console.log('[FaceAPI] ✅ Recognition model loaded');
                    }),
                timeout,
            ]);

            return true;
        } catch (err) {
            console.error('[FaceAPI] ❌ Recognition model failed:', err);
            recognitionLoadPromise = null;
            throw err;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    })();

    return recognitionLoadPromise;
};

export const ensureRecognitionReady = async (): Promise<boolean> => {
    if (recognitionModelLoaded) return true;
    return loadRecognitionModel();
};

export const getFaceDetectorOptions = () => {
    const api = getApi();
    return new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
};

export const detectFace = async (source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) => {
    await ensureRecognitionReady();
    const api = getApi();
    return api.detectSingleFace(source, getFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
};
