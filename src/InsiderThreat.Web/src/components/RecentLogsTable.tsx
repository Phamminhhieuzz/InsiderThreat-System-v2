import { useState, useEffect } from 'react';
import { Table, Tag, Select, Space } from 'antd';
import { api } from '../services/api';
import type { LogEntry } from '../types';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

interface RecentLogsTableProps {
    defaultFilter?: string;
}

function RecentLogsTable({ defaultFilter = 'All' }: RecentLogsTableProps) {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<string>(defaultFilter);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await api.get<LogEntry[]>('/api/logs');
            setLogs(data.slice(0, 20)); // Lấy 20 logs mới nhất
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 10000); // Auto-refresh every 10s
        return () => clearInterval(interval);
    }, []);

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'Critical': return '#ef4444';
            case 'Warning': return '#f59e0b';
            case 'Info': return '#3b82f6';
            default: return '#64748b';
        }
    };

    const getSeverityLabel = (severity: string) => {
        switch (severity) {
            case 'Critical': return 'HIGH SEVERITY';
            case 'Warning': return 'MEDIUM SEVERITY';
            case 'Info': return 'LOW SEVERITY';
            default: return severity.toUpperCase();
        }
    };

    const getTimeAgo = (timestamp: string) => {
        const seconds = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} mins ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hours ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    const filteredLogs = filter === 'All'
        ? logs
        : logs.filter((log) => log.severity === filter);

    const columns: ColumnsType<LogEntry> = [
        {
            title: 'Mức độ',
            dataIndex: 'severity',
            key: 'severity',
            width: 100,
            render: (severity: string) => (
                <Tag color={severity === 'Critical' ? 'red' : severity === 'Warning' ? 'orange' : 'blue'}>{severity}</Tag>
            ),
        },
        {
            title: 'Thông báo',
            dataIndex: 'message',
            key: 'message',
            width: 400,
            ellipsis: true,
        },
        {
            title: 'Máy tính',
            dataIndex: 'computerName',
            key: 'computerName',
            width: 150,
        },
        {
            title: 'IP',
            dataIndex: 'ipAddress',
            key: 'ipAddress',
            width: 130,
        },
        {
            title: 'Hành động',
            dataIndex: 'actionTaken',
            key: 'actionTaken',
            width: 100,
            render: (action: string) => {
                const color = action === 'Blocked' ? 'red' : 'green';
                return <Tag color={color}>{action}</Tag>;
            },
        },
        {
            title: 'Thời gian',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (timestamp: string) => new Date(timestamp).toLocaleString('vi-VN'),
        },
    ];

    const urgentCount = logs.filter(l => l.severity === 'Critical' || l.severity === 'Warning').length;

    if (isMobile) {
        return (
            <div className="mobile-incident-list">
                <div className="mobile-filter-row">
                    <span className="recent-title">RECENT INCIDENTS</span>
                    {urgentCount > 0 && <Tag color="error" className="urgent-badge">{urgentCount} URGENT</Tag>}
                </div>

                {loading && logs.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">
                        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
                        <p>Đang tải sự cố...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="empty-incidents">
                        <span className="material-symbols-outlined empty-icon">check_circle</span>
                        <h3>Hệ thống an toàn</h3>
                        <p>Không phát hiện sự cố nào trong danh mục này.</p>
                    </div>
                ) : (
                    <div className="incident-cards-container">
                        {filteredLogs.map(log => (
                            <div key={log.id} className="incident-card">
                                <div className="severity-bar" style={{ backgroundColor: getSeverityColor(log.severity) }} />
                                <div className="incident-card-content">
                                    <div className="incident-card-header">
                                        <div className="severity-tag" style={{ backgroundColor: `${getSeverityColor(log.severity)}15`, color: getSeverityColor(log.severity) }}>
                                            {getSeverityLabel(log.severity)}
                                        </div>
                                        <span className="time-ago">{getTimeAgo(log.timestamp)}</span>
                                        <button className="more-btn">
                                            <span className="material-symbols-outlined">more_vert</span>
                                        </button>
                                    </div>

                                    <div className="device-info">
                                        <span className="material-symbols-outlined device-icon">
                                            {log.message.toLowerCase().includes('storage') ? 'usb' : 'mouse'}
                                        </span>
                                        <div className="device-details">
                                            <h3 className="device-name">{log.message.split('detected')[0].split('signature')[0].trim()}</h3>
                                            <p className="incident-desc">{log.message}</p>
                                        </div>
                                    </div>

                                    <div className="attempt-info">
                                        <div className="attempt-avatar">
                                            <span className="material-symbols-outlined">person</span>
                                        </div>
                                        <div className="attempt-details">
                                            <span className="attempt-label">ATTEMPTED BY</span>
                                            <div className="attempt-user">
                                                <span className="user-name">Employee User</span>
                                                <span className="user-dept">(Dept. {log.computerName})</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="incident-actions">
                                        <button className="action-btn block-btn">
                                            <span className="material-symbols-outlined">block</span>
                                            Block Device
                                        </button>
                                        <button className="action-btn dismiss-btn">
                                            <span className="material-symbols-outlined">visibility_off</span>
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <div>
                <span style={{ marginRight: 8 }}>Lọc theo mức độ:</span>
                <Select value={filter} onChange={setFilter} style={{ width: 150 }}>
                    <Option value="All">Tất cả</Option>
                    <Option value="Critical">Critical</Option>
                    <Option value="Warning">Warning</Option>
                    <Option value="Info">Info</Option>
                </Select>
            </div>

            <Table
                columns={columns}
                dataSource={filteredLogs}
                rowKey={(record) => record.id || record.timestamp}
                loading={loading}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 1000 }}
                locale={{ emptyText: 'Chưa có log nào' }}
            />
        </Space>
    );
}

export default RecentLogsTable;
