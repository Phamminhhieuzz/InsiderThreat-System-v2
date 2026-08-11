import { useState, useEffect, useRef, useCallback } from 'react';
import { Table, Tag, Card, Row, Col, Statistic, Badge, Alert, Typography, Space, Button, Tooltip, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    SafetyOutlined, DesktopOutlined, ReloadOutlined,
    CheckCircleOutlined, CloseCircleOutlined, WarningOutlined,
    ClockCircleOutlined, SyncOutlined
} from '@ant-design/icons';
import * as signalR from '@microsoft/signalr';
import { api, API_BASE_URL } from '../services/api';
import type { ColumnsType } from 'antd/es/table';
import BottomNavigation from '../components/BottomNavigation';

const { Title, Text } = Typography;

interface WatchdogStatus {
    computerName: string;
    ipAddress: string;
    isOnline: boolean;
    statusText: string;
    restartCount: number;
    lastHeartbeat: string;
    lastRestartTime?: string;
    secondsSinceHeartbeat: number;
}

interface WatchdogAlert {
    computerName: string;
    ipAddress: string;
    message: string;
    timestamp: string;
    restartCount: number;
}

function WatchdogPage() {
    const { t } = useTranslation();
    const [statuses, setStatuses] = useState<WatchdogStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [alertModal, setAlertModal] = useState<WatchdogAlert | null>(null);
    const connectionRef = useRef<signalR.HubConnection | null>(null);

    const fetchStatuses = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get<WatchdogStatus[]>('/api/watchdog/status');
            setStatuses(data);
        } catch (err) {
            console.error('Failed to fetch watchdog statuses', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // SignalR real-time
    useEffect(() => {
        const token = localStorage.getItem('token');
        const connection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/system`, token ? { accessTokenFactory: () => token } : {})
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        connection.start()
            .then(() => {
                // Nhận heartbeat → cập nhật trạng thái real-time
                connection.on('WatchdogHeartbeat', (data: any) => {
                    setStatuses(prev => {
                        const idx = prev.findIndex(s => s.computerName === data.computerName);
                        const updated: WatchdogStatus = {
                            computerName: data.computerName,
                            ipAddress: data.ipAddress,
                            isOnline: true,
                            statusText: 'Online',
                            restartCount: prev[idx]?.restartCount ?? 0,
                            lastHeartbeat: data.timestamp,
                            lastRestartTime: prev[idx]?.lastRestartTime,
                            secondsSinceHeartbeat: 0,
                        };
                        if (idx >= 0) {
                            const next = [...prev];
                            next[idx] = updated;
                            return next;
                        }
                        return [updated, ...prev];
                    });
                });

                // Nhận cảnh báo Watchdog restart MonitorAgent
                connection.on('WatchdogAlert', (data: WatchdogAlert) => {
                    setAlertModal(data);
                    setStatuses(prev => {
                        const idx = prev.findIndex(s => s.computerName === data.computerName);
                        if (idx >= 0) {
                            const next = [...prev];
                            next[idx] = {
                                ...next[idx],
                                restartCount: data.restartCount,
                                lastRestartTime: data.timestamp,
                                lastHeartbeat: data.timestamp,
                                isOnline: true,
                                statusText: 'Online',
                                secondsSinceHeartbeat: 0,
                            };
                            return next;
                        }
                        return prev;
                    });
                });
            })
            .catch(err => console.error('SignalR error:', err));

        connectionRef.current = connection;

        return () => {
            connection.off('WatchdogHeartbeat');
            connection.off('WatchdogAlert');
            connection.stop();
        };
    }, []);

    // Fetch ban đầu + poll mỗi 30s để cập nhật secondsSinceHeartbeat
    useEffect(() => {
        fetchStatuses();
        const interval = setInterval(fetchStatuses, 30000);
        return () => clearInterval(interval);
    }, [fetchStatuses]);

    // Tính tổng
    const onlineCount = statuses.filter(s => s.isOnline).length;
    const offlineCount = statuses.filter(s => !s.isOnline).length;
    const totalRestarts = statuses.reduce((sum, s) => sum + s.restartCount, 0);

    const columns: ColumnsType<WatchdogStatus> = [
        {
            title: 'Máy tính',
            dataIndex: 'computerName',
            key: 'computerName',
            render: (name) => (
                <Space>
                    <DesktopOutlined style={{ color: 'var(--color-primary, #1890ff)' }} />
                    <Text strong>{name}</Text>
                </Space>
            ),
        },
        {
            title: 'IP Address',
            dataIndex: 'ipAddress',
            key: 'ipAddress',
            render: (ip) => <Text code>{ip}</Text>,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isOnline',
            key: 'isOnline',
            render: (isOnline) =>
                isOnline ? (
                    <Badge status="success" text={<Tag color="success" icon={<CheckCircleOutlined />}>Online</Tag>} />
                ) : (
                    <Badge status="error" text={<Tag color="error" icon={<CloseCircleOutlined />}>Offline</Tag>} />
                ),
            filters: [
                { text: 'Online', value: true },
                { text: 'Offline', value: false },
            ],
            onFilter: (value, record) => record.isOnline === value,
        },
        {
            title: 'Heartbeat gần nhất',
            dataIndex: 'lastHeartbeat',
            key: 'lastHeartbeat',
            render: (time, record) => (
                <Tooltip title={new Date(time).toLocaleString('vi-VN')}>
                    <Space>
                        <ClockCircleOutlined style={{ color: record.isOnline ? '#52c41a' : '#ff4d4f' }} />
                        <Text type={record.isOnline ? undefined : 'danger'}>
                            {record.secondsSinceHeartbeat < 60
                                ? `${record.secondsSinceHeartbeat}s trước`
                                : record.secondsSinceHeartbeat < 3600
                                    ? `${Math.floor(record.secondsSinceHeartbeat / 60)} phút trước`
                                    : new Date(time).toLocaleString('vi-VN')}
                        </Text>
                    </Space>
                </Tooltip>
            ),
            sorter: (a, b) => new Date(a.lastHeartbeat).getTime() - new Date(b.lastHeartbeat).getTime(),
        },
        {
            title: 'Số lần Restart Agent',
            dataIndex: 'restartCount',
            key: 'restartCount',
            render: (count) => (
                <Tag color={count === 0 ? 'default' : count < 3 ? 'warning' : 'error'} icon={<SyncOutlined />}>
                    {count} lần
                </Tag>
            ),
            sorter: (a, b) => a.restartCount - b.restartCount,
        },
        {
            title: 'Lần restart gần nhất',
            dataIndex: 'lastRestartTime',
            key: 'lastRestartTime',
            render: (time) =>
                time ? (
                    <Text type="warning">
                        <WarningOutlined style={{ marginRight: 6 }} />
                        {new Date(time).toLocaleString('vi-VN')}
                    </Text>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <Space>
                    <SafetyOutlined style={{ fontSize: 28, color: '#1890ff' }} />
                    <Title level={2} style={{ margin: 0 }}>🛡️ Watchdog Monitor</Title>
                </Space>
                <Button icon={<ReloadOutlined />} onClick={fetchStatuses} loading={loading}>
                    Làm mới
                </Button>
            </div>

            <Alert
                type="info"
                showIcon
                message="Watchdog tự động khởi động lại MonitorAgent nếu bị tắt. Heartbeat gửi mỗi 30 giây — máy không gửi trong 90 giây được coi là Offline."
                style={{ marginBottom: 24 }}
            />

            {/* Summary cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Tổng máy giám sát"
                            value={statuses.length}
                            prefix={<DesktopOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Watchdog Online"
                            value={onlineCount}
                            valueStyle={{ color: '#52c41a' }}
                            prefix={<CheckCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Watchdog Offline"
                            value={offlineCount}
                            valueStyle={{ color: offlineCount > 0 ? '#ff4d4f' : '#8c8c8c' }}
                            prefix={<CloseCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Tổng lần Restart Agent"
                            value={totalRestarts}
                            valueStyle={{ color: totalRestarts > 0 ? '#fa8c16' : '#8c8c8c' }}
                            prefix={<SyncOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Status table */}
            <Card title={<><SafetyOutlined /> Trạng thái Watchdog theo máy</>}>
                <Table
                    columns={columns}
                    dataSource={statuses}
                    rowKey="computerName"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'Chưa có Watchdog nào kết nối. Cài và chạy InsiderThreat.Watchdog trên máy nhân viên.' }}
                    rowClassName={(record) => record.isOnline ? '' : 'offline-row'}
                />
            </Card>

            {/* Modal cảnh báo khi MonitorAgent bị restart */}
            <Modal
                open={!!alertModal}
                onCancel={() => setAlertModal(null)}
                footer={[
                    <Button key="ok" type="primary" onClick={() => setAlertModal(null)}>
                        Đã xem
                    </Button>
                ]}
                title={
                    <Space>
                        <WarningOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                        <span style={{ color: '#ff4d4f' }}>🚨 Watchdog Cảnh báo — Agent bị tắt bất thường!</span>
                    </Space>
                }
                width={500}
            >
                {alertModal && (
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <div><Text strong>Máy tính:</Text> <Text code>{alertModal.computerName}</Text></div>
                        <div><Text strong>IP:</Text> <Text>{alertModal.ipAddress}</Text></div>
                        <div><Text strong>Thời gian:</Text> <Text>{new Date(alertModal.timestamp).toLocaleString('vi-VN')}</Text></div>
                        <div><Text strong>Số lần restart:</Text> <Tag color="warning">{alertModal.restartCount} lần</Tag></div>
                        <Alert type="error" message={alertModal.message} showIcon style={{ marginTop: 8 }} />
                    </Space>
                )}
            </Modal>

            <style>{`
                .offline-row td { opacity: 0.6; }
            `}</style>
            </div>    );
}

export default WatchdogPage;
