import React, { useEffect, useState } from 'react';
import { Layout, Typography, Card, Table, Button, Modal, Input, Tag, message } from 'antd';
import { CheckOutlined, CloseOutlined, ExceptionOutlined } from '@ant-design/icons';
import NavigationBar from '../../components/NavigationBar';
import LeftSidebar from '../../components/LeftSidebar';
import BottomNavigation from '../../components/BottomNavigation';
import { leaveService } from '../../services/leaveService';
import type { LeaveRequest } from '../../types';
import dayjs from 'dayjs';
import styles from './LeaveManagement.module.css';

const { Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

const LeaveApprovalsPage = () => {
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [processing, setProcessing] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        fetchPendingRequests();
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchPendingRequests = async () => {
        setLoading(true);
        try {
            const data = await leaveService.getPendingApprovals();
            setRequests(data);
        } catch (error) {
            console.error('Failed to fetch pending leave requests:', error);
            message.error('Không thể tải danh sách đơn xin nghỉ.');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        try {
            await leaveService.approveRequest(id);
            message.success('Đã duyệt đơn nghỉ phép.');
            fetchPendingRequests();
        } catch (error: any) {
            console.error('Failed to approve request:', error);
            message.error(error.response?.data?.message || 'Lỗi khi duyệt đơn.');
        }
    };

    const handleReject = async () => {
        if (!selectedRequestId) return;
        if (!rejectReason.trim()) {
            message.warning('Vui lòng nhập lý do từ chối.');
            return;
        }

        setProcessing(true);
        try {
            await leaveService.rejectRequest(selectedRequestId, rejectReason);
            message.success('Đã từ chối đơn nghỉ phép.');
            setIsRejectModalOpen(false);
            setRejectReason('');
            fetchPendingRequests();
        } catch (error: any) {
            console.error('Failed to reject request:', error);
            message.error(error.response?.data?.message || 'Lỗi khi từ chối đơn.');
        } finally {
            setProcessing(false);
            setSelectedRequestId(null);
        }
    };

    const openRejectModal = (id: string) => {
        setSelectedRequestId(id);
        setIsRejectModalOpen(true);
        setRejectReason('');
    };

    const getLeaveTypeName = (type: string) => {
        const types: Record<string, string> = {
            'Annual': 'Phép năm',
            'Sick': 'Nghỉ ốm',
            'Personal': 'Việc riêng',
            'Maternity': 'Thai sản'
        };
        return types[type] || type;
    };

    const columns = [
        {
            title: 'Nhân viên',
            dataIndex: 'userName',
            key: 'userName',
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: 'Loại phép',
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => <Tag color="blue">{getLeaveTypeName(type)}</Tag>
        },
        {
            title: 'Thời gian',
            key: 'time',
            render: (_: any, record: LeaveRequest) => (
                <Text>
                    {dayjs(record.startDate).format('DD/MM/YYYY')} - {dayjs(record.endDate).format('DD/MM/YYYY')}
                </Text>
            )
        },
        {
            title: 'Số ngày',
            key: 'duration',
            render: (_: any, record: LeaveRequest) => {
                const start = dayjs(record.startDate);
                const end = dayjs(record.endDate);
                return <Text>{end.diff(start, 'day') + 1} ngày</Text>;
            }
        },
        {
            title: 'Lý do',
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (_: any, record: LeaveRequest) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                        type="primary" 
                        icon={<CheckOutlined />} 
                        onClick={() => handleApprove(record.id!)}
                        size="small"
                        style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                    >
                        Duyệt
                    </Button>
                    <Button 
                        danger 
                        icon={<CloseOutlined />} 
                        onClick={() => openRejectModal(record.id!)}
                        size="small"
                    >
                        Từ chối
                    </Button>
                </div>
            )
        }
    ];

    return (
        <Layout className={styles.layout}>
            <NavigationBar />
            <Content className={styles.content}>
                <div className={styles.container}>
                    <LeftSidebar />
                    <div className={styles.mainContent}>
                        <div className={styles.header}>
                            <Title level={3} className={styles.pageTitle}>Phê Duyệt Nghỉ Phép</Title>
                        </div>

                        {/* Summary Card */}
                        <div className={styles.statsGrid}>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statIcon} style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                                    <ExceptionOutlined />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{requests.length}</div>
                                    <div className={styles.statLabel}>Đơn chờ duyệt</div>
                                </div>
                            </Card>
                        </div>

                        {/* Approvals Table/List */}
                        <Card className={styles.tableCard} title="Danh sách đơn chờ" bordered={false}>
                            {isMobile ? (
                                <div className={styles.mobileList}>
                                    {requests.length === 0 ? (
                                        <div className={styles.emptyState}>Không có đơn nào đang chờ duyệt</div>
                                    ) : (
                                        requests.map((record) => (
                                            <div key={record.id} className={styles.mobileCard}>
                                                <div className={styles.cardHeader}>
                                                    <Text strong style={{ fontSize: '16px' }}>{record.userName}</Text>
                                                    <Tag color="blue">{getLeaveTypeName(record.type)}</Tag>
                                                </div>
                                                <div className={styles.cardBody}>
                                                    <div className={styles.cardRow}>
                                                        <Text type="secondary">Thời gian:</Text>
                                                        <Text>{dayjs(record.startDate).format('DD/MM/YYYY')} - {dayjs(record.endDate).format('DD/MM/YYYY')}</Text>
                                                    </div>
                                                    <div className={styles.cardRow}>
                                                        <Text type="secondary">Số ngày:</Text>
                                                        <Text>{dayjs(record.endDate).diff(dayjs(record.startDate), 'day') + 1} ngày</Text>
                                                    </div>
                                                    <div className={styles.cardRow}>
                                                        <Text type="secondary">Lý do:</Text>
                                                        <Text>{record.reason || 'Không có lý do chi tiết'}</Text>
                                                    </div>
                                                </div>
                                                <div className={styles.cardActions}>
                                                    <Button 
                                                        type="primary" 
                                                        icon={<CheckOutlined />} 
                                                        onClick={() => handleApprove(record.id!)}
                                                        block
                                                        style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                                                    >
                                                        Duyệt
                                                    </Button>
                                                    <Button 
                                                        danger 
                                                        icon={<CloseOutlined />} 
                                                        onClick={() => openRejectModal(record.id!)}
                                                        block
                                                    >
                                                        Từ chối
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <Table 
                                    columns={columns} 
                                    dataSource={requests} 
                                    rowKey="id" 
                                    loading={loading}
                                    pagination={{ pageSize: 15 }}
                                    locale={{ emptyText: 'Không có đơn nào đang chờ duyệt' }}
                                />
                            )}
                        </Card>
                    </div>
                </div>
            </Content>
            <BottomNavigation />

            {/* Reject Modal */}
            <Modal
                title="Từ chối đơn xin nghỉ phép"
                open={isRejectModalOpen}
                onCancel={() => setIsRejectModalOpen(false)}
                footer={[
                    <Button key="back" onClick={() => setIsRejectModalOpen(false)}>Hủy</Button>,
                    <Button key="submit" type="primary" danger loading={processing} onClick={handleReject}>Từ chối</Button>
                ]}
            >
                <div style={{ marginBottom: 16 }}>
                    <Text>Vui lòng cho biết lý do từ chối đơn nghỉ phép này:</Text>
                </div>
                <TextArea 
                    rows={4} 
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Nhập lý do chi tiết..."
                    autoFocus
                />
            </Modal>
        </Layout>
    );
};

export default LeaveApprovalsPage;
