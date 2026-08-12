import { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { feedService } from '../services/feedService';


function ReportsPage() {
    const { t } = useTranslation();
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const data = await feedService.getReports();
            setReports(data);
        } catch (error) {
            console.error('Failed to fetch reports:', error);
            message.error(t('reports_page.fetch_fail', 'Lỗi tải danh sách báo cáo!'));
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
            message.success(t('reports_page.delete_success', 'Bài viết đã bị xóa!'));

            // Remove report from local state
            setReports(prev => prev.filter(r => r.id !== reportId));
        } catch (error) {
            console.error('Failed to delete post:', error);
            message.error(t('reports_page.delete_fail', 'Lỗi khi xóa bài viết!'));
        }
    };

    const dismissReport = async (reportId: string) => {
        try {
            // Remove report from local state without deleting post
            setReports(prev => prev.filter(r => r.id !== reportId));
            message.success(t('reports_page.dismiss_success', 'Đã bỏ qua báo cáo!'));
        } catch (error) {
            console.error('Failed to dismiss report:', error);
            message.error(t('reports_page.dismiss_fail', 'Lỗi khi bỏ qua báo cáo!'));
        }
    };

    return (
        <div style={{ padding: 24 }}>
            <h2 style={{ marginBottom: 16, fontSize: 24, fontWeight: 600 }}>📋 {t('reports_page.title', 'Báo cáo vi phạm')}</h2>
            <Table
                dataSource={reports}
                loading={loading}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 'max-content' }}
            >
                <Table.Column
                    title={t('reports_page.col_post', 'Bài viết')}
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
                            {t('reports_page.view_post', 'Xem bài viết')} #{postId.slice(-8)}
                        </a>
                    )}
                />
                <Table.Column
                    title={t('reports_page.col_reporter', 'Người báo cáo')}
                    dataIndex="reporterName"
                    key="reporterName"
                    width={150}
                />
                <Table.Column
                    title={t('reports_page.col_reason', 'Lý do')}
                    dataIndex="reason"
                    key="reason"
                    ellipsis
                    width={250}
                />
                <Table.Column
                    title={t('reports_page.col_time', 'Thời gian')}
                    dataIndex="createdAt"
                    key="createdAt"
                    width={160}
                    render={(date: string) => new Date(date).toLocaleString('vi-VN')}
                />
                <Table.Column
                    title={t('reports_page.col_status', 'Trạng thái')}
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
                    title={t('reports_page.col_action', 'Hành động')}
                    key="action"
                    width={180}
                    render={(_, record: any) => (
                        <Space>
                            <Button
                                size="small"
                                danger
                                onClick={() => handleDeletePost(record.id, record.postId)}
                            >
                                {t('reports_page.delete_post', 'Xóa bài viết')}
                            </Button>
                            <Button
                                size="small"
                                type="default"
                                onClick={() => dismissReport(record.id)}
                            >
                                {t('reports_page.dismiss', 'Bỏ qua')}
                            </Button>
                        </Space>
                    )}
                />
            </Table>
        </div>
    );
}

export default ReportsPage;
