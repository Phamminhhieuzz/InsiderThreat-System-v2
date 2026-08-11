import React, { useEffect, useState, useMemo } from 'react';
import { Card, Space, Typography, Spin, Empty } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../services/api';
import { UsbOutlined } from '@ant-design/icons';
import { useTheme } from '../context/ThemeContext';

const { Text, Title } = Typography;

interface UsbStat {
    machineName: string;
    count: number;
}

const COLORS = ['#1890ff', '#f5222d', '#faad14', '#52c41a', '#722ed1', '#eb2f96'];

const UsbAnalyticsChart: React.FC = () => {
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';
    const [data, setData] = useState<UsbStat[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // Lấy 200 log gần nhất để phân tích (Điều chỉnh theo nhu cầu)
            const response = await api.get<any>('/api/logs?pageSize=200');
            const logs = Array.isArray(response) ? response : (response.data || []);

            // Thống kê theo máy tính
            const statsMap = new Map<string, number>();
            logs.forEach((log: any) => {
                if (log.logType?.includes('USB') || log.message?.includes('USB')) {
                    const machine = log.computerName || 'Unknown';
                    statsMap.set(machine, (statsMap.get(machine) || 0) + 1);
                }
            });

            const formattedData = Array.from(statsMap.entries())
                .map(([machineName, count]) => ({ machineName, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10); // Lấy Top 10 máy

            setData(formattedData);
        } catch (error) {
            console.error('Failed to fetch USB stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // Refresh mỗi 30 giây
        const timer = setInterval(fetchStats, 30000);
        return () => clearInterval(timer);
    }, []);

    if (loading && data.length === 0) return <Card loading variant="borderless" />;

    return (
        <Card 
            title={<Space><UsbOutlined /> Top máy tính có hoạt động USB nhiều nhất</Space>} 
            variant="borderless" 
            style={{ borderRadius: 12, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
        >
            {data.length > 0 ? (
                <div style={{ width: '100%', height: 250 }}>
                    <ResponsiveContainer>
                        <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#f0f0f0'} strokeOpacity={isDarkMode ? 0.5 : 1} />
                            <XAxis 
                                dataKey="machineName" 
                                axisLine={false} 
                                tickLine={false} 
                                style={{ fontSize: '12px' }} 
                                stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                style={{ fontSize: '12px' }} 
                                stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                            />
                            <Tooltip 
                                cursor={{fill: isDarkMode ? 'rgba(255,255,255,0.05)' : '#f5f5f5'}}
                                contentStyle={{ 
                                    borderRadius: 12, 
                                    border: 'none', 
                                    boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
                                    background: isDarkMode ? '#1e293b' : '#ffffff',
                                    color: isDarkMode ? '#f1f5f9' : '#0f172a'
                                }} 
                            />
                            <Bar dataKey="count" name="Số lần hoạt động" radius={[4, 4, 0, 0]} barSize={40}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <Empty description="Chưa có dữ liệu hoạt động USB" />
            )}
        </Card>
    );
};

export default UsbAnalyticsChart;
