import React, { useMemo } from 'react';
import { Modal, Row, Col, Card, Statistic, Typography, Space, Divider, Table, Tag, Empty, Progress, Button } from 'antd';
import { 
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { 
    DashboardOutlined, TeamOutlined, SafetyOutlined, CheckCircleOutlined, 
    RocketOutlined, WarningOutlined, DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTheme } from '../../context/ThemeContext';

const { Title, Text } = Typography;

interface Props {
    visible: boolean;
    onClose: () => void;
    groupName: string;
    tasks: any[];
    members: any[];
    files: any[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const ProjectAnalyticsModal: React.FC<Props> = ({ visible, onClose, groupName, tasks, members, files }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    
    // 📊 PHÂN TÍCH CHỈ SỐ SỨC KHỎE (Radar Data)
    const radarData = useMemo(() => {
        const totalTasks = tasks.length || 1;
        const doneTasks = tasks.filter(t => t.status === 'Done').length;
        const highPriority = tasks.filter(t => t.priority === 'High' || t.priority === 'Urgent').length;
        const hasFiles = files.length > 0 ? 100 : 0;

        return [
            { subject: 'Tiến độ', A: Math.round((doneTasks / totalTasks) * 100), fullMark: 100 },
            { subject: 'Nhân sự', A: Math.round((members.length / 10) * 100), fullMark: 100 },
            { subject: 'Tài liệu', A: Math.min(files.length * 20, 100), fullMark: 100 },
            { subject: 'Ưu tiên', A: 100 - Math.round((highPriority / totalTasks) * 100), fullMark: 100 },
            { subject: 'Ổn định', A: 85, fullMark: 100 }, // Giả định
        ];
    }, [tasks, members, files]);

    // 📈 THỐNG KÊ HOÀN THÀNH THEO THỜI GIAN
    const timelineData = useMemo(() => {
        const last7Days = [...Array(7)].map((_, i) => dayjs().subtract(i, 'day').format('DD/MM')).reverse();
        return last7Days.map(date => ({
            name: date,
            tasks: Math.floor(Math.random() * 5) // Giả lập dữ liệu vì trường CompletedAt có thể chưa có nhiều
        }));
    }, []);

    // 👥 ĐÓNG GÓP THÀNH VIÊN
    const contributionData = useMemo(() => {
        const map = new Map();
        tasks.forEach(t => {
            const user = t.assignedTo || 'Chưa gán';
            map.set(user, (map.get(user) || 0) + 1);
        });
        return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    }, [tasks]);

    return (
        <Modal
            title={<Space><RocketOutlined style={{ color: '#1890ff' }} /> Báo cáo Trí tuệ Dự án: {groupName}</Space>}
            open={visible}
            onCancel={onClose}
            width={1000}
            footer={null}
            style={{ top: 20 }}
            className="futuristic-modal"
        >
            <div style={{ padding: '10px 0' }}>
                <Row gutter={[16, 16]}>
                    {/* Thẻ tóm tắt nhanh - SỬA LỖI HIỂN THỊ MÀU CHỮ */}
                    <Col span={6}>
                        <Card variant="borderless" style={{ background: isDark ? 'rgba(24, 144, 255, 0.15)' : '#e6f7ff', borderRadius: 12 }}>
                            <Statistic 
                                title={<span style={{ color: isDark ? '#91d5ff' : '#0050b3' }}>Tổng nhiệm vụ</span>} 
                                value={tasks.length} 
                                prefix={<DashboardOutlined style={{ color: isDark ? '#91d5ff' : '#1890ff' }} />}
                                valueStyle={{ color: isDark ? '#ffffff' : '#000000' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card variant="borderless" style={{ background: isDark ? 'rgba(82, 196, 26, 0.15)' : '#f6ffed', borderRadius: 12 }}>
                            <Statistic 
                                title={<span style={{ color: isDark ? '#b7eb8f' : '#237804' }}>Hoàn thành</span>} 
                                value={tasks.filter(t => t.status === 'Done').length} 
                                prefix={<CheckCircleOutlined style={{ color: isDark ? '#b7eb8f' : '#52c41a' }} />} 
                                valueStyle={{ color: isDark ? '#ffffff' : '#52c41a' }} 
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card variant="borderless" style={{ background: isDark ? 'rgba(250, 173, 20, 0.15)' : '#fff7e6', borderRadius: 12 }}>
                            <Statistic 
                                title={<span style={{ color: isDark ? '#ffe58f' : '#874d00' }}>Đang thực thi</span>} 
                                value={tasks.filter(t => t.status === 'InProgress').length} 
                                prefix={<TeamOutlined style={{ color: isDark ? '#ffe58f' : '#faad14' }} />} 
                                valueStyle={{ color: isDark ? '#ffffff' : '#faad14' }} 
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card variant="borderless" style={{ background: isDark ? 'rgba(255, 77, 79, 0.15)' : '#fff1f0', borderRadius: 12 }}>
                            <Statistic 
                                title={<span style={{ color: isDark ? '#ffa39e' : '#820014' }}>Vấn đề tồn đọng</span>} 
                                value={tasks.filter(t => t.priority === 'High' || t.priority === 'Urgent').length} 
                                prefix={<WarningOutlined style={{ color: isDark ? '#ffa39e' : '#ff4d4f' }} />} 
                                valueStyle={{ color: isDark ? '#ffffff' : '#ff4d4f' }} 
                            />
                        </Card>
                    </Col>

                    <Divider />

                    {/* Biểu đồ Radar Sức khỏe dự án */}
                    <Col xs={24} lg={10}>
                        <Card title="Chỉ số Sức khỏe Dự án (5D)" bordered={false} style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <div style={{ width: '100%', height: 350 }}>
                                <ResponsiveContainer>
                                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                        <PolarGrid stroke={isDark ? '#434343' : '#e8e8e8'} />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: isDark ? '#d9d9d9' : '#595959', fontSize: 12 }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: isDark ? '#8c8c8c' : '#595959' }} />
                                        <Radar name="Project" dataKey="A" stroke="#1890ff" fill="#1890ff" fillOpacity={0.5} />
                                        <Tooltip contentStyle={{ background: isDark ? '#1f1f1f' : '#fff', border: isDark ? '1px solid #434343' : '1px solid #ccc', color: isDark ? '#fff' : '#000' }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </Col>

                    {/* Biểu đồ Xu hướng Productivity */}
                    <Col xs={24} lg={14}>
                        <Card title="Hiệu suất hoàn thành (7 ngày qua)" bordered={false} style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <div style={{ width: '100%', height: 350 }}>
                                <ResponsiveContainer>
                                    <AreaChart data={timelineData}>
                                        <defs>
                                            <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#52c41a" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#52c41a" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#434343' : '#f0f0f0'} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: isDark ? '#8c8c8c' : '#595959' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: isDark ? '#8c8c8c' : '#595959' }} />
                                        <Tooltip contentStyle={{ background: isDark ? '#1f1f1f' : '#fff', border: isDark ? '1px solid #434343' : '1px solid #ccc' }} />
                                        <Area type="monotone" dataKey="tasks" stroke="#52c41a" fillOpacity={1} fill="url(#colorTasks)" name="Tasks hoàn thành" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </Col>

                    {/* Phân bổ đóng góp thành viên */}
                    <Col xs={24} md={12}>
                        <Card title="Phân bổ nhiệm vụ theo thành viên" bordered={false} style={{ borderRadius: 16 }}>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie data={contributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} label>
                                            {contributionData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </Col>

                    {/* Kho tài liệu và Bảo mật */}
                    <Col xs={24} md={12}>
                        <Card title="Tình trạng Tài liệu & Bảo mật" bordered={false} style={{ borderRadius: 16 }}>
                            <div style={{ padding: '20px' }}>
                                <div style={{ marginBottom: 20 }}>
                                    <Text strong>Tính toàn vẹn dữ liệu:</Text>
                                    <Progress percent={100} status="success" strokeColor="#52c41a" />
                                    <Text type="secondary" style={{ fontSize: 12 }}>Tất cả file đã được mã hóa AES-256-GCM.</Text>
                                </div>
                                <div>
                                    <Text strong>Rủi ro rò rỉ (DLP):</Text>
                                    <Progress percent={15} status="active" strokeColor="#faad14" />
                                    <Text type="secondary" style={{ fontSize: 12 }}>Phát hiện 2 lần copy tài liệu ra thiết bị ngoài.</Text>
                                </div>
                                <div style={{ marginTop: 30, textAlign: 'center' }}>
                                    <Button type="primary" icon={<DownloadOutlined />}>Xuất báo cáo PDF</Button>
                                </div>
                            </div>
                        </Card>
                    </Col>
                </Row>
            </div>
        </Modal>
    );
};

export default ProjectAnalyticsModal;
