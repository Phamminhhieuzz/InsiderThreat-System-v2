import React, { useEffect, useState } from 'react';
import { Layout, Typography, Card, Table, Button, Modal, Form, DatePicker, Select, Input, Tag, message, Space } from 'antd';
import { PlusOutlined, CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import NavigationBar from '../../components/NavigationBar';
import LeftSidebar from '../../components/LeftSidebar';
import { leaveService } from '../../services/leaveService';
import type { LeaveRequest, User } from '../../types';
import dayjs from 'dayjs';
import styles from './LeaveManagement.module.css';


const { Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Option } = Select;

const MyLeavePage = () => {
    const [user, setUser] = useState<User>(JSON.parse(localStorage.getItem('user') || '{}'));
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const data = await leaveService.getMyRequests();
            setRequests(data);
        } catch (error) {
            console.error('Failed to fetch leave requests:', error);
            message.error('Không thể tải lịch sử nghỉ phép.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRequest = async (values: any) => {
        setSubmitting(true);
        try {
            const payload = {
                type: values.type,
                startDate: values.dates[0].toDate().toISOString(),
                endDate: values.dates[1].toDate().toISOString(),
                reason: values.reason,
                userId: user.id || '',
                userName: user.fullName || '',
                status: 'Pending'
            };

            const response = await leaveService.createRequest(payload);
            message.success('Đã gửi yêu cầu nghỉ phép thành công.');
            setIsModalOpen(false);
            form.resetFields();
            fetchRequests();

            if (response.conflicts && response.conflicts.length > 0) {
                message.warning(`Cảnh báo: Bạn có ${response.conflicts.length} công việc đang đến hạn trong thời gian này!`);
            }
        } catch (error: any) {
            console.error('Failed to create leave request:', error);
            message.error(error.response?.data?.message || 'Lỗi khi gửi yêu cầu. Có thể do không đủ ngày phép.');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'Loại phép',
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => {
                const types: Record<string, string> = {
                    'Annual': 'Phép năm',
                    'Sick': 'Nghỉ ốm',
                    'Personal': 'Việc riêng',
                    'Maternity': 'Thai sản'
                };
                return types[type] || type;
            }
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
            title: 'Lý do',
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                let color = 'default';
                let text = status;
                if (status === 'Approved') { color = 'success'; text = 'Đã duyệt'; }
                else if (status === 'Pending') { color = 'processing'; text = 'Đang chờ'; }
                else if (status === 'Rejected') { color = 'error'; text = 'Từ chối'; }
                return <Tag color={color}>{text}</Tag>;
            }
        },
        {
            title: 'Ghi chú quản lý',
            dataIndex: 'rejectionReason',
            key: 'rejectionReason',
            ellipsis: true,
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
                            <Title level={3} className={styles.pageTitle}>Nghỉ Phép Của Tôi</Title>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                                Tạo Đơn Xin Nghỉ
                            </Button>
                        </div>

                        {/* Stats Cards */}
                        <div className={styles.statsGrid}>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statIcon} style={{ color: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)' }}>
                                    <CalendarOutlined />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{user.annualLeaveBalance ?? 12} <Text type="secondary" style={{ fontSize: '14px' }}>ngày</Text></div>
                                    <div className={styles.statLabel}>Phép năm còn lại</div>
                                </div>
                            </Card>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statIcon} style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                                    <FileTextOutlined />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{requests.filter(r => r.status === 'Pending').length}</div>
                                    <div className={styles.statLabel}>Đơn đang chờ</div>
                                </div>
                            </Card>
                        </div>

                        {/* History Table */}
                        <Card className={styles.tableCard} title="Lịch sử nghỉ phép" bordered={false}>
                            <Table 
                                columns={columns} 
                                dataSource={requests} 
                                rowKey="id" 
                                loading={loading}
                                pagination={{ pageSize: 10 }}
                            />
                        </Card>
                    </div>
                </div>
            </Content>

            {/* Create Leave Request Modal */}
            <Modal
                title="Tạo Đơn Xin Nghỉ Phép"
                open={isModalOpen}
                onCancel={() => {
                    setIsModalOpen(false);
                    form.resetFields();
                }}
                footer={null}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleCreateRequest}
                    initialValues={{ type: 'Annual' }}
                >
                    <Form.Item name="type" label="Loại nghỉ phép" rules={[{ required: true, message: 'Vui lòng chọn loại nghỉ phép' }]}>
                        <Select>
                            <Option value="Annual">Phép năm (Có hưởng lương)</Option>
                            <Option value="Sick">Nghỉ ốm (Có giấy xác nhận)</Option>
                            <Option value="Personal">Việc riêng (Không hưởng lương)</Option>
                            <Option value="Maternity">Nghỉ thai sản</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="dates" label="Thời gian" rules={[{ required: true, message: 'Vui lòng chọn thời gian nghỉ' }]}>
                        <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>

                    <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}>
                        <TextArea rows={4} placeholder="Nhập lý do chi tiết..." />
                    </Form.Item>

                    <Form.Item className={styles.formActions}>
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
                            <Button type="primary" htmlType="submit" loading={submitting}>Gửi Đơn</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </Layout>
    );
};

export default MyLeavePage;
