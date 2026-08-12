import { useState, useEffect } from 'react';
import { Table, Button, message, Popconfirm, Avatar, Tag, Space } from 'antd';
import { DeleteOutlined, EyeOutlined, LikeOutlined, MessageOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import type { Post } from '../types';
import type { ColumnsType } from 'antd/es/table';


function PostManagementPage() {
    const { t } = useTranslation();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchPosts = async (page = 1, limit = 10) => {
        setLoading(true);
        try {
            // Using the existing SocialFeed API which returns { posts, pagination }
            const data: any = await api.get(`/api/SocialFeed/posts?page=${page}&limit=${limit}`);
            setPosts(data.posts);
            setPagination({
                current: data.pagination.page,
                pageSize: data.pagination.limit,
                total: data.pagination.totalCount
            });
        } catch (error) {
            message.error(t('post_management.fetch_fail', 'Lỗi tải danh sách bài viết!'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts(pagination.current, pagination.pageSize);
    }, []);

    const handleTableChange = (newPagination: any) => {
        fetchPosts(newPagination.current, newPagination.pageSize);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/api/SocialFeed/posts/${id}`);
            message.success(t('post_management.delete_success', 'Đã xóa bài viết thành công'));
            fetchPosts(pagination.current, pagination.pageSize);
        } catch (error) {
            message.error(t('post_management.delete_fail', 'Lỗi khi xóa bài viết'));
        }
    };

    const columns: ColumnsType<Post> = [
        {
            title: t('post_management.col_author', 'Tác giả'),
            key: 'author',
            render: (_, record) => (
                <Space>
                    <Avatar src={record.authorAvatarUrl} icon={!record.authorAvatarUrl && <EyeOutlined />} />
                    <div>
                        <div style={{ fontWeight: 'bold' }}>{record.authorName}</div>
                        <Tag color={record.authorRole === 'Admin' ? 'red' : 'blue'}>{record.authorRole}</Tag>
                    </div>
                </Space>
            ),
        },
        {
            title: t('post_management.col_content', 'Nội dung'),
            dataIndex: 'content',
            key: 'content',
            width: '40%',
            render: (text) => (
                <div style={{ wordWrap: 'break-word', maxHeight: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {text}
                    {text.length > 100 && '...'}
                </div>
            ),
        },
        {
            title: t('post_management.col_stats', 'Thống kê'),
            key: 'stats',
            render: (_, record) => (
                <Space orientation="vertical" size="small">
                    <Tag icon={<LikeOutlined />}>{record.likedBy?.length || 0}</Tag>
                    <Tag icon={<MessageOutlined />}>{record.commentCount || 0}</Tag>
                </Space>
            ),
        },
        {
            title: t('post_management.col_created', 'Ngày tạo'),
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date) => new Date(date).toLocaleString('vi-VN'),
        },
        {
            title: t('post_management.col_action', 'Thao tác'),
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    <Popconfirm
                        title={t('post_management.confirm_delete_title', 'Bạn có chắc muốn xóa bài viết này?')}
                        description={t('post_management.confirm_delete_desc', 'Hành động này không thể hoàn tác.')}
                        onConfirm={() => handleDelete(record.id)}
                        okText={t('post_management.confirm_delete_ok', 'Xóa')}
                        cancelText={t('post_management.confirm_delete_cancel', 'Hủy')}
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                        >
                            {t('post_management.delete', 'Xóa')}
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
                <h2>📝 {t('post_management.title', 'Quản lý Bài viết')}</h2>
            </div>

            {isMobile ? (
                <div className="mobile-incident-list">
                    {posts.length === 0 && !loading ? (
                        <div className="empty-incidents">
                            <span className="material-symbols-outlined empty-icon">feed</span>
                            <h3>{t('post_management.empty_title', 'Không có bài viết')}</h3>
                            <p>{t('post_management.empty_desc', 'Hệ thống hiện chưa có bài đăng nào.')}</p>
                        </div>
                    ) : (
                        <div className="incident-cards-container">
                            {posts.map(post => (
                                <div key={post.id} className="incident-card">
                                    <div className="incident-card-content">
                                        <div className="incident-card-header">
                                            <Avatar src={post.authorAvatarUrl} size={32} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: 14 }}>{post.authorName}</div>
                                                <Tag color={post.authorRole === 'Admin' ? 'red' : 'blue'} style={{ fontSize: 10, margin: 0 }}>
                                                    {post.authorRole}
                                                </Tag>
                                            </div>
                                            <Popconfirm
                                                title={t('post_management.confirm_delete_title_short', 'Xóa bài viết?')}
                                                onConfirm={() => handleDelete(post.id)}
                                                okText={t('post_management.confirm_delete_ok', 'Xóa')}
                                                cancelText={t('post_management.confirm_delete_cancel', 'Hủy')}
                                            >
                                                <Button type="text" danger icon={<DeleteOutlined />} />
                                            </Popconfirm>
                                        </div>

                                        <div className="incident-desc" style={{ color: 'var(--color-text-main)', fontSize: 14 }}>
                                            {post.content}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                            <Space>
                                                <Tag icon={<LikeOutlined />} color="blue">{post.likedBy?.length || 0}</Tag>
                                                <Tag icon={<MessageOutlined />} color="green">{post.commentCount || 0}</Tag>
                                            </Space>
                                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                {new Date(post.createdAt).toLocaleDateString('vi-VN')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                                <Button
                                    onClick={() => handleTableChange({ ...pagination, current: pagination.current + 1 })}
                                    disabled={pagination.current * pagination.pageSize >= pagination.total}
                                    loading={loading}
                                >
                                    {t('post_management.load_more', 'Xem thêm')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <Table
                    columns={columns}
                    dataSource={posts}
                    rowKey="id"
                    loading={loading}
                    pagination={pagination}
                    onChange={handleTableChange}
                />
            )}
        </div>
    );
}

export default PostManagementPage;
