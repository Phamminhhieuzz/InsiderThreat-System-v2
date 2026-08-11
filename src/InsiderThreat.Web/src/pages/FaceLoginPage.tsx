import { useEffect, useRef, useState } from 'react';
import { Button, Spin, Card, Alert } from 'antd';
import { ArrowLeftOutlined, CameraOutlined, LoadingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as faceapi from '@vladmandic/face-api';
import { loadFaceApiModels, getFaceDetectorOptions, ensureRecognitionReady } from '../services/faceApi';
import { api } from '../services/api';
import { authService } from '../services/auth';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import type { LoginResponse } from '../types';

type Phase = 'loading_model' | 'ready' | 'scanning' | 'comparing' | 'success' | 'error';

function FaceLoginPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [phase, setPhase] = useState<Phase>('loading_model');
    const [error, setError] = useState<string | null>(null);
    const [statusText, setStatusText] = useState('Đang tải mô hình AI...');

    useEffect(() => {
        init();
        return () => stopCamera();
    }, []);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    };

    const init = async () => {
        try {
            setStatusText('Đang tải mô hình AI...');
            await loadFaceApiModels();
            await startCamera();
        } catch (err) {
            console.error('[FaceLogin] Init error:', err);
            setPhase('error');
            setError('Không thể tải mô hình AI. Kiểm tra kết nối mạng và thử lại.');
        }
    };

    const startCamera = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 }
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase('ready');
        setStatusText('Nhìn thẳng vào camera và nhấn "Đăng nhập"');
    };

    const handleLogin = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        setError(null);
        setPhase('scanning');
        setStatusText('Đang quét khuôn mặt...');

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        const ctx = canvas.getContext('2d')!;
        // Vẽ mirror
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        try {
            await ensureRecognitionReady();
            const fApi = faceapi;

            const detection = await fApi
                .detectSingleFace(canvas, getFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                setPhase('ready');
                setError('Không phát hiện khuôn mặt. Hãy nhìn thẳng vào camera và thử lại.');
                return;
            }

            if (detection.detection.box.width < 100) {
                setPhase('ready');
                setError('Khuôn mặt quá nhỏ. Tiến lại gần camera hơn.');
                return;
            }

            setPhase('comparing');
            setStatusText('Đang so sánh khuôn mặt với dữ liệu đăng ký...');

            const descriptor = Array.from(detection.descriptor) as number[];
            const response = await api.post<LoginResponse>('/api/auth/face-login', {
                descriptor,
                timestamp: Date.now(),
                machineId: localStorage.getItem('machine_id') || 'web_client'
            });

            if (response.token) {
                authService.setSession(response.user, response.token);
                setPhase('success');
                setStatusText('Đăng nhập thành công!');
                setTimeout(() => navigate('/workspace'), 1200);
            } else {
                setPhase('ready');
                setError('Khuôn mặt không khớp với dữ liệu đăng ký.');
            }
        } catch (err: any) {
            console.error('[FaceLogin] Error:', err);
            setPhase('ready');
            const msg = err?.response?.data?.message ?? err?.message ?? 'Lỗi đăng nhập';
            setError(msg);
        }
    };

    const retry = () => {
        setError(null);
        setPhase('loading_model');
        init();
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
            <div style={{ position: 'fixed', top: 20, right: 20, display: 'flex', gap: 12 }}>
                <LanguageToggle /><ThemeToggle />
            </div>

            <Card style={{ maxWidth: 460, width: '100%', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ fontSize: 52, marginBottom: 12 }}>
                        {phase === 'success' ? '✅' : phase === 'error' ? '⚠️' : '🔐'}
                    </div>
                    <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>
                        {phase === 'success' ? 'Đăng nhập thành công!' : 'Đăng nhập bằng khuôn mặt'}
                    </h2>
                    <p style={{ margin: 0, color: '#666', fontSize: 13 }}>{statusText}</p>
                </div>

                {/* Error */}
                {error && (
                    <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
                )}

                {/* Camera */}
                {phase !== 'error' && (
                    <div style={{
                        position: 'relative', width: '100%', aspectRatio: '4/3',
                        background: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 16,
                        border: phase === 'success' ? '3px solid #52c41a'
                            : phase === 'comparing' ? '3px solid #1890ff'
                                : '3px solid #d9d9d9'
                    }}>
                        {/* Camera feed */}
                        <video ref={videoRef} autoPlay playsInline muted style={{
                            width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
                            display: (phase === 'ready' || phase === 'scanning') ? 'block' : 'none'
                        }} />

                        {/* Scanning overlay */}
                        {phase === 'scanning' && (
                            <div style={{
                                position: 'absolute', inset: 0, background: 'rgba(250,173,20,0.25)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <LoadingOutlined style={{ fontSize: 48 }} spin />
                                <div style={{ marginTop: 12, fontWeight: 600 }}>Đang quét khuôn mặt...</div>
                            </div>
                        )}

                        {/* Comparing overlay */}
                        {phase === 'comparing' && (
                            <div style={{
                                position: 'absolute', inset: 0, background: 'rgba(24,144,255,0.35)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <Spin size="large" />
                                <div style={{ marginTop: 12, fontWeight: 600 }}>Đang so sánh dữ liệu...</div>
                            </div>
                        )}

                        {/* Loading model */}
                        {phase === 'loading_model' && (
                            <div style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <LoadingOutlined style={{ fontSize: 40 }} spin />
                                <div style={{ marginTop: 12 }}>Đang tải mô hình AI...</div>
                            </div>
                        )}

                        {/* Success */}
                        {phase === 'success' && (
                            <div style={{
                                position: 'absolute', inset: 0, background: 'rgba(82,196,26,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72
                            }}>✅</div>
                        )}
                    </div>
                )}

                {/* Hidden canvas */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* Buttons */}
                {phase === 'ready' && (
                    <Button type="primary" size="large" icon={<CameraOutlined />}
                        onClick={handleLogin} block>
                        Đăng nhập bằng khuôn mặt
                    </Button>
                )}

                {phase === 'error' && (
                    <Button type="primary" size="large" onClick={retry} block>
                        Thử lại
                    </Button>
                )}

                {/* Info */}
                {phase === 'ready' && (
                    <p style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 12 }}>
                        Khuôn mặt sẽ được so sánh với ảnh đã đăng ký tại admin
                    </p>
                )}
            </Card>
        </div>
    );
}

export default FaceLoginPage;
