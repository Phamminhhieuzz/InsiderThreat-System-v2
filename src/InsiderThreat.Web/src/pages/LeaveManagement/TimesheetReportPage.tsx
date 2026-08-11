import React, { useEffect, useState } from 'react';
import { Layout, Typography, Card, Table, Button, DatePicker, Tag, message, Tooltip, Space } from 'antd';
import { DownloadOutlined, FieldTimeOutlined, CheckCircleOutlined, WarningOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import NavigationBar from '../../components/NavigationBar';
import LeftSidebar from '../../components/LeftSidebar';
import api from '../../services/api';
import styles from './TimesheetReportPage.module.css';


const { Content } = Layout;
const { Title, Text } = Typography;

interface TimesheetSummary {
    userId: string;
    userName: string;
    department: string;
    totalWorkingDays: number;
    onTimeDays: number;
    lateDays: number;
    absentDays: number;
    totalCheckIns: number;
}

const TimesheetReportPage = () => {
    const [summaries, setSummaries] = useState<TimesheetSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(dayjs());

    useEffect(() => {
        fetchSummary(selectedMonth.month() + 1, selectedMonth.year());
    }, [selectedMonth]);

    const fetchSummary = async (month: number, year: number) => {
        setLoading(true);
        try {
            const data = await api.get<TimesheetSummary[]>(`/api/Attendance/summary?month=${month}&year=${year}`);
            setSummaries(data);
        } catch (error: any) {
            console.error('Failed to fetch timesheet summary:', error);
            message.error(error.response?.data?.message || 'Không có quyền truy cập hoặc lỗi máy chủ.');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        message.info('Tính năng xuất file CSV/Excel đang được phát triển.');
        // In a real scenario, convert `summaries` to CSV and trigger download
    };

    const columns = [
        {
            title: 'Nhân viên',
            dataIndex: 'userName',
            key: 'userName',
            render: (text: string, record: TimesheetSummary) => (
                <div>
                    <Text strong>{text}</Text>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{record.department || 'Chưa cập nhật PB'}</div>
                </div>
            )
        },
        {
            title: 'Tổng ngày làm',
            dataIndex: 'totalWorkingDays',
            key: 'totalWorkingDays',
            align: 'center' as const
        },
        {
            title: 'Đúng giờ',
            dataIndex: 'onTimeDays',
            key: 'onTimeDays',
            align: 'center' as const,
            render: (val: number) => <Tag color="success" icon={<CheckCircleOutlined />}>{val}</Tag>
        },
        {
            title: 'Đi muộn',
            dataIndex: 'lateDays',
            key: 'lateDays',
            align: 'center' as const,
            render: (val: number) => val > 0 ? <Tag color="warning" icon={<FieldTimeOutlined />}>{val}</Tag> : <Text type="secondary">-</Text>
        },
        {
            title: 'Vắng mặt',
            dataIndex: 'absentDays',
            key: 'absentDays',
            align: 'center' as const,
            render: (val: number) => val > 0 ? <Tag color="error" icon={<WarningOutlined />}>{val}</Tag> : <Text type="secondary">-</Text>
        },
        {
            title: 'Hiệu suất (Ngày đi làm / Tổng)',
            key: 'performance',
            render: (_: any, record: TimesheetSummary) => {
                const percent = Math.round(((record.onTimeDays + record.lateDays) / (record.totalWorkingDays || 1)) * 100);
                let color = '#10b981';
                if (percent < 80) color = '#ef4444';
                else if (percent < 95) color = '#f59e0b';
                
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, backgroundColor: '#e5e7eb', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${percent}%`, backgroundColor: color, height: '100%' }} />
                        </div>
                        <Text strong style={{ color }}>{percent}%</Text>
                    </div>
                );
            }
        }
    ];

    const totalEmployees = summaries.length;
    const avgAttendance = totalEmployees > 0 
        ? Math.round(summaries.reduce((acc, curr) => acc + ((curr.onTimeDays + curr.lateDays) / (curr.totalWorkingDays || 1)), 0) / totalEmployees * 100) 
        : 0;
    const totalLate = summaries.reduce((acc, curr) => acc + curr.lateDays, 0);

    return (
        <Layout className={styles.layout}>
            <NavigationBar />
            <Content className={styles.content}>
                <div className={styles.container}>
                    <LeftSidebar />
                    <div className={styles.mainContent}>
                        <div className={styles.header}>
                            <div>
                                <Title level={3} className={styles.pageTitle}>Báo Cáo Bảng Công</Title>
                                <Text type="secondary">Tổng hợp dữ liệu FaceCheckIn theo tháng</Text>
                            </div>
                            <Space>
                                <DatePicker 
                                    picker="month" 
                                    value={selectedMonth} 
                                    onChange={(date) => date && setSelectedMonth(date)}
                                    format="MM/YYYY"
                                    allowClear={false}
                                />
                                <Button type="primary" icon={<FileExcelOutlined />} onClick={handleExport}>
                                    Xuất Excel
                                </Button>
                            </Space>
                        </div>

                        {/* Summary Cards */}
                        <div className={styles.statsGrid}>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{totalEmployees}</div>
                                    <div className={styles.statLabel}>Nhân viên</div>
                                </div>
                            </Card>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue} style={{ color: avgAttendance > 90 ? '#10b981' : '#f59e0b' }}>
                                        {avgAttendance}%
                                    </div>
                                    <div className={styles.statLabel}>Tỉ lệ đi làm TB</div>
                                </div>
                            </Card>
                            <Card className={styles.statCard} bordered={false}>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue} style={{ color: '#ef4444' }}>{totalLate}</div>
                                    <div className={styles.statLabel}>Tổng lượt đi muộn</div>
                                </div>
                            </Card>
                        </div>

                        {/* Timesheet Table */}
                        <Card className={styles.tableCard} title={`Chi tiết tháng ${selectedMonth.format('MM/YYYY')}`} bordered={false}>
                            <Table 
                                columns={columns} 
                                dataSource={summaries} 
                                rowKey="userId" 
                                loading={loading}
                                pagination={{ pageSize: 20 }}
                                size="middle"
                            />
                        </Card>
                    </div>
                </div>
            </Content>
        </Layout>
    );
};

export default TimesheetReportPage;
