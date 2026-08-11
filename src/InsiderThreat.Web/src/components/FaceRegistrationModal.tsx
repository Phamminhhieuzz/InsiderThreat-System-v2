import { useRef, useEffect, useState, useCallback } from 'react';
import { Modal, Button, Space, Alert, Progress } from 'antd';
import { CameraOutlined, SafetyCertificateOutlined, CheckCircleFilled, LoadingOutlined } from '@ant-design/icons';
import * as faceapi from '@vladmandic/face-api';
import { loadFaceApiModels, getFaceDetectorOptions, ensureRecognitionReady } from '../services/faceApi';
import { api } from '../services/api';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';

interface FaceRegistrationModalProps {
    visible: boolean;
    onCancel: () => void;
    userId: string | null;
    userName: string;
}

type Phase = 'loading_model' | 'already_registered' | 'ready' | 'capturing' | 'saving' | 'done' | 'error';

function FaceRegistrationModal({ visible, onCancel, userId, userName }: FaceRegistrationModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [phase, setPhase] = useState<Phase>('loading_model');
    const [statusText, setStatusText] = useState('');
    const [progress, setProgress] = useState(0);
    const { t } = useTranslation();

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    const startCamera = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 }
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
    }, []);

    useEffect(() => {
        if (!visible) {
            stopCamera();
            setPhase('loading_model');
            setProgress(0);
            return;
        }

        const init = async () => {
            try {
                setPhase('loading_model');
                setStatusText('Đang kiểm tra...');
                setProgress(10);

                // Kiểm tra xem user đã đăng ký khuôn mặt chưa
                const currentUser = authService.getCurrentUser();
                if (currentUser?.faceEmbeddings && currentUser.faceEmbeddings.length > 0) {
                    setPhase('already_registered');
                    setStatusText('Tài khoản này đã đăng ký khuôn mặt rồi.');
                    return;
                }

                setStatusText('Đang tải mô hình AI...');
                setProgress(20);
                await loadFaceApiModels();
                setProgress(60);
                setStatusText('Đang khởi động camera...');
                await startCamera();
                setProgress(100);
                setPhase('ready');
                setStatusText('Nhìn thẳng vào camera và nhấn "Chụp & Đăng ký"');
            } catch (err) {
                console.error('[FaceReg] Init error:', err);
                setPhase('error');
                setStatusText('Lỗi khởi tạo. Kiểm tra camera và kết nối mạng.');
            }
        };

        init();
        return () => stopCamera();
    }, [visible, startCamera, stopCamera]);

    const captureAndSave = async () => {
        if (!videoRef.current || !canvasRef.current || !userId) return;

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

        setPhase('capturing');
        setStatusText('Đang phát hiện khuôn mặt...');

        try {
            const fApi = (faceapi as any).default || faceapi;
            const options = getFaceDetectorOptions();
            await ensureRecognitionReady();

            const detection = await fApi
                .detectSingleFace(canvas, options)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                setPhase('ready');
                setStatusText('Không phát hiện khuôn mặt. Hãy nhìn thẳng vào camera và thử lại.');
                return;
            }

            if (detection.detection.box.width < 100) {
                setPhase('ready');
                setStatusText('Khuôn mặt quá nhỏ. Tiến lại gần camera hơn.');
                return;
            }

            setPhase('saving');
            setStatusText('Đang lưu dữ liệu khuôn mặt...');

            const descriptor = Array.from(detection.descriptor) as number[];

            // Upload ảnh
            const blob = await new Promise<Blob>(resolve =>
                canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92)
            );
            const formData = new FormData();
            formData.append('file', new File([blob], `face_${userId}_${Date.now()}.jpg`, { type: 'image/jpeg' }));
            const { url: faceImageUrl } = await api.postForm<{ url: string }>('/api/upload', formData);

            // Lưu descriptor + ảnh vào user
            await api.put(`/api/users/${userId}/face-embeddings`, descriptor);

            // Sync session nếu là user hiện tại
            const currentUser = authService.getCurrentUser();
            if (currentUser?.id === userId) {
                authService.dispatchUserUpdate({ ...currentUser, faceEmbeddings: descriptor, faceImageUrl });
            }

            setPhase('done');
            setStatusText('Đăng ký khuôn mặt thành công!');
            setTimeout(handleClose, 1800);
        } catch (err: any) {
            console.error('[FaceReg] Capture error:', err);
            setPhase('ready');
            setStatusText('Lỗi khi xử lý. Vui lòng thử lại.');
        }
    };

    const handleClose = () => {
        stopCamera();
        onCancel();
    };

    const borderColor = phase === 'done' ? '#52c41a' : phase === 'saving' || phase === 'capturing' ? '#1890ff' : '#f0f0f0';

    return (
        <Modal
            title={<Space><SafetyCertificateOutlined style={{ color: '#1890ff' }} />{t('face.register_title', 'Đăng ký Face ID')}</Space>}
            open={visible}
            onCancel={handleClose}
            footer={[
                <Button key="cancel" onClick={handleClose} disabled={phase === 'capturing' || phase === 'saving'}>
                    {phase === 'done' ? 'Đóng' : t('common.cancel', 'Hủy')}
                </Button>,
                phase === 'ready' && (
                    <Button key="capture" type="primary" icon={<CameraOutlined />} onClick={captureAndSave}>
                        Chụp & Đăng ký
                    </Button>
                ),
                phase === 'error' && (
                    <Button key="retry" type="primary" onClick={() => { setPhase('loading_model'); }}>
                        Thử lại
                    </Button>
                ),
            ]}
            width={500}
            destroyOnHidden
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Alert
                    type="info" showIcon
                    title="Hướng dẫn"
                    description="Nhìn thẳng vào camera, đảm bảo đủ ánh sáng. Hệ thống sẽ nhận diện khuôn mặt và lưu vào database."
                />

                {/* Camera */}
                <div style={{
                    width: '100%', height: 300, background: '#000',
                    borderRadius: 12, overflow: 'hidden', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `3px solid ${borderColor}`
                }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{
                        width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
                        display: phase === 'ready' ? 'block' : 'none'
                    }} />

                    {phase === 'already_registered' && (
                        <div style={{ color: '#fff', textAlign: 'center', padding: 24 }}>
                            <CheckCircleFilled style={{ fontSize: 48, color: '#faad14' }} />
                            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>Khuôn mặt đã được đăng ký</div>
                            <div style={{ marginTop: 6, color: '#aaa', fontSize: 13 }}>Mỗi tài khoản chỉ được đăng ký 1 khuôn mặt. Liên hệ admin để đặt lại.</div>
                        </div>
                    )}

                    {(phase === 'loading_model') && (
                        <div style={{ color: '#aaa', textAlign: 'center' }}>
                            <LoadingOutlined style={{ fontSize: 36 }} spin />
                            <div style={{ marginTop: 10 }}>Đang tải mô hình AI...</div>
                        </div>
                    )}

                    {(phase === 'capturing' || phase === 'saving') && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: phase === 'saving' ? 'rgba(24,144,255,0.35)' : 'rgba(250,173,20,0.25)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff'
                        }}>
                            <LoadingOutlined style={{ fontSize: 48 }} spin />
                            <div style={{ marginTop: 12, fontWeight: 600 }}>
                                {phase === 'capturing' ? 'Đang phát hiện khuôn mặt...' : 'Đang lưu lên server...'}
                            </div>
                        </div>
                    )}

                    {phase === 'done' && (
                        <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(82,196,26,0.4)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff'
                        }}>
                            <CheckCircleFilled style={{ fontSize: 64, marginBottom: 12 }} />
                            <div style={{ fontSize: 20, fontWeight: 700 }}>ĐĂNG KÝ THÀNH CÔNG</div>
                        </div>
                    )}

                    {phase === 'error' && (
                        <div style={{ color: '#ff4d4f', textAlign: 'center', padding: 20 }}>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
                            <div>{statusText}</div>
                        </div>
                    )}
                </div>

                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* Progress bar (chỉ khi loading) */}
                {phase === 'loading_model' && (
                    <Progress percent={progress} status="active" showInfo={false} />
                )}

                {/* Status text */}
                <div style={{
                    textAlign: 'center', fontSize: 13,
                    color: phase === 'done' ? '#52c41a' : phase === 'error' ? '#ff4d4f' : '#666'
                }}>
                    {statusText}
                </div>

                <div style={{ textAlign: 'center', fontSize: 12, color: '#999' }}>
                    Nhân viên: <strong>{userName}</strong> &nbsp;|&nbsp; ID:{' '}
                    <code style={{ background: '#f5f5f5', padding: '1px 6px', borderRadius: 4 }}>{userId}</code>
                </div>
            </div>
        </Modal>
    );
}

export default FaceRegistrationModal;
