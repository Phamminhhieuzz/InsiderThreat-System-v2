import { useState, useEffect } from 'react';
import { Table, Button, message, Tag, Popconfirm, Space } from 'antd';
import { DeleteOutlined, UsbOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import type { Device } from '../types';
import type { ColumnsType } from 'antd/es/table';

// Mã định danh phần cứng USB có 2 dạng tuỳ nguồn phát hiện:
//  - Thiết bị USB thường:  ...VID_0951&PID_1666...      (từ SetupAPI/hardware id)
//  - Ổ đĩa USB (USBSTOR):  ...VEN_VendorCo&PROD_...     (từ Win32_DiskDrive mà agent dùng)
// Trước đây chỉ tách theo VID/PID nên mọi USB lưu trữ đều hiện "????:????".
function formatDeviceCode(deviceId?: string): string {
    if (!deviceId) return 'N/A';

    const vid = deviceId.match(/VID_([0-9A-F]{4})/i);
    const pid = deviceId.match(/PID_([0-9A-F]{4})/i);
    if (vid && pid) return `${vid[1]}:${pid[1]}`;

    const ven = deviceId.match(/VEN_([^&\\]+)/i);
    const prod = deviceId.match(/PROD_([^&\\]+)/i);
    if (ven || prod) return `${ven?.[1] ?? '?'}:${prod?.[1] ?? '?'}`;

    // Không khớp định dạng nào — hiện phần cuối của ID còn hơn là "????:????".
    const tail = deviceId.split('\\').pop() ?? deviceId;
    return tail.length > 24 ? `${tail.slice(0, 24)}…` : tail;
}

function WhitelistTable() {
    const [loading, setLoading] = useState(false);
    const [devices, setDevices] = useState<Device[]>([]);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchWhitelist = async () => {
        setLoading(true);
        try {
            const data = await api.get<Device[]>('/api/devices');
            setDevices(data);
        } catch (error) {
            message.error('Lỗi tải danh sách whitelist!');
            console.error('Error fetching whitelist:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWhitelist();
        // Auto-refresh every 15 seconds
        const interval = setInterval(fetchWhitelist, 15000);
        return () => clearInterval(interval);
    }, []);

    const handleRemove = async (id: string, deviceName: string) => {
        try {
            await api.delete(`/api/devices/${id}`);
            message.success(`Đã xóa thiết bị: ${deviceName}`);
            fetchWhitelist();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi xóa thiết bị!');
            console.error('Error removing device:', error);
        }
    };

    const columns: ColumnsType<Device> = [
        {
            title: 'Thiết bị',
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => (
                <Space>
                    <UsbOutlined style={{ color: '#52c41a' }} />
                    <strong>{name || 'Không rõ tên'}</strong>
                </Space>
            ),
        },
        {
            title: 'Mã thiết bị',
            dataIndex: 'deviceId',
            key: 'deviceId',
            render: (deviceId: string) => (
                <Tag color="green">{formatDeviceCode(deviceId)}</Tag>
            ),
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
        },
        {
            title: 'Ngày thêm',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) =>
                date ? new Date(date).toLocaleString('vi-VN') : 'N/A',
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_: any, record: Device) => (
                <Popconfirm
                    title="Xác nhận xóa"
                    description={`Bạn có chắc muốn xóa "${record.name}" khỏi whitelist?`}
                    onConfirm={() => record.id && handleRemove(record.id, record.name)}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                >
                    <Button
                        danger
                        icon={<DeleteOutlined />}
                    >
                        Xóa
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <>
            {isMobile ? (
                <div className="mobile-incident-list">
                    {devices.length === 0 ? (
                        <div className="empty-incidents">
                            <span className="material-symbols-outlined empty-icon">check_circle</span>
                            <h3>Hệ thống an toàn</h3>
                            <p>Chưa có thiết bị nào trong danh sách được phép.</p>
                        </div>
                    ) : (
                        <div className="incident-cards-container">
                            {devices.map(device => {
                                const deviceCode = formatDeviceCode(device.deviceId);

                                return (
                                    <div key={device.deviceId} className="incident-card">
                                        <div className="severity-bar" style={{ backgroundColor: '#52c41a' }} />
                                        <div className="incident-card-content">
                                            <div className="incident-card-header">
                                                <div className="severity-tag" style={{ backgroundColor: '#52c41a15', color: '#52c41a' }}>
                                                    WHITELISTED
                                                </div>
                                                <span className="time-ago">
                                                    {device.createdAt ? new Date(device.createdAt).toLocaleString('vi-VN') : 'N/A'}
                                                </span>
                                            </div>

                                            <div className="device-info">
                                                <span className="material-symbols-outlined device-icon" style={{ color: '#52c41a' }}>usb_off</span>
                                                <div className="device-details">
                                                    <h3 className="device-name">{device.name || 'Không rõ tên'}</h3>
                                                    <p className="incident-desc">
                                                        Mã thiết bị: <Tag color="green" style={{ margin: 0 }}>{deviceCode}</Tag>
                                                    </p>
                                                    <p className="incident-desc" style={{ marginTop: 4 }}>
                                                        {device.description}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="incident-actions">
                                                <Popconfirm
                                                    title="Xác nhận xóa"
                                                    description={`Bạn có chắc muốn xóa "${device.name}" khỏi whitelist?`}
                                                    onConfirm={() => device.id && handleRemove(device.id, device.name)}
                                                    okText="Xóa"
                                                    cancelText="Hủy"
                                                    okButtonProps={{ danger: true }}
                                                >
                                                    <button className="action-btn dismiss-btn" style={{ width: '100%', justifyContent: 'center' }}>
                                                        <span className="material-symbols-outlined">delete</span>
                                                        Loại bỏ
                                                    </button>
                                                </Popconfirm>
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
                    locale={{ emptyText: 'Chưa có thiết bị trong whitelist' }}
                />
            )}
        </>
    );
}

export default WhitelistTable;
