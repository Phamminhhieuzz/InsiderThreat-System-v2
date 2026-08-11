import { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Statistic, Button, Tooltip } from 'antd';
import {
    WarningOutlined, CameraOutlined, KeyOutlined,
    WifiOutlined, ReloadOutlined, EyeOutlined
} from '@ant-design/icons';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { monitorService, type MonitorSummary } from '../services/monitorService';

function MonitorSummaryCards() {
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';
    const [summary, setSummary] = useState<MonitorSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const fetchSummary = useCallback(async () => {
        setLoading(true);
        try {
            const data = await monitorService.getSummary();
            setSummary(data);
        } catch {
            // Nếu không có dữ liệu (agent chưa kết nối) thì bỏ qua
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSummary();
        const interval = setInterval(fetchSummary, 60000); // refresh mỗi phút
        return () => clearInterval(interval);
    }, [fetchSummary]);

    if (!summary && !loading) return null;

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-muted)' }}>
                    🖥️ Giám sát Hành vi Hôm nay
                </span>
                <Tooltip title="Xem chi tiết">
                    <Button
                        type="link"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => navigate('/monitor-logs')}
                        style={{ padding: 0 }}
                    >
                        Xem tất cả
                    </Button>
                </Tooltip>
                <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined spin={loading} />}
                    onClick={fetchSummary}
                    style={{ padding: '0 4px' }}
                />
            </div>
            <Row gutter={[8, 8]}>
                <Col xs={12} sm={8} md={4} lg={4}>
                    <Card size="small" hoverable onClick={() => navigate('/monitor-logs')} style={{ cursor: 'pointer' }}>
                        <Statistic
                            title="Tổng sự kiện"
                            value={summary?.totalToday ?? 0}
                            prefix={<WarningOutlined style={{ color: isDarkMode ? '#60a5fa' : '#1890ff' }} />}
                            valueStyle={{ fontSize: 18 }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={4} lg={4}>
                    <Card size="small" hoverable onClick={() => navigate('/monitor-logs?logType=KeywordDetected')} style={{ cursor: 'pointer' }}>
                        <Statistic
                            title="Từ khóa nguy hiểm"
                            value={summary?.keywordsToday ?? 0}
                            prefix={<KeyOutlined style={{ color: (summary?.keywordsToday ?? 0) > 0 ? '#fa8c16' : '#8c8c8c' }} />}
                            valueStyle={{ fontSize: 18, color: (summary?.keywordsToday ?? 0) > 0 ? '#fa8c16' : undefined }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={4} lg={4}>
                    <Card size="small" hoverable onClick={() => navigate('/monitor-logs?logType=Screenshot')} style={{ cursor: 'pointer' }}>
                        <Statistic
                            title="Chụp màn hình"
                            value={summary?.screenshotsToday ?? 0}
                            prefix={<CameraOutlined style={{ color: (summary?.screenshotsToday ?? 0) > 0 ? '#fa8c16' : '#8c8c8c' }} />}
                            valueStyle={{ fontSize: 18, color: (summary?.screenshotsToday ?? 0) > 0 ? '#fa8c16' : undefined }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={4} lg={4}>
                    <Card size="small" hoverable onClick={() => navigate('/monitor-logs?minSeverity=7')} style={{ cursor: 'pointer', borderColor: (summary?.criticalToday ?? 0) > 0 ? '#ff4d4f' : undefined }}>
                        <Statistic
                            title="Mức độ Critical"
                            value={summary?.criticalToday ?? 0}
                            prefix={<WarningOutlined style={{ color: (summary?.criticalToday ?? 0) > 0 ? '#cf1322' : '#8c8c8c' }} />}
                            valueStyle={{ fontSize: 18, color: (summary?.criticalToday ?? 0) > 0 ? '#cf1322' : undefined }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={4} lg={4}>
                    <Card size="small" hoverable onClick={() => navigate('/monitor-logs?logType=NetworkDisconnect')} style={{ cursor: 'pointer' }}>
                        <Statistic
                            title="Mất kết nối mạng"
                            value={summary?.disconnectsToday ?? 0}
                            prefix={<WifiOutlined style={{ color: (summary?.disconnectsToday ?? 0) > 0 ? '#fa8c16' : '#8c8c8c' }} />}
                            valueStyle={{ fontSize: 18, color: (summary?.disconnectsToday ?? 0) > 0 ? '#fa8c16' : undefined }}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
}

export default MonitorSummaryCards;
