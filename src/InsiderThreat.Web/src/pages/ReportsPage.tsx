import { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message } from 'antd';
import { feedService } from '../services/feedService';


function ReportsPage() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const data = await feedService.getReports();
            setReports(data);
        } catch (error) {
            console.error('Failed to fetch reports:', error);
            message.error('Lỗi tải danh sách báo cáo!');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const handleDeletePost = async (reportId: string, postId: string) => {
        try {
            // Delete the post
            await feedService.deletePost(postId);
            message.success('Bài viết đã bị xóa!');

            // Remove report from local state
            setReports(prev => prev.filter(r => r.id !== reportId));
        } catch (error) {
            console.error('Failed to delete post:', error);
            message.error('Lỗi khi xóa bài viết!');
        }
    };

    const dismissReport = async (reportId: string) => {
        try {
            // Remove report from local state without deleting post
            setReports(prev => prev.filter(r => r.id !== reportId));
            message.success('Đã bỏ qua báo cáo!');
        } catch (error) {
            console.error('Failed to dismiss report:', error);
            message.error('Lỗi khi bỏ qua báo cáo!');
        }
    };

    return (
        <div style={{ padding: 24 }}>
            <h2 style={{ marginBottom: 16, fontSize: 24, fontWeight: 600 }}>📋 Báo cáo vi phạm</h2>
            <Table
                dataSource={reports}
                loading={loading}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 'max-content' }}
            >
                <Table.Column
                    title="Bài viết"
                    dataIndex="postId"
                    key="postId"
                    width={200}
                    render={(postId: string) => (
                        <a
                            href={`/feed?postId=${postId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                        >
                            Xem bài viết #{postId.slice(-8)}
                        </a>
                    )}
                />
                <Table.Column
                    title="Người báo cáo"
                    dataIndex="reporterName"
                    key="reporterName"
                    width={150}
                />
                <Table.Column
                    title="Lý do"
                    dataIndex="reason"
                    key="reason"
                    ellipsis
                    width={250}
                />
                <Table.Column
                    title="Thời gian"
                    dataIndex="createdAt"
                    key="createdAt"
                    width={160}
                    render={(date: string) => new Date(date).toLocaleString('vi-VN')}
                />
                <Table.Column
                    title="Trạng thái"
                    dataIndex="status"
                    key="status"
                    width={120}
                    render={(status: string) => {
                        const colorMap: Record<string, string> = {
                            'Pending': 'orange',
                            'Reviewed': 'blue',
                            'Resolved': 'green',
                            'Dismissed': 'gray'
                        };
                        return <Tag color={colorMap[status] || 'default'}>{status || 'Pending'}</Tag>;
                    }}
                />
                <Table.Column
                    title="Hành động"
                    key="action"
                    width={180}
                    render={(_, record: any) => (
                        <Space>
                            <Button
                                size="small"
                                danger
                                onClick={() => handleDeletePost(record.id, record.postId)}
                            >
                                Xóa bài viết
                            </Button>
                            <Button
                                size="small"
                                type="default"
                                onClick={() => dismissReport(record.id)}
                            >
                                Bỏ qua
                            </Button>
                        </Space>
                    )}
                />
            </Table>
        </div>
    );
}

export default ReportsPage;
