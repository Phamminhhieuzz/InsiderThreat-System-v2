/**
 * LivenessChallenge Component
 * Full-screen liveness detection UI with camera feed + challenge overlay.
 * 
 * Flow:
 * 1. Check for virtual cameras
 * 2. Start camera + load face-api models
 * 3. Show challenges one by one (blink, turn head, etc.)
 * 4. On success → capture face descriptor → callback onComplete
 * 5. On fail/timeout → callback onFail
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as faceapi from '@vladmandic/face-api';
import { loadFaceApiModels, getFaceDetectorOptions, ensureRecognitionReady } from '../services/faceApi';
import { LivenessDetector, generateChallenges } from '../services/livenessService';

import type { LivenessChallenge as LivenessChallengeType } from '../services/livenessService';
import { validateVideoDevices } from '../services/deviceValidator';

interface LivenessChallengeProps {
    visible: boolean;
    onComplete: (descriptor: number[], livenessVerified: boolean) => void;
    onFail: (reason: string) => void;
    onCancel: () => void;
}

type Phase = 'checking_device' | 'loading' | 'challenge' | 'capturing' | 'done' | 'failed';

export default function LivenessChallengeComponent({ visible, onComplete, onFail, onCancel }: LivenessChallengeProps) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number>(0);
    const detectorRef = useRef(new LivenessDetector(8000));

    const [phase, setPhase] = useState<Phase>('checking_device');
    const [challenges, setChallenges] = useState<LivenessChallengeType[]>([]);
    const [currentChallengeIdx, setCurrentChallengeIdx] = useState(0);
    const [remainingTime, setRemainingTime] = useState(8000);
    const [statusText, setStatusText] = useState('');
    const [blockedDevice, setBlockedDevice] = useState<string | null>(null);

    // Cleanup
    const cleanup = useCallback(() => {
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = 0;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!visible) {
            cleanup();
            setPhase('checking_device');
            setChallenges([]);
            setCurrentChallengeIdx(0);
            return;
        }
        startFlow();
        return () => cleanup();
    }, [visible]);

    const startFlow = async () => {
        // Phase 1: Check for virtual cameras
        setPhase('checking_device');
        setStatusText(t('liveness.checking_device', 'Đang kiểm tra thiết bị camera...'));

        const deviceResult = await validateVideoDevices();
        if (!deviceResult.isValid) {
            setBlockedDevice(deviceResult.blockedDevice || 'Unknown');
            setPhase('failed');
            onFail(`Virtual camera detected: ${deviceResult.blockedDevice}`);
            return;
        }

        // Phase 2: Load models & start camera
        setPhase('loading');
        setStatusText(t('liveness.loading_models', 'Đang tải mô hình AI...'));

        try {
            await loadFaceApiModels();
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            streamRef.current = mediaStream;

            // Wait for video element
            await new Promise<void>(resolve => {
                const check = () => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = mediaStream;
                        videoRef.current.onloadedmetadata = () => resolve();
                    } else {
                        setTimeout(check, 50);
                    }
                };
                check();
            });

            // Phase 3: Start challenges
            const newChallenges = generateChallenges(2);
            setChallenges(newChallenges);
            setCurrentChallengeIdx(0);
            setPhase('challenge');
            detectorRef.current.reset();
            startDetectionLoop(newChallenges, 0);
        } catch (error) {
            console.error('[Liveness] Init error:', error);
            setPhase('failed');
            onFail('Camera or model initialization failed');
        }
    };

    const startDetectionLoop = (challengeList: LivenessChallengeType[], idx: number) => {
        const detector = detectorRef.current;
        const api = (faceapi as any).default || faceapi;

        const loop = async () => {
            if (!videoRef.current || !streamRef.current) return;

            // Check timeout
            if (detector.isTimedOut()) {
                setPhase('failed');
                onFail(t('liveness.timeout', 'Hết thời gian! Vui lòng thử lại.'));
                return;
            }

            setRemainingTime(detector.getRemainingTime());

            try {
                const options = getFaceDetectorOptions();
                // Only detect face + landmarks for liveness (NO descriptor - saves ~90% CPU per frame)
                const detection = await api.detectSingleFace(videoRef.current, options)
                    .withFaceLandmarks();

                if (detection) {
                    const challenge = challengeList[idx];
                    const completed = detector.processFrame(detection.landmarks, challenge.type);

                    if (completed) {
                        // Mark challenge as done
                        const updated = [...challengeList];
                        updated[idx] = { ...updated[idx], completed: true };
                        setChallenges(updated);

                        const nextIdx = idx + 1;
                        if (nextIdx < challengeList.length) {
                            // Move to next challenge
                            setCurrentChallengeIdx(nextIdx);
                            detector.reset();
                            startDetectionLoop(updated, nextIdx);
                            return; // Don't continue this loop
                        } else {
                            // All challenges completed! Now load recognition model & capture descriptor
                            setPhase('capturing');
                            await ensureRecognitionReady();
                            const finalDetection = await api.detectSingleFace(videoRef.current, options)
                                .withFaceLandmarks()
                                .withFaceDescriptor();
                            if (finalDetection) {
                                const descriptor = Array.from(finalDetection.descriptor) as number[];
                                setPhase('done');
                                onComplete(descriptor, true);
                            } else {
                                setPhase('failed');
                                onFail('Mất dấu khuôn mặt ở bước cuối. Vui lòng thử lại.');
                            }
                            return;
                        }
                    }
                }
            } catch (e) {
                // Ignore individual frame errors
            }

            animFrameRef.current = requestAnimationFrame(loop);
        };

        animFrameRef.current = requestAnimationFrame(loop);
    };

    if (!visible) return null;

    const currentChallenge = challenges[currentChallengeIdx];
    const progress = challenges.length > 0
        ? (challenges.filter(c => c.completed).length / challenges.length) * 100
        : 0;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: 'var(--color-surface, #1a1a2e)',
                borderRadius: 24,
                width: '100%', maxWidth: 480,
                overflow: 'hidden',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.08)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div>
                        <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 700 }}>
                            🔐 {t('liveness.title', 'Xác minh Liveness')}
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', margin: '4px 0 0', fontSize: 13 }}>
                            {t('liveness.subtitle', 'Hoàn thành thử thách để xác nhận danh tính')}
                        </p>
                    </div>
                    <button
                        onClick={() => { cleanup(); onCancel(); }}
                        style={{
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: '#fff', width: 36, height: 36, borderRadius: '50%',
                            cursor: 'pointer', fontSize: 18, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >×</button>
                </div>

                {/* Camera View */}
                <div style={{
                    position: 'relative', width: '100%', aspectRatio: '4/3',
                    background: '#000', overflow: 'hidden',
                }}>
                    <video
                        ref={videoRef}
                        autoPlay playsInline muted
                        style={{
                            width: '100%', height: '100%', objectFit: 'cover',
                            transform: 'scaleX(-1)',
                            display: phase === 'loading' || phase === 'checking_device' ? 'none' : 'block',
                        }}
                    />

                    {/* Loading overlay */}
                    {(phase === 'loading' || phase === 'checking_device') && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            color: '#fff',
                        }}>
                            <div style={{
                                width: 48, height: 48,
                                border: '3px solid rgba(255,255,255,0.2)',
                                borderTopColor: '#3b82f6',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                            <p style={{ marginTop: 16, fontSize: 14 }}>{statusText}</p>
                        </div>
                    )}

                    {/* Challenge instruction overlay */}
                    {phase === 'challenge' && currentChallenge && (
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                            padding: '40px 24px 20px',
                            textAlign: 'center',
                        }}>
                            <p style={{
                                color: '#fff', fontSize: 20, fontWeight: 700,
                                margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                            }}>
                                {t(currentChallenge.instruction, currentChallenge.instructionDefault)}
                            </p>
                        </div>
                    )}

                    {/* Timer ring */}
                    {phase === 'challenge' && (
                        <div style={{
                            position: 'absolute', top: 16, right: 16,
                            width: 52, height: 52,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{
                                color: remainingTime < 3000 ? '#ef4444' : '#fff',
                                fontSize: 16, fontWeight: 700,
                            }}>
                                {Math.ceil(remainingTime / 1000)}s
                            </span>
                        </div>
                    )}

                    {/* Success overlay */}
                    {phase === 'done' && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(34,197,94,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{ fontSize: 64 }}>✅</span>
                        </div>
                    )}

                    {/* Capturing overlay */}
                    {phase === 'capturing' && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(59,130,246,0.3)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            color: '#fff',
                        }}>
                            <div style={{
                                width: 40, height: 40,
                                border: '3px solid rgba(255,255,255,0.3)',
                                borderTopColor: '#fff',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                            <p style={{ marginTop: 12, fontSize: 14 }}>
                                {t('liveness.capturing', 'Đang xác minh khuôn mặt...')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Progress & Info */}
                <div style={{ padding: '16px 24px 20px' }}>
                    {/* Progress bar */}
                    <div style={{
                        height: 6, borderRadius: 3,
                        background: 'rgba(255,255,255,0.1)',
                        overflow: 'hidden', marginBottom: 12,
                    }}>
                        <div style={{
                            height: '100%', borderRadius: 3,
                            background: phase === 'failed' ? '#ef4444' : 'linear-gradient(90deg, #3b82f6, #22c55e)',
                            width: `${progress}%`,
                            transition: 'width 0.5s ease',
                        }} />
                    </div>

                    {/* Challenge status dots */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                        {challenges.map((c, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '4px 12px', borderRadius: 20,
                                background: c.completed
                                    ? 'rgba(34,197,94,0.15)'
                                    : i === currentChallengeIdx && phase === 'challenge'
                                        ? 'rgba(59,130,246,0.15)'
                                        : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${c.completed
                                    ? 'rgba(34,197,94,0.3)'
                                    : i === currentChallengeIdx && phase === 'challenge'
                                        ? 'rgba(59,130,246,0.3)'
                                        : 'rgba(255,255,255,0.1)'}`,
                            }}>
                                <span style={{ fontSize: 14 }}>
                                    {c.completed ? '✅' : i === currentChallengeIdx && phase === 'challenge' ? '🔵' : '⚪'}
                                </span>
                                <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: c.completed ? '#22c55e' : 'var(--color-text-muted, #94a3b8)',
                                }}>
                                    {t(c.instruction, c.instructionDefault).replace(/^[^\s]+\s/, '')}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Failed state */}
                    {phase === 'failed' && (
                        <div style={{
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 12, padding: '12px 16px',
                            textAlign: 'center',
                        }}>
                            {blockedDevice ? (
                                <p style={{ color: '#ef4444', margin: 0, fontSize: 14, fontWeight: 600 }}>
                                    🚫 {t('liveness.virtual_camera_blocked', {
                                        device: blockedDevice,
                                        defaultValue: `Phát hiện camera ảo: "${blockedDevice}". Vui lòng tắt phần mềm và thử lại.`
                                    })}
                                </p>
                            ) : (
                                <p style={{ color: '#ef4444', margin: 0, fontSize: 14, fontWeight: 600 }}>
                                    ⏱️ {t('liveness.timeout', 'Hết thời gian! Vui lòng thử lại.')}
                                </p>
                            )}
                            <button
                                onClick={() => { cleanup(); startFlow(); }}
                                style={{
                                    marginTop: 12, padding: '8px 24px',
                                    background: '#ef4444', color: '#fff',
                                    border: 'none', borderRadius: 8,
                                    fontWeight: 600, cursor: 'pointer',
                                    fontSize: 13,
                                }}
                            >
                                {t('liveness.retry', 'Thử lại')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* CSS for spinner animation */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
