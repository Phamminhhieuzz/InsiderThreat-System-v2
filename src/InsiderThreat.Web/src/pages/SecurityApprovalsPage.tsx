import { useState, useEffect } from 'react';
import { Table, Button, Tag, Space, Card, Typography, message, Empty, Alert } from 'antd';
import { CheckOutlined, CloseOutlined, SafetyOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import LeftSidebar from '../components/LeftSidebar';


const { Title, Text } = Typography;

interface PendingAction {
    id: string;
    requestedByUserName: string;
    type: number;
    reason: string;
    createdAt: string;
    status: number;
}

const ActionTypeMap: Record<number, string> = {
    0: 'Xóa người dùng',
    1: 'Cập nhật vai trò',
    2: 'Xóa nhật ký bảo mật',
    3: 'Thay đổi cấu hình hệ thống'
};

export default function SecurityApprovalsPage() {
    const [actions, setActions] = useState<PendingAction[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchPendingActions = async () => {
        setLoading(true);
        try {
            const data = await api.get<PendingAction[]>('/api/securityapprovals/pending');
            setActions(data);
        } catch (error) {
            message.error('Không thể tải danh sách chờ duyệt');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingActions();
    }, []);

    const handleApprove = async (id: string) => {
        try {
            await api.post(`/api/securityapprovals/${id}/approve`, {});
            message.success('Đã phê duyệt thành công');
            fetchPendingActions();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Phê duyệt thất bại');
        }
    };

    const handleReject = async (id: string) => {
        try {
            await api.post(`/api/securityapprovals/${id}/reject`, {});
            message.success('đã từ chối yêu cầu');
            fetchPendingActions();
        } catch (error) {
            message.error('Thao tác thất bại');
        }
    };

    const columns = [
        {
            title: 'Hành động',
            dataIndex: 'type',
            key: 'type',
            render: (type: number) => <Tag color="orange">{ActionTypeMap[type] || 'Hành động lạ'}</Tag>
        },
        {
            title: 'Chi tiết / Lý do',
            dataIndex: 'reason',
            key: 'reason',
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: 'Người yêu cầu',
            dataIndex: 'requestedByUserName',
            key: 'requestedByUserName',
            render: (text: string) => <Space><UserOutlined />{text}</Space>
        },
        {
            title: 'Thời gian',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => <Space><ClockCircleOutlined />{new Date(date).toLocaleString()}</Space>
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_: any, record: PendingAction) => (
                <Space>
                    <Button 
                        type="primary" 
                        icon={<CheckOutlined />} 
                        onClick={() => handleApprove(record.id)}
                        style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    >
                        Phê duyệt
                    </Button>
                    <Button 
                        danger 
                        icon={<CloseOutlined />} 
                        onClick={() => handleReject(record.id)}
                    >
                        Từ chối
                    </Button>
                </Space>
            )
        }
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f2f5' }}>
            <LeftSidebar />
            <div style={{ flex: 1, padding: '24px' }}>
                <Card bordered={false} style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                        <div style={{ 
                            padding: 12, background: '#e6f7ff', borderRadius: 12, color: '#1890ff' 
                        }}>
                            <SafetyOutlined style={{ fontSize: 24 }} />
                        </div>
                        <div>
                            <Title level={2} style={{ margin: 0 }}>Phê duyệt Bảo mật</Title>
                            <Text type="secondary">Nguyên tắc Bốn mắt: Các hành động nhạy cảm cần quản trị viên khác phê duyệt.</Text>
                        </div>
                    </div>

                    <Alert
                        message="Lưu ý an ninh"
                        description="Hệ thống Insider Threat yêu cầu ít nhất 2 quản trị viên để thực thi các lệnh xóa dữ liệu hoặc thay đổi quyền hạn. Bạn không thể tự phê duyệt yêu cầu của chính mình."
                        type="info"
                        showIcon
                        style={{ marginBottom: 24 }}
                    />

                    <Table 
                        columns={columns} 
                        dataSource={actions} 
                        rowKey="id" 
                        loading={loading}
                        locale={{ emptyText: <Empty description="Không có yêu cầu nào đang chờ duyệt" /> }}
                    />
                </Card>
            </div>
        </div>
    );
}
