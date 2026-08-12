import React, { useEffect, useState } from 'react';
import { Layout, Typography, Card, Table, Button, Modal, Form, DatePicker, Select, Input, Tag, message, Space } from 'antd';
import { PlusOutlined, CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
            message.error(t('leave.my_leave.fetch_fail', 'Không thể tải lịch sử nghỉ phép.'));
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
            message.success(t('leave.my_leave.create_success', 'Đã gửi yêu cầu nghỉ phép thành công.'));
            setIsModalOpen(false);
            form.resetFields();
            fetchRequests();

            if (response.conflicts && response.conflicts.length > 0) {
                message.warning(t('leave.my_leave.conflict_warning', { count: response.conflicts.length, defaultValue: `Cảnh báo: Bạn có ${response.conflicts.length} công việc đang đến hạn trong thời gian này!` }));
            }
        } catch (error: any) {
            console.error('Failed to create leave request:', error);
            message.error(error.response?.data?.message || t('leave.my_leave.create_fail', 'Lỗi khi gửi yêu cầu. Có thể do không đủ ngày phép.'));
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: t('leave.my_leave.col_type', 'Loại phép'),
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => {
                const types: Record<string, string> = {
                    'Annual': t('leave.type_annual', 'Phép năm'),
                    'Sick': t('leave.type_sick', 'Nghỉ ốm'),
                    'Personal': t('leave.type_personal', 'Việc riêng'),
                    'Maternity': t('leave.type_maternity', 'Thai sản')
                };
                return types[type] || type;
            }
        },
        {
            title: t('leave.my_leave.col_time', 'Thời gian'),
            key: 'time',
            render: (_: any, record: LeaveRequest) => (
                <Text>
                    {dayjs(record.startDate).format('DD/MM/YYYY')} - {dayjs(record.endDate).format('DD/MM/YYYY')}
                </Text>
            )
        },
        {
            title: t('leave.my_leave.col_reason', 'Lý do'),
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: t('leave.my_leave.col_status', 'Trạng thái'),
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                let color = 'default';
                let text = status;
                if (status === 'Approved') { color = 'success'; text = t('leave.status_approved', 'Đã duyệt'); }
                else if (status === 'Pending') { color = 'processing'; text = t('leave.status_pending', 'Đang chờ'); }
                else if (status === 'Rejected') { color = 'error'; text = t('leave.status_rejected', 'Từ chối'); }
                return <Tag color={color}>{text}</Tag>;
            }
        },
        {
            title: t('leave.my_leave.col_manager_note', 'Ghi chú quản lý'),
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
                            <Title level={3} className={styles.pageTitle}>{t('leave.my_leave.title', 'Nghỉ Phép Của Tôi')}</Title>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                                {t('leave.my_leave.create_btn', 'Tạo Đơn Xin Nghỉ')}
                            </Button>
                        </div>

                        {/* Stats Cards */}
                        <div className={styles.statsGrid}>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statIcon} style={{ color: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)' }}>
                                    <CalendarOutlined />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{user.annualLeaveBalance ?? 12} <Text type="secondary" style={{ fontSize: '14px' }}>{t('leave.my_leave.days_unit', 'ngày')}</Text></div>
                                    <div className={styles.statLabel}>{t('leave.my_leave.remaining_annual', 'Phép năm còn lại')}</div>
                                </div>
                            </Card>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statIcon} style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                                    <FileTextOutlined />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{requests.filter(r => r.status === 'Pending').length}</div>
                                    <div className={styles.statLabel}>{t('leave.my_leave.pending_count', 'Đơn đang chờ')}</div>
                                </div>
                            </Card>
                        </div>

                        {/* History Table */}
                        <Card className={styles.tableCard} title={t('leave.my_leave.history_title', 'Lịch sử nghỉ phép')} bordered={false}>
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
                title={t('leave.my_leave.modal_title', 'Tạo Đơn Xin Nghỉ Phép')}
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
                    <Form.Item name="type" label={t('leave.my_leave.form_type_label', 'Loại nghỉ phép')} rules={[{ required: true, message: t('leave.my_leave.form_type_required', 'Vui lòng chọn loại nghỉ phép') }]}>
                        <Select>
                            <Option value="Annual">{t('leave.my_leave.type_annual_full', 'Phép năm (Có hưởng lương)')}</Option>
                            <Option value="Sick">{t('leave.my_leave.type_sick_full', 'Nghỉ ốm (Có giấy xác nhận)')}</Option>
                            <Option value="Personal">{t('leave.my_leave.type_personal_full', 'Việc riêng (Không hưởng lương)')}</Option>
                            <Option value="Maternity">{t('leave.my_leave.type_maternity_full', 'Nghỉ thai sản')}</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="dates" label={t('leave.my_leave.form_time_label', 'Thời gian')} rules={[{ required: true, message: t('leave.my_leave.form_time_required', 'Vui lòng chọn thời gian nghỉ') }]}>
                        <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>

                    <Form.Item name="reason" label={t('leave.my_leave.form_reason_label', 'Lý do')} rules={[{ required: true, message: t('leave.my_leave.form_reason_required', 'Vui lòng nhập lý do') }]}>
                        <TextArea rows={4} placeholder={t('leave.my_leave.form_reason_placeholder', 'Nhập lý do chi tiết...') as string} />
                    </Form.Item>

                    <Form.Item className={styles.formActions}>
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>{t('leave.my_leave.cancel', 'Hủy')}</Button>
                            <Button type="primary" htmlType="submit" loading={submitting}>{t('leave.my_leave.submit', 'Gửi Đơn')}</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </Layout>
    );
};

export default MyLeavePage;
