import { useEffect, useRef, useState, useCallback } from 'react';

interface UseSpeechTranscriptOptions {
    displayName: string;
    enabled: boolean;
    onResult: (text: string, displayName: string) => void;
}

export function useSpeechTranscript({ displayName, enabled, onResult }: UseSpeechTranscriptOptions) {
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    const startListening = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            const msg = 'Trình duyệt không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge.';
            setError(msg);
            console.warn('[SpeechTranscript]', msg);
            return;
        }

        // Yêu cầu quyền mic trước
        navigator.mediaDevices?.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }
        })
            .then(() => {
                const recognition = new SpeechRecognition();
                recognition.lang = 'vi-VN';
                recognition.continuous = true;
                recognition.interimResults = false;
                recognition.maxAlternatives = 1;

                recognition.onstart = () => {
                    console.log('[SpeechTranscript] Started listening');
                    setIsListening(true);
                    setError(null);
                };
                recognition.onerror = (e: any) => {
                    console.error('[SpeechTranscript] Error:', e.error);
                    if (e.error === 'not-allowed') {
                        setError('Chưa cấp quyền microphone. Vào Settings trình duyệt để cho phép.');
                    } else if (e.error === 'network') {
                        setError('Lỗi mạng khi nhận dạng giọng nói.');
                    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
                        setError(`Lỗi nhận dạng: ${e.error}`);
                    }
                };
                recognition.onend = () => {
                    setIsListening(false);
                    if (enabledRef.current) {
                        setTimeout(() => {
                            if (enabledRef.current && recognitionRef.current) {
                                try { recognitionRef.current.start(); } catch { /* ignore */ }
                            }
                        }, 300);
                    }
                };
                recognition.onresult = (e: any) => {
                    const text = e.results[e.results.length - 1][0].transcript.trim();
                    console.log('[SpeechTranscript] Result:', text);
                    if (text) {
                        onResult(text, displayName);
                    }
                };

                recognitionRef.current = recognition;
                try {
                    recognition.start();
                } catch (err) {
                    console.error('[SpeechTranscript] Start error:', err);
                }
            })
            .catch((err) => {
                const msg = 'Không thể truy cập microphone. Vui lòng cấp quyền mic cho trình duyệt.';
                setError(msg);
                console.error('[SpeechTranscript] getUserMedia error:', err);
            });
    }, [displayName, onResult]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { /* ignore */ }
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    useEffect(() => {
        if (enabled) {
            startListening();
        } else {
            stopListening();
        }
        return () => stopListening();
    }, [enabled, startListening, stopListening]);

    return { isListening, error };
}
