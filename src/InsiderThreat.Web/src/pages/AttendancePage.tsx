import { useState, useEffect, useRef, useCallback } from 'react';
import { Table, Tag, message, Typography, Card, Input, Button, Space, Alert, Select, Tooltip, Modal, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { ClockCircleOutlined, ScanOutlined, UserOutlined, SettingOutlined, SaveOutlined, CameraOutlined, LoadingOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import { authService } from '../services/auth';
import { attendanceService } from '../services/attendanceService';
import { generateNonce } from '../services/deviceValidator';
import { loadFaceApiModels, getFaceDetectorOptions, ensureRecognitionReady } from '../services/faceApi';
import * as faceapi from '@vladmandic/face-api';
import type { ActiveNetwork } from '../services/attendanceService';
import type { AttendanceLog } from '../types';
import type { ColumnsType } from 'antd/es/table';
import './AttendancePage.css';


const { Title } = Typography;

type ScanPhase = 'loading_model' | 'ready' | 'scanning' | 'comparing' | 'success' | 'error';

function AttendancePage() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<AttendanceLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [showScan, setShowScan] = useState(false);

    // Face scan state
    const [scanPhase, setScanPhase] = useState<ScanPhase>('loading_model');
    const [scanError, setScanError] = useState<string | null>(null);
    const [scanStatus, setScanStatus] = useState('Đang tải mô hình AI...');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const user = authService.getCurrentUser();
    const isAdmin = user?.role === 'Admin';
    const [allowedIPs, setAllowedIPs] = useState('');
    const [savingConfig, setSavingConfig] = useState(false);
    const [activeNetworks, setActiveNetworks] = useState<ActiveNetwork[]>([]);
    const [loadingNetworks, setLoadingNetworks] = useState(false);

    useEffect(() => {
        fetchHistory();
        if (isAdmin) fetchConfig();
    }, [isAdmin]);

    const fetchConfig = async () => {
        try {
            const config = await attendanceService.getConfig();
            setAllowedIPs(config.allowedIPs || '');
            setLoadingNetworks(true);
            const networks = await attendanceService.getActiveNetworks();
            setActiveNetworks(networks);
        } catch (error) {
            console.error('Failed to load attendance config', error);
        } finally {
            setLoadingNetworks(false);
        }
    };

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            await attendanceService.updateConfig({ allowedIPs });
            message.success(t('attendance.save_config_success', 'Đã lưu cấu hình mạng thành công!'));
        } catch {
            message.error(t('attendance.save_config_fail', 'Không thể lưu cấu hình mạng'));
        } finally {
            setSavingConfig(false);
        }
    };

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await api.get<AttendanceLog[]>('/api/attendance/history');
            setLogs(data);
        } catch {
            message.error(t('attendance.fetch_history_fail', 'Không thể tải lịch sử chấm công'));
        } finally {
            setLoading(false);
        }
    };

    // ===== Face scan modal logic =====
    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }, []);

    const startScan = async () => {
        setShowScan(true);
        setScanPhase('loading_model');
        setScanError(null);
        setScanStatus('Đang tải mô hình AI...');
        try {
            await loadFaceApiModels();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 }
            });
            streamRef.current = stream;
            // Đợi modal render xong rồi gắn stream
            setTimeout(() => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            }, 100);
            setScanPhase('ready');
            setScanStatus('Nhìn thẳng vào camera và nhấn "Chấm công"');
        } catch (err: any) {
            setScanPhase('error');
            setScanError(err?.message ?? 'Không thể khởi động camera');
        }
    };

    const handleScan = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        setScanError(null);
        setScanPhase('scanning');
        setScanStatus('Đang quét khuôn mặt...');

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        try {
            await ensureRecognitionReady();
            const detection = await faceapi
                .detectSingleFace(canvas, getFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                setScanPhase('ready');
                setScanError('Không phát hiện khuôn mặt. Hãy nhìn thẳng vào camera và thử lại.');
                return;
            }
            if (detection.detection.box.width < 100) {
                setScanPhase('ready');
                setScanError('Khuôn mặt quá nhỏ. Tiến lại gần camera hơn.');
                return;
            }

            setScanPhase('comparing');
            setScanStatus('Đang xác thực khuôn mặt...');

            const descriptor = Array.from(detection.descriptor) as number[];
            const nonce = generateNonce();
            const result = await attendanceService.faceCheckIn(descriptor, nonce, false);

            setScanPhase('success');
            setScanStatus('Chấm công thành công!');
            message.success(`✅ Chấm công thành công! Độ khớp: ${((1 - result.matchConfidence) * 100).toFixed(1)}%`);

            setTimeout(() => {
                closeScan();
                fetchHistory();
            }, 1500);
        } catch (err: any) {
            setScanPhase('ready');
            const msg = err?.response?.data?.message ?? err?.message ?? 'Chấm công thất bại';
            setScanError(`🚫 ${msg}`);
        }
    };

    const closeScan = () => {
        stopCamera();
        setShowScan(false);
        setScanPhase('loading_model');
        setScanError(null);
    };

    const columns: ColumnsType<AttendanceLog> = [
        {
            title: t('attendance.col_user', 'User'),
            dataIndex: 'userName',
            key: 'userName',
            render: (text) => <span><UserOutlined style={{ marginRight: 8 }} />{text}</span>,
        },
        {
            title: t('attendance.col_check_in_time', 'Check-In Time'),
            dataIndex: 'checkInTime',
            key: 'checkInTime',
            render: (time) => (
                <span>
                    <ClockCircleOutlined style={{ marginRight: 8, color: 'var(--color-primary)' }} />
                    {new Date(time).toLocaleString('vi-VN')}
                </span>
            ),
        },
        {
            title: t('attendance.col_method', 'Method'),
            dataIndex: 'method',
            key: 'method',
            render: (method) => {
                const color = method === 'FaceID' ? 'green' : method === 'Password' ? 'orange' : 'geekblue';
                return <Tag color={color} icon={<ScanOutlined />}>{method}</Tag>;
            },
        },
        {
            title: t('attendance.col_confidence', 'Confidence'),
            dataIndex: 'matchConfidence',
            key: 'matchConfidence',
            render: (confidence) => {
                if (!confidence && confidence !== 0) return <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>—</span>;
                const pct = ((1 - confidence) * 100).toFixed(1);
                const color = confidence < 0.3 ? '#22c55e' : confidence < 0.45 ? '#eab308' : '#ef4444';
                return <span style={{ fontWeight: 600, color }}>{pct}%</span>;
            },
        },
    ];

    const borderColor = scanPhase === 'success' ? '#52c41a' : scanPhase === 'comparing' ? '#1890ff' : '#d9d9d9';

    return (
        <div style={{ padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <Title level={2} style={{ margin: 0 }}>{t('attendance.title', '📅 Lịch sử Chấm công')}</Title>
                <Button
                    type="primary"
                    size="large"
                    icon={<ScanOutlined />}
                    onClick={startScan}
                    style={{
                        background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                        borderColor: 'transparent',
                        borderRadius: 12,
                        height: 48,
                        paddingInline: 28,
                        fontWeight: 700,
                        fontSize: 15,
                        boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
                    }}
                >
                    {t('attendance.face_checkin', '🔐 Chấm công Face ID')}
                </Button>
            </div>

            {isAdmin && (
                <Card
                    title={<><SettingOutlined /> {t('attendance.config_title', 'Cấu hình Mạng WiFi (IP) Chấm công')}</>}
                    style={{ marginBottom: 24 }}
                    size="small"
                >
                    <Alert
                        description={t('attendance.config_alert_desc', 'Chọn mạng từ danh sách hoặc nhập thủ công dải IP cho phép chấm công.')}
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    <div className="attendance-config-container">
                        <div className="config-row">
                            <span className="config-label">{t('attendance.lbl_active_network', 'Mạng đang hoạt động:')}</span>
                            <Select
                                className="config-select"
                                placeholder={t('attendance.placeholder_network', 'Chọn mạng để tự động điền dải IP')}
                                loading={loadingNetworks}
                                onChange={(value: string) => setAllowedIPs(value)}
                                options={activeNetworks.map(n => ({ label: `${n.name} (IP: ${n.ipAddress})`, value: n.prefix }))}
                            />
                        </div>
                        <div className="config-row align-top">
                            <span className="config-label">{t('attendance.lbl_allowed_ips', 'Dải IP cho phép:')}</span>
                            <div className="config-input-group">
                                <Input
                                    className="config-input"
                                    placeholder={t('attendance.placeholder_ips', 'Ví dụ: 192.168.1., 10.0.0.5')}
                                    value={allowedIPs}
                                    onChange={(e) => setAllowedIPs(e.target.value)}
                                />
                                <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveConfig} loading={savingConfig} className="config-btn">
                                    {t('attendance.btn_save', 'Lưu cấu hình')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            <Table
                columns={columns}
                dataSource={logs}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 'max-content' }}
            />

            {/* Face Scan Modal */}
            <Modal
                open={showScan}
                onCancel={closeScan}
                footer={null}
                title={<><ScanOutlined style={{ marginRight: 8 }} />Chấm công Face ID</>}
                width={480}
                destroyOnClose
            >
                <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#666', marginBottom: 16 }}>{scanStatus}</p>

                    {scanError && <Alert type="error" showIcon message={scanError} style={{ marginBottom: 12 }} />}

                    {/* Camera */}
                    {scanPhase !== 'error' && (
                        <div style={{
                            position: 'relative', width: '100%', aspectRatio: '4/3',
                            background: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 16,
                            border: `3px solid ${borderColor}`
                        }}>
                            <video ref={videoRef} autoPlay playsInline muted style={{
                                width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
                                display: (scanPhase === 'ready' || scanPhase === 'scanning') ? 'block' : 'none'
                            }} />
                            {scanPhase === 'loading_model' && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <LoadingOutlined style={{ fontSize: 40 }} spin />
                                    <div style={{ marginTop: 12 }}>Đang tải mô hình AI...</div>
                                </div>
                            )}
                            {scanPhase === 'scanning' && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(250,173,20,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <LoadingOutlined style={{ fontSize: 48 }} spin />
                                    <div style={{ marginTop: 12, fontWeight: 600 }}>Đang quét khuôn mặt...</div>
                                </div>
                            )}
                            {scanPhase === 'comparing' && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(24,144,255,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <Spin size="large" />
                                    <div style={{ marginTop: 12, fontWeight: 600 }}>Đang xác thực...</div>
                                </div>
                            )}
                            {scanPhase === 'success' && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(82,196,26,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72 }}>✅</div>
                            )}
                        </div>
                    )}

                    <canvas ref={canvasRef} style={{ display: 'none' }} />

                    <Space>
                        {scanPhase === 'ready' && (
                            <Button type="primary" size="large" icon={<CameraOutlined />} onClick={handleScan} block>
                                Chấm công
                            </Button>
                        )}
                        {scanPhase === 'error' && (
                            <Button type="primary" size="large" onClick={startScan}>Thử lại</Button>
                        )}
                        <Button size="large" onClick={closeScan}>Đóng</Button>
                    </Space>
                </div>
            </Modal>
        </div>
    );
}

export default AttendancePage;
