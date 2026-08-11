import React, { useMemo } from 'react';
import { Card, Row, Col, Typography, Space } from 'antd';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { FileTextOutlined, PieChartOutlined, LineChartOutlined } from '@ant-design/icons';
import type { LogEntry } from '../types';

const { Title, Text } = Typography;

interface Props {
    logs: LogEntry[];
    loading: boolean;
}

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];

const DocumentAnalyticsChart: React.FC<Props> = ({ logs, loading }) => {
    
    // 📊 PHÂN TÍCH DỮ LIỆU
    const stats = useMemo(() => {
        if (!logs || logs.length === 0) return { actions: [], machines: [] };

        const actionMap = new Map<string, number>();
        const machineMap = new Map<string, number>();

        logs.forEach(log => {
            // Thống kê hành động (Read, Write, Download...)
            const action = log.actionTaken || 'Unknown';
            actionMap.set(action, (actionMap.get(action) || 0) + 1);

            // Thống kê theo máy tính
            const machine = log.computerName || 'Unknown';
            machineMap.set(machine, (machineMap.get(machine) || 0) + 1);
        });

        return {
            actions: Array.from(actionMap.entries()).map(([name, value]) => ({ name, value })),
            machines: Array.from(machineMap.entries()).map(([name, value]) => ({ name, value }))
        };
    }, [logs]);

    if (loading && logs.length === 0) return <Card loading variant="borderless" style={{ marginBottom: 24 }} />;

    return (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {/* Biểu đồ phân bổ hành động */}
            <Col xs={24} md={10}>
                <Card 
                    title={<Space><PieChartOutlined /> Phân loại hành động</Space>} 
                    variant="borderless" 
                    style={{ borderRadius: 12, height: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                >
                    <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={stats.actions}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {stats.actions.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </Col>

            {/* Biểu đồ máy tính truy cập nhiều nhất */}
            <Col xs={24} md={14}>
                <Card 
                    title={<Space><LineChartOutlined /> Tần suất truy cập theo máy tính</Space>} 
                    variant="borderless" 
                    style={{ borderRadius: 12, height: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                >
                    <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={stats.machines} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#1890ff" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '12px' }} />
                                <YAxis axisLine={false} tickLine={false} style={{ fontSize: '12px' }} />
                                <Tooltip />
                                <Area type="monotone" dataKey="value" stroke="#1890ff" fillOpacity={1} fill="url(#colorValue)" name="Số lần truy cập" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </Col>
        </Row>
    );
};

export default DocumentAnalyticsChart;
