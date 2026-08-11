import { useEffect, useState } from 'react';
import { Modal, Button, Typography, Space, Tag } from 'antd';
import { WarningOutlined, UsbOutlined } from '@ant-design/icons';
import * as signalR from '@microsoft/signalr';
import { api, API_BASE_URL } from '../services/api';
import type { Device } from '../types';

const { Text, Title } = Typography;

interface UsbAlert {
    deviceId: string;
    deviceName: string;
    computerName: string;
    ipAddress: string;
    timestamp: string;
    message: string;
}

interface UsbNotificationProps {
    userRole: string;
}

function UsbNotification({ userRole }: UsbNotificationProps) {
    const [alert, setAlert] = useState<UsbAlert | null>(null);
    const [connection, setConnection] = useState<signalR.HubConnection | null>(null);

    useEffect(() => {
        // Chỉ Admin mới kết nối SignalR
        if (userRole !== 'Admin') return;

        // Tạo kết nối SignalR
        const token = localStorage.getItem('token');
        const newConnection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/system`, token ? { accessTokenFactory: () => token } : {})
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        setConnection(newConnection);

        return () => {
            if (newConnection) {
                newConnection.stop();
            }
        };
    }, [userRole]);

    useEffect(() => {
        if (connection) {
            connection
                .start()
                .then(() => {
                    console.log('✅ SignalR connected');

                    // Lắng nghe sự kiện UsbAlert từ server
                    connection.on('UsbAlert', (data: UsbAlert) => {
                        console.log('🚨 USB Alert received:', data);
                        setAlert(data);
                    });
                })
                .catch((err) => {
                    console.error('❌ SignalR connection error:', err);
                });

            return () => {
                connection.off('UsbAlert');
            };
        }
    }, [connection]);

    const handleBlock = async () => {
        if (connection && alert) {
            try {
                await connection.invoke('BlockDevice', alert.deviceId);
                Modal.success({
                    title: 'Đã gửi lệnh chặn',
                    content: `Thiết bị ${alert.deviceName} sẽ bị chặn.`,
                });
                setAlert(null);
            } catch (err) {
                console.error('Error blocking device:', err);
            }
        }
    };

    const handleAllow = async () => {
        if (alert) {
            try {
                await api.post<Device>('/api/devices', {
                    deviceId: alert.deviceId,
                    deviceName: alert.deviceName,
                    description: `Approved via Notification from ${alert.computerName}`,
                    isAllowed: true,
                });
                Modal.success({
                    title: 'Đã phê duyệt',
                    content: `Thiết bị ${alert.deviceName} đã được thêm vào whitelist.`,
                });
                setAlert(null);
            } catch (error) {
                console.error('Error approving device:', error);
                Modal.error({
                    title: 'Lỗi',
                    content: 'Không thể phê duyệt thiết bị. Vui lòng thử lại.',
                });
            }
        }
    };

    return (
        <Modal
            open={!!alert}
            onCancel={() => setAlert(null)}
            footer={[
                <Button key="allow" onClick={handleAllow}>
                    Cho phép
                </Button>,
                <Button key="block" type="primary" danger onClick={handleBlock}>
                    Chặn thiết bị
                </Button>,
            ]}
            width={500}
        >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                    <WarningOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
                    <Title level={4} style={{ marginTop: 16 }}>
                        🚨 Cảnh báo USB
                    </Title>
                </div>

                {alert && (
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <div>
                            <Text strong>Thiết bị:</Text>{' '}
                            <Tag icon={<UsbOutlined />} color="orange">
                                {alert.deviceName}
                            </Tag>
                        </div>
                        <div>
                            <Text strong>Device ID:</Text> <Text code>{alert.deviceId}</Text>
                        </div>
                        <div>
                            <Text strong>Máy tính:</Text> <Text>{alert.computerName}</Text>
                        </div>
                        <div>
                            <Text strong>IP Address:</Text> <Text>{alert.ipAddress}</Text>
                        </div>
                        <div>
                            <Text strong>Thời gian:</Text>{' '}
                            <Text>{new Date(alert.timestamp).toLocaleString('vi-VN')}</Text>
                        </div>
                        <div>
                            <Text strong>Thông báo:</Text> <Text type="danger">{alert.message}</Text>
                        </div>
                    </Space>
                )}
            </Space>
        </Modal>
    );
}

export default UsbNotification;
