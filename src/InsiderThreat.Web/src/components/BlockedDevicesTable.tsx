import { useState, useEffect, useRef } from 'react';
import { Table, Button, message, Tag, Space, Badge } from 'antd';
import { CheckOutlined, UsbOutlined, ReloadOutlined } from '@ant-design/icons';
import * as signalR from '@microsoft/signalr';
import { api, API_BASE_URL } from '../services/api';
import type { LogEntry, Device } from '../types';
import type { ColumnsType } from 'antd/es/table';

interface BlockedDevice {
    deviceId: string;
    deviceName: string;
    computerName: string;
    ipAddress: string;
    timestamp: string;
}

function BlockedDevicesTable() {
    const [loading, setLoading] = useState(false);
    const [devices, setDevices] = useState<BlockedDevice[]>([]);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const connectionRef = useRef<signalR.HubConnection | null>(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchBlockedDevices = async () => {
        setLoading(true);
        try {
            const [logs, whitelist] = await Promise.all([
                api.get<LogEntry[]>('/api/logs?limit=100'),
                api.get<Device[]>('/api/devices')
            ]);

            const allowedDeviceIds = new Set(whitelist.map(d => d.deviceId.toUpperCase()));

            const blockedLogs = logs
                .filter((log) => log.severity === 'Critical' && log.actionTaken === 'Blocked')
                .filter((log) => log.deviceId && log.deviceName)
                .filter((log) => {
                    if (!log.deviceId) return false;
                    return !allowedDeviceIds.has(log.deviceId.toUpperCase());
                });

            const uniqueDevices = new Map<string, BlockedDevice>();
            blockedLogs.forEach((log) => {
                if (log.deviceId && !uniqueDevices.has(log.deviceId)) {
                    uniqueDevices.set(log.deviceId, {
                        deviceId: log.deviceId,
                        deviceName: log.deviceName || 'Unknown',
                        computerName: log.computerName,
                        ipAddress: log.ipAddress,
                        timestamp: log.timestamp,
                    });
                }
            });

            setDevices(Array.from(uniqueDevices.values()));
        } catch (error) {
            console.error('Error fetching blocked devices:', error);
        } finally {
            setLoading(false);
        }
    };

    // Kết nối SignalR để nhận thông báo real-time
    useEffect(() => {
        const token = localStorage.getItem('token');
        const connection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/system`, token ? { accessTokenFactory: () => token } : {})
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        connection.start()
            .then(() => {
                console.log('✅ BlockedDevicesTable: SignalR connected');

                // Khi có USB bị chặn mới → tự động thêm vào bảng
                connection.on('UsbAlert', (data: any) => {
                    console.log('🚨 USB Alert in table:', data);
                    setDevices(prev => {
                        const exists = prev.some(d => d.deviceId === data.deviceId);
                        if (exists) return prev;
                        return [{
                            deviceId: data.deviceId,
                            deviceName: data.deviceName,
                            computerName: data.computerName,
                            ipAddress: data.ipAddress,
                            timestamp: data.timestamp,
                        }, ...prev];
                    });
                    message.warning(`🚨 USB bị chặn: ${data.deviceName} trên ${data.computerName}`);
                });

                // Khi thiết bị được phê duyệt → xóa khỏi bảng
                connection.on('DeviceApproved', (data: any) => {
                    console.log('✅ Device approved:', data);
                    setDevices(prev => prev.filter(d => d.deviceId.toUpperCase() !== data.deviceId?.toUpperCase()));
                });
            })
            .catch(err => {
                console.error('❌ SignalR error in BlockedDevicesTable:', err);
            });

        connectionRef.current = connection;

        return () => {
            connection.off('UsbAlert');
            connection.off('DeviceApproved');
            connection.stop();
        };
    }, []);

    useEffect(() => {
        fetchBlockedDevices();
        const interval = setInterval(fetchBlockedDevices, 15000);
        return () => clearInterval(interval);
    }, []);

    const handleApprove = async (device: BlockedDevice) => {
        try {
            await api.post<Device>('/api/devices', {
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                name: device.deviceName,
                description: `Approved from ${device.computerName}`,
                isAllowed: true,
            });

            message.success(`✅ Đã phê duyệt thiết bị: ${device.deviceName}`);
            // Xóa khỏi danh sách ngay lập tức
            setDevices(prev => prev.filter(d => d.deviceId !== device.deviceId));
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi phê duyệt thiết bị!');
            console.error('Error approving device:', error);
        }
    };

    const columns: ColumnsType<BlockedDevice> = [
        {
            title: 'Thiết bị',
            dataIndex: 'deviceName',
            key: 'deviceName',
            render: (name: string) => (
                <Space>
                    <UsbOutlined style={{ color: '#ff4d4f' }} />
                    <strong>{name}</strong>
                </Space>
            ),
        },
        {
            title: 'VID/PID',
            dataIndex: 'deviceId',
            key: 'deviceId',
            render: (deviceId: string) => {
                const vidMatch = deviceId.match(/VID_([0-9A-F]{4})/i);
                const pidMatch = deviceId.match(/PID_([0-9A-F]{4})/i);
                const vid = vidMatch ? vidMatch[1] : '????';
                const pid = pidMatch ? pidMatch[1] : '????';
                return <Tag color="orange">{`${vid}:${pid}`}</Tag>;
            },
        },
        {
            title: 'Máy tính',
            dataIndex: 'computerName',
            key: 'computerName',
        },
        {
            title: 'IP Address',
            dataIndex: 'ipAddress',
            key: 'ipAddress',
        },
        {
            title: 'Thời gian',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (timestamp: string) => new Date(timestamp).toLocaleString('vi-VN'),
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_: any, record: BlockedDevice) => (
                <Space>
                    <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        onClick={() => handleApprove(record)}
                    >
                        Phê duyệt
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Badge count={devices.length} overflowCount={99}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Thiết bị đang bị chặn</span>
                </Badge>
                <Button icon={<ReloadOutlined />} onClick={fetchBlockedDevices} loading={loading} size="small">
                    Làm mới
                </Button>
            </div>
            {isMobile ? (
                <div className="mobile-incident-list">
                    {devices.length === 0 ? (
                        <div className="empty-incidents">
                            <span className="material-symbols-outlined empty-icon">check_circle</span>
                            <h3>Hệ thống an toàn</h3>
                            <p>Không phát hiện thiết bị bị chặn nào.</p>
                        </div>
                    ) : (
                        <div className="incident-cards-container">
                            {devices.map(device => {
                                const vidMatch = device.deviceId.match(/VID_([0-9A-F]{4})/i);
                                const pidMatch = device.deviceId.match(/PID_([0-9A-F]{4})/i);
                                const vid = vidMatch ? vidMatch[1] : '????';
                                const pid = pidMatch ? pidMatch[1] : '????';
                                
                                return (
                                    <div key={device.deviceId} className="incident-card">
                                        <div className="severity-bar" style={{ backgroundColor: '#ef4444' }} />
                                        <div className="incident-card-content">
                                            <div className="incident-card-header">
                                                <div className="severity-tag" style={{ backgroundColor: '#ef444415', color: '#ef4444' }}>
                                                    DEVICE BLOCKED
                                                </div>
                                                <span className="time-ago">{new Date(device.timestamp).toLocaleTimeString('vi-VN')}</span>
                                            </div>

                                            <div className="device-info">
                                                <span className="material-symbols-outlined device-icon" style={{ color: '#ef4444' }}>usb</span>
                                                <div className="device-details">
                                                    <h3 className="device-name">{device.deviceName}</h3>
                                                    <p className="incident-desc">
                                                        VID/PID: <Tag color="orange" style={{ margin: 0 }}>{vid}:{pid}</Tag>
                                                    </p>
                                                    <p className="incident-desc" style={{ marginTop: 4 }}>
                                                        <strong>PC:</strong> {device.computerName} ({device.ipAddress})
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="incident-actions">
                                                <button 
                                                    className="action-btn block-btn" 
                                                    style={{ backgroundColor: '#3b82f6', borderColor: '#3b82f6' }}
                                                    onClick={() => handleApprove(device)}
                                                >
                                                    <span className="material-symbols-outlined">check_circle</span>
                                                    Phê duyệt
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <Table
                    columns={columns}
                    dataSource={devices}
                    rowKey="deviceId"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    locale={{ emptyText: 'Không có thiết bị bị chặn' }}
                />
            )}
        </div>
    );
}

export default BlockedDevicesTable;

