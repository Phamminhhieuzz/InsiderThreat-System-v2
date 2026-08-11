import { useState } from 'react';
import { Modal, Form, Input, Button, message, Typography, List, Space } from 'antd';
import { LockOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { api } from '../services/api';

const { Text, Title } = Typography;

interface Props {
    visible: boolean;
    username: string;
    oldPassword: string;
    onSuccess: () => void;
    onCancel: () => void;
}

export default function ChangePasswordModal({ visible, username, oldPassword, onSuccess, onCancel }: Props) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [passwordValue, setPasswordValue] = useState('');

    // Ràng buộc mật khẩu (Regex matching)
    const requirements = [
        { label: 'Chữ cái đầu phải viết hoa', test: (p: string) => /^[A-Z]/.test(p) },
        { label: 'Có ít nhất 1 chữ số', test: (p: string) => /\d/.test(p) },
        { label: 'Có ít nhất 1 ký tự đặc biệt (@$!%*?&)', test: (p: string) => /[@$!%*?&]/.test(p) },
        { label: 'Độ dài tối thiểu 8 ký tự', test: (p: string) => p.length >= 8 },
    ];

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            await api.post('/api/auth/change-first-password', {
                username,
                oldPassword,
                newPassword: values.newPassword
            });
            message.success('Mật khẩu đã được cập nhật thành công!');
            onSuccess();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Không thể đổi mật khẩu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={<Title level={4} style={{ margin: 0 }}>🛡️ Thiết lập mật khẩu mới</Title>}
            open={visible}
            footer={null}
            closable={false}
            maskClosable={false}
            width={450}
        >
            <div style={{ marginBottom: 20 }}>
                <Text type="secondary">
                    Đây là lần đầu tiên bạn đăng nhập. Vì lý do an ninh, vui lòng thay đổi mật khẩu mặc định để tiếp tục.
                </Text>
            </div>

            <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item
                    label="Mật khẩu mới"
                    name="newPassword"
                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu mới' }]}
                >
                    <Input.Password 
                        prefix={<LockOutlined />} 
                        placeholder="Nhập mật khẩu mới"
                        onChange={(e) => setPasswordValue(e.target.value)}
                    />
                </Form.Item>

                <Form.Item
                    label="Xác nhận mật khẩu"
                    name="confirmPassword"
                    dependencies={['newPassword']}
                    rules={[
                        { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('newPassword') === value) {
                                    return Promise.resolve();
                                }
                                return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                            },
                        }),
                    ]}
                >
                    <Input.Password prefix={<LockOutlined />} placeholder="Nhập lại mật khẩu mới" />
                </Form.Item>

                <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 8, marginBottom: 24 }}>
                    <Text strong style={{ fontSize: 12 }}>TIÊU CHUẨN BẢO MẬT:</Text>
                    <List
                        size="small"
                        dataSource={requirements}
                        renderItem={req => (
                            <List.Item style={{ padding: '4px 0', border: 'none' }}>
                                <Space>
                                    {req.test(passwordValue) ? 
                                        <CheckCircleOutlined style={{ color: '#52c41a' }} /> : 
                                        <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                    }
                                    <Text type={req.test(passwordValue) ? 'success' : 'secondary'} style={{ fontSize: 13 }}>
                                        {req.label}
                                    </Text>
                                </Space>
                            </List.Item>
                        )}
                    />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <Button block onClick={onCancel} disabled={loading}>
                        Hủy bỏ
                    </Button>
                    <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={loading} 
                        block
                        disabled={!requirements.every(r => r.test(passwordValue))}
                    >
                        Cập nhật mật khẩu
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
