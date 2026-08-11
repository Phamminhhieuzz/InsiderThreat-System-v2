import React, { useState } from 'react';
import { Drawer, Avatar, Typography, Input, Button, Space, Tooltip } from 'antd';
import { 
    CloseOutlined, 
    ThunderboltFilled, 
    CarryOutOutlined, 
    SwapOutlined, 
    FileTextOutlined, 
    UserAddOutlined,
    SendOutlined,
    RocketOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { api } from '../../services/api';
import './ProjectSidebar.css';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

interface ActivityItem {
    id: string;
    type: string; 
    user?: {
        fullName: string;
        avatarUrl?: string;
    };
    action: string;
    targetName: string;
    createdAt: string;
}

const AI_HINTS = [
    "Tóm tắt tiến độ dự án",
    "Tìm các việc trễ hạn",
    "Ai đang thiết kế UI?",
    "Báo cáo công việc tuần"
];

interface ProjectSidebarProps {
    open: boolean;
    onClose: () => void;
    projectName: string;
}

export default function ProjectSidebar({ open, onClose, projectName }: ProjectSidebarProps) {
    const { id } = useParams<{ id: string }>();
    const { t } = useTranslation();
    const [aiInput, setAiInput] = useState('');
    const [aiThinking, setAiThinking] = useState(false);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [aiResponse, setAiResponse] = useState<string | null>(null);

    React.useEffect(() => {
        if (open && id) {
            fetchActivities();
        }
    }, [open, id]);

    const fetchActivities = async () => {
        try {
            setLoading(true);
            const res = await api.get<ActivityItem[]>(`/api/groups/${id}/activities`);
            setActivities(res);
        } catch (err) {
            console.error('Failed to fetch activities', err);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'task': return <CarryOutOutlined />;
            case 'status': return <SwapOutlined />;
            case 'file': return <FileTextOutlined />;
            case 'member': return <UserAddOutlined />;
            default: return <HistoryOutlined />;
        }
    };

    const handleAiSend = async () => {
        if (!aiInput.trim()) return;
        setAiThinking(true);
        setAiResponse(null);
        
        try {
            // Fetch task context for AI logic
            const tasks = await api.get<any[]>(`/api/groups/${id}/tasks`);
            const input = aiInput.toLowerCase();
            
            let response = "";
            if (input.includes("summarize") || input.includes("progress")) {
                const done = tasks.filter(t => t.status === 'Done').length;
                const total = tasks.length;
                response = `Dự án hiện có ${total} nhiệm vụ, trong đó ${done} đã hoàn thành (${total > 0 ? Math.round((done/total)*100) : 0}%).`;
            } else if (input.includes("deadline") || input.includes("trễ")) {
                const overdue = tasks.filter(t => t.deadline && dayjs(t.deadline).isBefore(dayjs()) && t.status !== 'Done');
                response = overdue.length > 0 
                    ? `Có ${overdue.length} nhiệm vụ đang trễ hạn: ${overdue.map(o => o.title).join(', ')}.`
                    : "Tuyệt vời, không có nhiệm vụ nào bị trễ hạn!";
            } else if (input.includes("who") || input.includes("ai")) {
                const assignees = [...new Set(tasks.map(t => t.assignedTo).filter(Boolean))];
                response = `Hiện có ${assignees.length} thành viên đang phụ trách các đầu việc.`;
            } else {
                response = "Tôi là AI Copilot cho dự án này. Tôi có thể giúp bạn tóm tắt tiến độ, kiểm tra deadline hoặc tra cứu thông tin nhiệm vụ.";
            }

            // Simulate typing
            setTimeout(() => {
                setAiResponse(response);
                setAiThinking(false);
                setAiInput('');
            }, 1000);
        } catch (error) {
            setAiResponse("Lỗi khi kết nối với hệ thống dữ liệu dự án.");
            setAiThinking(false);
        }
    };

    const handleHintClick = (hint: string) => {
        setAiInput(hint);
    };

    return (
        <Drawer
            className="project-sidebar-drawer"
            placement="right"
            onClose={onClose}
            open={open}
            size="default"
            closable={false}
            styles={{ mask: { background: 'rgba(0,0,0,0.05)', backdropFilter: 'blur(4px)' } }}
        >
            <div className="sidebar-content">
                <div className="sidebar-header">
                    <div className="sidebar-title">
                        <HistoryOutlined />
                        <Title level={4} style={{ margin: 0 }}>Nhịp đập Dự án</Title>
                    </div>
                    <Button 
                        type="text" 
                        shape="circle" 
                        icon={<CloseOutlined />} 
                        onClick={onClose} 
                        style={{ color: 'var(--color-text-muted)' }}
                    />
                </div>

                <div className="sidebar-section-label">
                    <HistoryOutlined style={{ fontSize: 12 }} />
                    Hoạt động Gần đây
                </div>

                <div className="activity-feed">
                    {loading ? <div style={{textAlign: 'center', padding: 20}}><Text type="secondary">Đang tải...</Text></div> : activities.map((activity) => (
                        <div key={activity.id} className="activity-item">
                            <Avatar src={activity.user?.avatarUrl} size={38} className="activity-avatar" />
                            <div className={`activity-icon-wrap ${activity.type}`}>
                                {getIcon(activity.type)}
                            </div>
                            <div className="activity-content">
                                <div className="activity-text">
                                    <Text strong className="activity-user">{activity.user?.fullName || 'Hệ thống'}</Text>
                                    <Text type="secondary"> {activity.action} </Text>
                                    <Text strong className="activity-target">{activity.targetName}</Text>
                                </div>
                                <Text className="activity-time">{dayjs(activity.createdAt).fromNow()}</Text>
                            </div>
                        </div>
                    ))}
                    {!loading && activities.length === 0 && (
                        <div style={{textAlign: 'center', padding: 40}}>
                            <Text type="secondary">Chưa có hoạt động nào được ghi lại.</Text>
                        </div>
                    )}
                </div>

                <div className="ai-assistant-wrapper">
                    <div className="sidebar-section-label">
                        <ThunderboltFilled style={{ fontSize: 12, color: '#f59e0b' }} />
                        Trợ lý AI Copilot
                    </div>

                    <div className="ai-copilot-container">
                        <div className="copilot-header">
                            <RocketOutlined style={{ color: '#2563eb' }} />
                                <Text strong>Cố vấn Không gian làm việc</Text>
                            <span className="copilot-badge">Đang hoạt động</span>
                        </div>

                        <div className="ai-hint-box">
                            {aiResponse ? (
                                <div className="ai-response-box" style={{background: 'var(--color-primary-light)', padding: '10px', borderRadius: '8px', marginBottom: '8px'}}>
                                    <Text style={{fontSize: 13}}>{aiResponse}</Text>
                                    <div style={{textAlign: 'right', marginTop: 4}}>
                                        <Button type="link" size="small" onClick={() => setAiResponse(null)}>Tiếp tục hỏi</Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Gợi ý cho bạn:</Text>
                                    <Space wrap size={4}>
                                        {AI_HINTS.map(hint => (
                                            <Button 
                                                key={hint} 
                                                size="small" 
                                                type="text" 
                                                className="hint-chip"
                                                onClick={() => handleHintClick(hint)}
                                                style={{ 
                                                    fontSize: '11px', 
                                                    background: 'rgba(37, 99, 235, 0.05)',
                                                    color: '#2563eb',
                                                    borderRadius: '6px'
                                                }}
                                            >
                                                {hint}
                                            </Button>
                                        ))}
                                    </Space>
                                </>
                            )}
                        </div>

                        <div className="ai-input-wrap">
                            <Input 
                                className="ai-input"
                                placeholder="Gửi tin nhắn cho Copilot..."
                                value={aiInput}
                                onChange={e => setAiInput(e.target.value)}
                                onPressEnter={handleAiSend}
                                disabled={aiThinking}
                            />
                            <Tooltip title="Hỏi AI">
                                <Button 
                                    type="primary" 
                                    icon={<SendOutlined />} 
                                    className="ai-send-btn" 
                                    onClick={handleAiSend}
                                    loading={aiThinking}
                                />
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>
        </Drawer>
    );
}
