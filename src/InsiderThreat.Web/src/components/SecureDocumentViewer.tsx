import React, { useRef } from 'react';
import { Spin, Alert, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { usePhoneDetector } from '../hooks/usePhoneDetector';
import { useScreenCaptureGuard } from '../hooks/useScreenCaptureGuard';
import { VideoCameraOutlined, WarningOutlined } from '@ant-design/icons';
import DynamicWatermark from './watermark/DynamicWatermark';
import './SecureDocumentViewer.css';

const { Title, Text } = Typography;

interface SecureDocumentViewerProps {
    children: React.ReactNode;
    documentName?: string;
    requireCamera?: boolean;
    requireWatermark?: boolean;
}

export default function SecureDocumentViewer({ 
    children, 
    documentName = "Tài liệu không xác định",
    requireCamera = true,
    requireWatermark = true
}: SecureDocumentViewerProps) {
    const { t } = useTranslation();
    const { isPhoneDetected, isLoadingAI, cameraError, cameraGranted } = usePhoneDetector(requireCamera);
    const lastLoggedAtRef = useRef(0);

    // Lấy thông tin user hiện tại
    const user = React.useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch {
            return {};
        }
    }, []);

    // Effect để bật thông báo Toast
    React.useEffect(() => {
        if (requireCamera && !isLoadingAI && cameraGranted && !cameraError) {
            message.success(t('security.ai_started_success', 'Hệ thống Mắt thần AI đã kích hoạt thành công, tài liệu được bảo vệ.'));
        }
    }, [requireCamera, isLoadingAI, cameraGranted, cameraError, t]);

    // Ghi log bảo mật. Trước đây chỉ ghi đúng một lần mỗi phiên nên hành vi lặp
    // lại nhiều lần không để lại dấu vết; nay ghi lại mỗi lần, chỉ gộp các lần
    // cách nhau dưới 10 giây để tránh dồn hàng loạt bản ghi giống hệt nhau.
    const logSecurityEvent = React.useCallback((actionTaken: string) => {
        const now = Date.now();
        if (now - lastLoggedAtRef.current < 10000) return;
        lastLoggedAtRef.current = now;

        api.post('/api/logs', {
            logType: 'FileAccess',
            severity: 'High',
            message: documentName,
            computerName: user.username || user.fullName || 'Unknown User',
            actionTaken
        }).catch(err => console.error("Không thể ghi log bảo mật:", err));
    }, [documentName, user]);

    // Phát hiện dấu hiệu chụp màn hình: che tài liệu ngay và ghi lại nguyên nhân.
    const { isCaptureRisk, lastReasonLabel } = useScreenCaptureGuard(
        true,
        React.useCallback((_reason: string, label: string) => {
            message.warning(t('security.toast_capture_detected', 'Phát hiện hành vi chụp màn hình: ') + label);
            logSecurityEvent(`Nghi chụp màn hình — ${label}`);
        }, [logSecurityEvent, t])
    );

    React.useEffect(() => {
        if (isPhoneDetected) {
            message.warning(t('security.toast_phone_detected', 'Phát hiện thiết bị ghi hình khả nghi!'));
            logSecurityEvent('Cảnh báo Camera');
        }
    }, [isPhoneDetected, logSecurityEvent, t]);

    const isProtecting = isPhoneDetected || isCaptureRisk || isLoadingAI || !cameraGranted;

    // 1. Lỗi Camera
    if (cameraError) {
        return (
            <div className="secure-viewer-container flex-center">
                <Alert
                    message={t('security.camera_required', 'Yêu cầu Camera')}
                    description={cameraError}
                    type="error"
                    showIcon
                    icon={<VideoCameraOutlined />}
                />
            </div>
        );
    }

    // 2. Render nội dung chính với lớp bảo vệ toàn diện
    return (
        <div className="secure-viewer-container relative">
            {/* Lớp hiển thị nội dung: Render NGAY LẬP TỨC để tiết kiệm thời gian, nhưng Làm mờ nếu AI chưa sẵn sàng hoặc phát hiện điện thoại */}
            <div className={`secure-content ${isProtecting ? 'is-blurred' : ''}`}>
                {children}
            </div>

            {/* Lớp lưới bảo vệ bản quyền: Luôn hiển thị đè lên tài liệu nếu được yêu cầu */}
            {requireWatermark && <DynamicWatermark />}

            {/* Màn hình loading khi AI đang tải... */}
            {(isLoadingAI || !cameraGranted) && (
                <div className="secure-overlay flex-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
                    <div style={{ textAlign: 'center' }}>
                        <Spin size="large" />
                        <Title level={4} style={{ color: '#fff', marginTop: 16 }}>
                            {t('security.loading_ai', 'Đang thiết lập lớp khiên AI...')}
                        </Title>
                    </div>
                </div>
            )}

            {/* Màn hình cảnh báo đỏ rực: thiết bị ghi hình hoặc hành vi chụp màn hình */}
            {(isPhoneDetected || isCaptureRisk) && !isLoadingAI && (
                <div className="secure-overlay flex-center">
                    <div className="warning-box">
                        <WarningOutlined className="warning-icon" />
                        <Title level={3} style={{ color: '#ff4d4f', marginTop: 16 }}>
                            {t('security.phone_detected_title', 'CẢNH BÁO BẢO MẬT')}
                        </Title>
                        <Text type="danger" style={{ fontSize: '1.2rem' }}>
                            {isPhoneDetected
                                ? t('security.phone_detected_desc', 'Phát hiện thiết bị ghi hình! Vui lòng cất thiết bị để tiếp tục xem tài liệu.')
                                : lastReasonLabel || t('security.capture_detected_desc', 'Phát hiện hành vi chụp màn hình.')}
                        </Text>
                    </div>
                </div>
            )}
            
            {/* Camera Indicator */}
            {requireCamera && cameraGranted && (
                <div className="camera-indicator">
                    <VideoCameraOutlined /> <span style={{ marginLeft: 4, fontSize: 12 }}>AI Scanning Active</span>
                </div>
            )}
        </div>
    );
}
