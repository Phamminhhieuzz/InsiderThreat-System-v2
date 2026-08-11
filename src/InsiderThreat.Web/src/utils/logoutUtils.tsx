import { Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

/**
 * Shows a consistent logout confirmation modal.
 * @param onConfirm Callback function to execute when user confirms logout.
 */
export const confirmLogout = (onConfirm: () => void) => {
    Modal.confirm({
        title: 'Confirm Logout',
        icon: <ExclamationCircleOutlined style={{ color: '#ef4444' }} />,
        content: 'Are you sure you want to log out?',
        okText: 'Logout',
        okType: 'danger',
        cancelText: 'Cancel',
        className: 'dark-theme-modal',
        centered: true,
        maskClosable: true,
        autoFocusButton: null,
        onOk() {
            onConfirm();
        },
    });
};
