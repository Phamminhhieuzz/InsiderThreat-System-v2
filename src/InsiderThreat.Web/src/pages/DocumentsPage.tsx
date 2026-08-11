import { useState, useEffect } from 'react';
import { Table, Button, message, Tag, Space, Card, Typography } from 'antd';
import { FileTextOutlined, ReloadOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import type { LogEntry } from '../types';
import type { ColumnsType } from 'antd/es/table';
import DocumentAnalyticsChart from '../components/DocumentAnalyticsChart';


const { Title, Text } = Typography;

function DocumentsPage() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            // Lấy logs với filter type=FileAccess
            const data = await api.get<LogEntry[]>('/api/logs?type=FileAccess&limit=50');
            setLogs(data);
        } catch (error) {
            console.error('Error fetching document logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 15000);
        return () => clearInterval(interval);
    }, []);

    const columns: ColumnsType<LogEntry> = [
        {
            title: t('docs.col_doc', 'Tài liệu / File'),
            dataIndex: 'message',
            key: 'message',
            render: (text) => (
                <Space>
                    <FileTextOutlined style={{ color: '#1890ff' }} />
                    <span style={{ wordBreak: 'break-all' }}>{text}</span>
                </Space>
            )
        },
        {
            title: t('docs.col_account', 'Tài khoản / Máy tính'),
            dataIndex: 'computerName',
            key: 'computerName',
        },
        {
            title: t('docs.col_action', 'Hành động'),
            dataIndex: 'actionTaken',
            key: 'actionTaken',
            render: (action) => {
                let color = 'default';
                if (action === 'Read') color = 'blue';
                if (action === 'Write') color = 'orange';
                if (action === 'Delete') color = 'red';
                if (action === 'Create' || action === 'Created') color = 'green';
                if (action === 'Download') color = 'cyan';
                if (action === 'Cảnh báo Camera' || action === 'CameraWarning') color = 'volcano';
                return <Tag color={color}>{action}</Tag>;
            }
        },
        {
            title: t('docs.col_time', 'Thời gian'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (timestamp: string) => new Date(timestamp).toLocaleString('vi-VN'),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <DatabaseOutlined /> {t('docs.title', 'Nhật ký Truy cập Tài liệu')}
                    </Title>
                    <Text type="secondary">Theo dõi và phân tích lịch sử tương tác với các tệp tin trong hệ thống.</Text>
                </div>
                <Button 
                    type="primary" 
                    icon={<ReloadOutlined />} 
                    onClick={fetchLogs}
                    loading={loading}
                >
                    {t('docs.btn_refresh', 'Làm mới')}
                </Button>
            </div>

            {/* 📊 BIỂU ĐỒ PHÂN TÍCH TÀI LIỆU */}
            <DocumentAnalyticsChart logs={logs} loading={loading} />

            <Card variant="borderless" style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {isMobile ? (
                    <div className="mobile-incident-list" style={{ padding: 0 }}>
                        {logs.length === 0 ? (
                            <div className="empty-incidents">
                                <span className="material-symbols-outlined empty-icon">description</span>
                                <h3>{t('docs.empty_text', 'Chưa có nhật ký truy cập tài liệu nào')}</h3>
                            </div>
                        ) : (
                            <div className="incident-cards-container">
                                {logs.map(log => {
                                    let actionColor = 'default';
                                    if (log.actionTaken === 'Read') actionColor = 'blue';
                                    if (log.actionTaken === 'Write') actionColor = 'orange';
                                    if (log.actionTaken === 'Delete') actionColor = 'red';
                                    if (log.actionTaken === 'Create' || log.actionTaken === 'Created') actionColor = 'green';
                                    if (log.actionTaken === 'Download') actionColor = 'cyan';
                                    if (log.actionTaken === 'Cảnh báo Camera' || log.actionTaken === 'CameraWarning') actionColor = 'volcano';

                                    return (
                                        <div key={log.id} className="incident-card" style={{ borderRadius: 12 }}>
                                            <div className="severity-bar" style={{ backgroundColor: actionColor === 'volcano' ? '#f5222d' : 'var(--ant-primary-color)' }} />
                                            <div className="incident-card-content" style={{ padding: 12 }}>
                                                <div className="incident-card-header">
                                                    <Tag color={actionColor} style={{ margin: 0, fontWeight: 'bold' }}>{log.actionTaken}</Tag>
                                                    <span className="time-ago" style={{ textAlign: 'right' }}>
                                                        {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                                                    </span>
                                                </div>

                                                <div className="device-info" style={{ gap: 12 }}>
                                                    <FileTextOutlined style={{ fontSize: 20, color: '#1890ff', marginTop: 4 }} />
                                                    <div className="device-details">
                                                        <h3 className="device-name" style={{ fontSize: 13, wordBreak: 'break-all' }}>{log.message}</h3>
                                                        <p className="incident-desc" style={{ fontSize: 12 }}>
                                                            <strong>PC/User:</strong> {log.computerName}
                                                        </p>
                                                    </div>
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
                        dataSource={logs}
                        rowKey="id"
                        loading={loading}
                        locale={{ emptyText: t('docs.empty_text', 'Chưa có nhật ký truy cập tài liệu nào') }}
                    />
                )}
            </Card>
        </div>
    );
}

export default DocumentsPage;
