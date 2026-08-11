import { useState, useEffect } from 'react';
import { Table, Button, message, Popconfirm, Avatar, Tag, Space } from 'antd';
import { DeleteOutlined, EyeOutlined, LikeOutlined, MessageOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import type { Post } from '../types';
import type { ColumnsType } from 'antd/es/table';


function PostManagementPage() {
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
            message.error('Lỗi tải danh sách bài viết!');
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
            message.success('Đã xóa bài viết thành công');
            fetchPosts(pagination.current, pagination.pageSize);
        } catch (error) {
            message.error('Lỗi khi xóa bài viết');
        }
    };

    const columns: ColumnsType<Post> = [
        {
            title: 'Tác giả',
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
            title: 'Nội dung',
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
            title: 'Thống kê',
            key: 'stats',
            render: (_, record) => (
                <Space orientation="vertical" size="small">
                    <Tag icon={<LikeOutlined />}>{record.likedBy?.length || 0}</Tag>
                    <Tag icon={<MessageOutlined />}>{record.commentCount || 0}</Tag>
                </Space>
            ),
        },
        {
            title: 'Ngày tạo',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date) => new Date(date).toLocaleString('vi-VN'),
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    <Popconfirm
                        title="Bạn có chắc muốn xóa bài viết này?"
                        description="Hành động này không thể hoàn tác."
                        onConfirm={() => handleDelete(record.id)}
                        okText="Xóa"
                        cancelText="Hủy"
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                        >
                            Xóa
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
                <h2>📝 Quản lý Bài viết</h2>
            </div>

            {isMobile ? (
                <div className="mobile-incident-list">
                    {posts.length === 0 && !loading ? (
                        <div className="empty-incidents">
                            <span className="material-symbols-outlined empty-icon">feed</span>
                            <h3>Không có bài viết</h3>
                            <p>Hệ thống hiện chưa có bài đăng nào.</p>
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
                                                title="Xóa bài viết?"
                                                onConfirm={() => handleDelete(post.id)}
                                                okText="Xóa"
                                                cancelText="Hủy"
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
                                    Xem thêm
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
