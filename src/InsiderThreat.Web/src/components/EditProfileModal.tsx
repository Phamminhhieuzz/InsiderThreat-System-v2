import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { userService } from '../services/userService';
import type { User } from '../types';

interface EditProfileModalProps {
    visible: boolean;
    onCancel: () => void;
    user: User | null;
    onUpdate: (updatedUser: User) => void;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({ visible, onCancel, user, onUpdate }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    // Initial values side effect when modal opens
    React.useEffect(() => {
        if (visible && user) {
            form.setFieldsValue({
                fullName: user.fullName,
                department: user.department,
                email: user.email,
                phoneNumber: user.phoneNumber,
                bio: user.bio,
            });
        }
    }, [visible, user, form]);

    const handleSubmit = async (values: Partial<User>) => {
        if (!user || (!user.id && user.id !== '')) return;

        setLoading(true);
        try {
            await userService.updateUser(user.id!, values);
            message.success('Cập nhật hồ sơ thành công!');
            onUpdate({ ...user, ...values }); // Merge updated values
            onCancel(); // Close modal on success
        } catch (error) {
            console.error('Failed to update profile:', error);
            message.error('Có lỗi xảy ra khi cập nhật hồ sơ, vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={<div className="text-xl font-bold text-[var(--color-text-main)]">Chỉnh sửa hồ sơ (Edit Profile)</div>}
            open={visible}
            onCancel={onCancel}
            footer={null}
            destroyOnClose
            centered
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                className="mt-6"
            >
                <Form.Item
                    label={<span className="font-semibold text-[var(--color-text-main)]">Họ và tên (Full Name)</span>}
                    name="fullName"
                    rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
                >
                    <Input placeholder="Nguyễn Văn A" className="h-[42px] rounded-lg" />
                </Form.Item>

                <Form.Item
                    label={<span className="font-semibold text-[var(--color-text-main)]">Phòng ban (Department)</span>}
                    name="department"
                >
                    <Input placeholder="Ví dụ: Information Security (SecOps)" className="h-[42px] rounded-lg" />
                </Form.Item>

                <Form.Item
                    label={<span className="font-semibold text-[var(--color-text-main)]">Email công việc</span>}
                    name="email"
                    rules={[
                        { required: true, message: 'Vui lòng nhập email' },
                        { type: 'email', message: 'Email không hợp lệ' }
                    ]}
                >
                    <Input placeholder="ví dụ: insider.threat@corporate.com" className="h-[42px] rounded-lg" />
                </Form.Item>

                <Form.Item
                    label={<span className="font-semibold text-[var(--color-text-main)]">Số điện thoại</span>}
                    name="phoneNumber"
                >
                    <Input placeholder="+1 (555) 902-3412" className="h-[42px] rounded-lg" />
                </Form.Item>

                <Form.Item
                    label={<span className="font-semibold text-[var(--color-text-main)]">Giới thiệu ngắn (Bio)</span>}
                    name="bio"
                >
                    <Input.TextArea placeholder="Thông tin thêm về bạn..." rows={3} className="rounded-lg" />
                </Form.Item>

                <div className="flex justify-end gap-3 mt-6">
                    <Button onClick={onCancel} className="h-[42px] px-6 rounded-lg font-medium">
                        Hủy
                    </Button>
                    <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={loading}
                        className="h-[42px] px-6 rounded-lg font-medium bg-blue-600 hover:bg-blue-700"
                    >
                        Lưu thay đổi
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default EditProfileModal;
