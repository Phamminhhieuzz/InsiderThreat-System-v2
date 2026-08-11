import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Popconfirm, Tag, Space, Avatar, App } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, CameraOutlined, TeamOutlined, WarningOutlined, FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import FaceRegistrationModal from '../components/FaceRegistrationModal';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import { api } from '../services/api';
import type { User } from '../types';
import type { ColumnsType } from 'antd/es/table';
import { DEPARTMENTS } from '../constants';
import { feedService } from '../services/feedService';
import { authService } from '../services/auth';
import './UsersPage.css';


const { Option } = Select;

function UsersPage() {
    const { t } = useTranslation();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [form] = Form.useForm();
    const { message } = App.useApp();
    const [isFaceModalVisible, setIsFaceModalVisible] = useState(false);
    const [selectedUserForFace, setSelectedUserForFace] = useState<{ id: string; name: string } | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const currentUser = authService.getCurrentUser();

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Reports State
    const [reports, setReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);

    const handleRegisterFace = (user: User) => {
        if (!user.id) return;
        setSelectedUserForFace({ id: user.id, name: user.fullName });
        setIsFaceModalVisible(true);
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await api.get<User[]>('/api/users');
            setUsers(data);
        } catch (error) {
            message.error(t('users_admin.fetch_users_fail', 'Lỗi tải danh sách người dùng!'));
        } finally {
            setLoading(false);
        }
    };

    // Admin role detection (case-insensitive)
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin' ||
        currentUser?.role?.toLowerCase() === 'giám đốc' ||
        currentUser?.role?.toLowerCase() === 'giam doc' ||
        currentUser?.username?.toLowerCase() === 'admin';

    const fetchReports = async () => {
        if (!isAdmin) return; // Only admins can fetch reports
        setLoadingReports(true);
        try {
            const data = await feedService.getReports();
            setReports(data);
        } catch (error: any) {
            if (error?.response?.status !== 403) {
                message.error(t('users_admin.fetch_reports_fail', 'Lỗi tải danh sách báo cáo!'));
            }
        } finally {
            setLoadingReports(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchReports();
    }, []);

    const handleAdd = () => {
        setEditingUser(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        form.setFieldsValue({
            ...user,
            passwordHash: '', // Không hiển thị password cũ
        });
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            // Hiển thị đúng thông báo server trả về thay vì câu mặc định.
            // api.delete đã bóc sẵn phần data nên dùng trực tiếp, không có res.data.
            const res = await api.delete<{ message?: string; Message?: string }>(`/api/users/${id}`);
            message.success(res?.message || res?.Message || t('users_admin.delete_success', 'Đã xóa người dùng thành công'));
            fetchUsers();
        } catch (error: any) {
            // Nêu rõ lý do thật từ server thay vì nuốt mất và báo chung chung.
            const serverMessage = error?.response?.data?.message || error?.response?.data?.Message;
            message.error(serverMessage || t('users_admin.delete_fail', 'Lỗi khi xóa người dùng'));
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();

            // Normalize role to ensure it matches backend expectation (Admin, Manager, etc.)
            if (values.role) {
                const role = values.role.toLowerCase();
                if (role === 'admin') values.role = 'Admin';
                else if (role === 'quản lý') values.role = 'Quản lý';
                else if (role === 'giám đốc') values.role = 'Giám đốc';
                else if (role === 'nhân viên') values.role = 'Nhân viên';
            }

            if (editingUser && editingUser.id) {
                // Update
                await api.put(`/api/users/${editingUser.id}`, values);
                message.success(t('users_admin.update_success', 'Cập nhật người dùng thành công'));
            } else {
                // Create
                await api.post('/api/users', values);
                message.success(t('users_admin.create_success', 'Tạo người dùng mới thành công'));
            }

            setIsModalVisible(false);
            fetchUsers();
        } catch (error: any) {
            if (error.errorFields) {
                // Validate error
                return;
            }
            message.error(error.response?.data?.message || t('users_admin.generic_error', 'Có lỗi xảy ra'));
        }
    };

    const columns: ColumnsType<User> = [
        {
            title: t('users_admin.col_fullname', 'Họ tên'),
            dataIndex: 'fullName',
            key: 'fullName',
            render: (text) => (
                <Space>
                    <UserOutlined />
                    {text}
                </Space>
            )
        },
        {
            title: t('users_admin.col_username', 'Tên đăng nhập'),
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: t('users_admin.col_email', 'Email'),
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: t('users_admin.col_role', 'Vai trò'),
            dataIndex: 'role',
            key: 'role',
            render: (role) => {
                let color = 'blue';
                if (role === 'Admin') color = 'red';
                else if (role === 'Giám đốc') color = 'gold';
                else if (role === 'Quản lý') color = 'green';

                return (
                    <Tag color={color}>
                        {role}
                    </Tag>
                );
            }
        },
        {
            title: t('users_admin.col_department', 'Phòng ban'),
            dataIndex: 'department',
            key: 'department',
        },
        {
            title: t('users_admin.col_faceid', 'Face ID'),
            key: 'faceId',
            render: (_, record) => {
                const isRegistered = (record.faceEmbeddings && record.faceEmbeddings.length > 0) || !!record.faceImageUrl;
                return (
                    <Tag color={isRegistered ? 'success' : 'default'} icon={isRegistered ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                        {isRegistered ? t('users_admin.faceid_registered', 'Đã đăng ký') : t('users_admin.faceid_not_registered', 'Chưa đăng ký')}
                    </Tag>
                );
            }
        },
        {
            title: t('users_admin.col_action', 'Thao tác'),
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    <Button
                        icon={<CameraOutlined />}
                        title={t('users_admin.register_faceid', 'Đăng ký Face ID')}
                        onClick={() => handleRegisterFace(record)}
                    />
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    />
                    <Popconfirm
                        title={t('users_admin.confirm_delete_title', 'Bạn có chắc muốn xóa tài khoản này?')}
                        onConfirm={() => record.id && handleDelete(record.id)}
                        okText={t('users_admin.confirm_delete_ok', 'Xóa')}
                        cancelText={t('users_admin.confirm_delete_cancel', 'Hủy')}
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            disabled={record.username === 'admin'}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];



    return (
        <div style={{ padding: 24 }}>
            <div className="usersPage">


                {/* Sub Header */}
                <div className="usersHeader">
                    <div className="title-section">
                        <span className="material-symbols-outlined header-icon-main">group</span>
                        <h1>{t('users_admin.title', 'Quản lý Nhân viên')}</h1>
                    </div>
                    {isMobile ? (
                        <div className="add-btn-container">
                            <Button
                                type="primary"
                                shape="circle"
                                icon={<PlusOutlined />}
                                size="large"
                                className="mobile-add-btn"
                                onClick={handleAdd}
                            />
                        </div>
                    ) : (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                            {t('users_admin.add_employee', 'Thêm nhân viên')}
                        </Button>
                    )}
                </div>

                {isMobile ? (
                    <div className="mobile-user-list">
                        {users.map(u => (
                            <div key={u.id} className="mobile-user-card">
                                <div className="card-header-row">
                                    <div className="user-info-brief">
                                        <div className="avatar-circle">
                                            <span className="material-symbols-outlined">person</span>
                                        </div>
                                        <div className="name-email">
                                            <div className="user-fullname">{u.fullName}</div>
                                            <div className="user-email">{u.email}</div>
                                        </div>
                                    </div>
                                    <div className={`mock-role-badge ${u.role === 'Admin' ? 'admin' : u.role === 'Quản lý' ? 'manager' : u.role === 'Giám đốc' ? 'director' : 'staff'}`}>
                                        {u.role?.toUpperCase()}
                                    </div>
                                </div>
                                <div className="card-body-row">
                                    <span className="material-symbols-outlined dept-icon">corporate_fare</span>
                                    <span>{t('users_admin.col_department', 'Phòng ban')}: {u.department || t('users_admin.not_updated', 'Chưa cập nhật')}</span>
                                </div>
                                <div className="card-body-row">
                                    <span className={`material-symbols-outlined status-icon ${(u.faceEmbeddings && u.faceEmbeddings.length > 0) || u.faceImageUrl ? 'success' : 'warn'}`}>
                                        {(u.faceEmbeddings && u.faceEmbeddings.length > 0) || u.faceImageUrl ? 'verified_user' : 'face'}
                                    </span>
                                    <span>{t('users_admin.col_faceid', 'Face ID')}: {(u.faceEmbeddings && u.faceEmbeddings.length > 0) || u.faceImageUrl ? t('users_admin.faceid_registered', 'Đã đăng ký') : t('users_admin.faceid_not_registered', 'Chưa đăng ký')}</span>
                                </div>
                                <div className="card-footer-row">
                                    <div className="action-buttons-wrap">
                                        <button className="mock-action-btn" onClick={() => handleRegisterFace(u)}>
                                            <span className="material-symbols-outlined">photo_camera</span>
                                        </button>
                                        <button className="mock-action-btn" onClick={() => handleEdit(u)}>
                                            <span className="material-symbols-outlined">edit</span>
                                        </button>
                                    </div>
                                    <Popconfirm
                                        title={t('users_admin.confirm_delete_title', 'Bạn có chắc muốn xóa tài khoản này?')}
                                        onConfirm={() => u.id && handleDelete(u.id)}
                                        okText={t('users_admin.confirm_delete_ok', 'Xóa')}
                                        cancelText={t('users_admin.confirm_delete_cancel', 'Hủy')}
                                        disabled={u.username === 'admin'}
                                    >
                                        <button className={`mock-action-btn delete ${u.username === 'admin' ? 'disabled' : ''}`} disabled={u.username === 'admin'}>
                                            <span className="material-symbols-outlined">delete</span>
                                        </button>
                                    </Popconfirm>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Table
                        columns={columns}
                        dataSource={users}
                        rowKey="id"
                        loading={loading}
                    />
                )}

                {/* Reports Section */}
                <div className="reports-section-mock">
                    <div className="section-title-mock">
                        <span className="material-symbols-outlined report-icon-mock">description</span>
                        <h2>{t('users_admin.reports_title', 'Báo cáo vi phạm')}</h2>
                    </div>

                    {isMobile ? (
                        <div className="mobile-empty-reports">
                            <div className="empty-box-wrap">
                                <span className="material-symbols-outlined">inventory_2</span>
                            </div>
                            <p>{t('users_admin.reports_empty', 'Trống')}</p>
                        </div>
                    ) : (
                        <Table
                            dataSource={reports}
                            loading={loadingReports}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            scroll={{ x: 'max-content' }}
                        >
                            <Table.Column
                                title={t('users_admin.col_post', 'Bài viết')}
                                dataIndex="postId"
                                key="postId"
                                width={200}
                                render={(postId: string) => (
                                    <a
                                        href={`/feed?postId=${postId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#1890ff', textDecoration: 'underline' }}
                                    >
                                        {t('users_admin.view_post', 'Xem bài viết')} #{postId.slice(-8)}
                                    </a>
                                )}
                            />
                            <Table.Column
                                title={t('users_admin.col_reporter', 'Người báo cáo')}
                                dataIndex="reporterName"
                                key="reporterName"
                                width={150}
                            />
                            <Table.Column
                                title={t('users_admin.col_reason', 'Lý do')}
                                dataIndex="reason"
                                key="reason"
                                ellipsis
                                width={250}
                            />
                            <Table.Column
                                title={t('users_admin.col_time', 'Thời gian')}
                                dataIndex="createdAt"
                                key="createdAt"
                                width={160}
                                render={(date: string) => new Date(date).toLocaleString('vi-VN')}
                            />
                            <Table.Column
                                title={t('users_admin.col_status', 'Trạng thái')}
                                dataIndex="status"
                                key="status"
                                width={120}
                                render={(status: string) => {
                                    const colorMap: Record<string, string> = {
                                        'Pending': 'orange',
                                        'Reviewed': 'blue',
                                        'Resolved': 'green',
                                        'Dismissed': 'gray'
                                    };
                                    return <Tag color={colorMap[status] || 'default'}>{status || 'Pending'}</Tag>;
                                }}
                            />
                            <Table.Column
                                title={t('users_admin.col_action', 'Thao tác')}
                                key="action"
                                width={150}
                                render={(_, record: any) => (
                                    <Space>
                                        <Button size="small" type="primary">
                                            {t('users_admin.resolve', 'Xử lý')}
                                        </Button>
                                        <Button size="small" danger>
                                            {t('users_admin.dismiss', 'Bỏ qua')}
                                        </Button>
                                    </Space>
                                )}
                            />
                        </Table>
                    )}
                </div>
            </div>

            {/* Add/Edit User Modal */}
            <Modal
                title={editingUser ? t('users_admin.modal_edit_title', 'Chỉnh sửa nhân viên') : t('users_admin.modal_add_title', 'Thêm nhân viên mới')}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
            >
                <Form
                    form={form}
                    layout="vertical"
                >
                    <Form.Item
                        name="fullName"
                        label={t('users_admin.col_fullname', 'Họ tên')}
                        rules={[{ required: true, message: t('users_admin.form_fullname_required', 'Vui lòng nhập họ tên!') }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="username"
                        label={t('users_admin.col_username', 'Tên đăng nhập')}
                        rules={[{ required: true, message: t('users_admin.form_username_required', 'Vui lòng nhập tên đăng nhập!') }]}
                    >
                        <Input disabled={!!editingUser} />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label={t('users_admin.col_email', 'Email')}
                        rules={[
                            { required: true, message: t('users_admin.form_email_required', 'Vui lòng nhập email!') },
                            { type: 'email', message: t('users_admin.form_email_invalid', 'Email không hợp lệ!') }
                        ]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="passwordHash"
                        label={editingUser ? t('users_admin.form_password_label_edit', 'Mật khẩu mới (để trống nếu không đổi)') : t('users_admin.form_password_label_add', 'Mật khẩu')}
                        rules={[{ required: !editingUser, message: t('users_admin.form_password_required', 'Vui lòng nhập mật khẩu!') }]}
                    >
                        <Input.Password />
                    </Form.Item>
                    <Form.Item
                        name="role"
                        label={t('users_admin.col_role', 'Vai trò')}
                        rules={[{ required: true, message: t('users_admin.form_role_required', 'Vui lòng chọn vai trò!') }]}
                    >
                        <Select>
                            <Option value="Admin">Admin</Option>
                            <Option value="Giám đốc">Giám đốc</Option>
                            <Option value="Quản lý">Quản lý</Option>
                            <Option value="Nhân viên">Nhân viên</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="department"
                        label={t('users_admin.col_department', 'Phòng ban')}
                        rules={[{ required: true, message: t('users_admin.form_department_required', 'Vui lòng chọn phòng ban!') }]}
                    >
                        <Select>
                            {DEPARTMENTS.map(dept => (
                                <Option key={dept} value={dept}>{dept}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Face Registration Modal */}
            <FaceRegistrationModal
                visible={isFaceModalVisible}
                onCancel={() => setIsFaceModalVisible(false)}
                userId={selectedUserForFace?.id || null}
                userName={selectedUserForFace?.name || ''}
            />
        </div>
    );
}

export default UsersPage;
