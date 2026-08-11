import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, message as antdMessage } from 'antd';
import { authService } from '../services/auth';
import { userService } from '../services/userService';
import { api, API_BASE_URL } from '../services/api';
import { feedService } from '../services/feedService';
import type { User, Post } from '../types';
import PostCard from '../components/PostCard';
import BottomNavigation from '../components/BottomNavigation';
import LeftSidebar from '../components/LeftSidebar';
import FaceRegistrationModal from '../components/FaceRegistrationModal';
import EditProfileModal from '../components/EditProfileModal';
import { useTranslation } from 'react-i18next';
import './ProfilePage.css';


type TabType = 'overview' | 'security' | 'activity' | 'connections';

interface LogEntry {
    timestamp: string;
    actionTaken: string;
    message: string;
    severity: string;
    ipAddress: string;
}

export default function ProfilePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { userId } = useParams<{ userId?: string }>();
    const [user, setUser] = useState<User | null>(null);
    const currentUser = useMemo(() => authService.getCurrentUser(), []);
    const [isOwnProfile, setIsOwnProfile] = useState(true);
    const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [userPosts, setUserPosts] = useState<Post[]>([]);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [telegramLinked, setTelegramLinked] = useState(false);
    const [telegramLinking, setTelegramLinking] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Trạng thái liên kết Telegram, dùng để đổi nhãn nút.
    useEffect(() => {
        if (!isOwnProfile) return;
        api.get<{ linked: boolean }>('/api/telegram/status')
            .then(res => setTelegramLinked(!!res?.linked))
            .catch(() => { /* chưa cấu hình bot thì bỏ qua, nút vẫn dùng được */ });
    }, [isOwnProfile]);

    // Mở bot Telegram kèm mã liên kết dùng một lần. Người dùng chỉ cần bấm Start
    // trong Telegram là tài khoản được nối, sau đó OTP sẽ gửi thẳng vào đó.
    const handleLinkTelegram = async () => {
        setTelegramLinking(true);
        try {
            const res = await api.post<{ url: string }>('/api/telegram/link-code');
            if (res?.url) {
                window.open(res.url, '_blank', 'noopener');
                antdMessage.info(t('profile.telegram_opened', 'Hãy bấm START trong Telegram để hoàn tất liên kết.'));
            }
        } catch (error: any) {
            antdMessage.error(
                error?.response?.data?.message
                || t('profile.telegram_failed', 'Không tạo được liên kết Telegram.')
            );
        } finally {
            setTelegramLinking(false);
        }
    };

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        const handleUserUpdate = (e: any) => {
            if (isOwnProfile) {
                setUser(e.detail);
            }
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('auth-user-updated', handleUserUpdate as EventListener);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('auth-user-updated', handleUserUpdate as EventListener);
        };
    }, [isOwnProfile]);

    useEffect(() => {
        const loadProfile = async () => {
            if (!currentUser) {
                navigate('/login');
                return;
            }

            const targetUserId = userId || currentUser.id;
            const viewingOwnProfile = !userId || userId === currentUser.id;
            setIsOwnProfile(viewingOwnProfile);

            try {
                // Always fetch latest data from server
                const userData = await userService.getUserById(targetUserId!);
                setUser(userData);
                
                // If viewing own profile, sync local storage and state via central service
                if (viewingOwnProfile) {
                    authService.dispatchUserUpdate(userData);
                }
            } catch (error) {
                console.error("Error fetching user profile", error);
                
                // Fallback to local data if server fetch fails for own profile
                if (viewingOwnProfile) {
                    setUser(currentUser);
                }
            }

            try {
                const posts = await feedService.getUserPosts(targetUserId!);
                setUserPosts(posts);
            } catch (error) {
                console.error("Error fetching posts", error);
            }
        };

        loadProfile();
    }, [userId, currentUser, navigate]);

    const handlePostUpdated = (updatedPost: Post) => {
        setUserPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
    };

    const handlePostDeleted = (postId: string) => {
        setUserPosts(prev => prev.filter(p => p.id !== postId));
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user || !user.id) return;

        setIsUploading(true);
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);

        try {
            const response = await api.post<{ url: string }>('/api/upload', uploadFormData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const avatarUrl = response.url;
            await userService.updateUser(user.id, { avatarUrl });

            const updatedUser = { ...user, avatarUrl };
            setUser(updatedUser);
            authService.dispatchUserUpdate(updatedUser);
            antdMessage.success(t('profile.update_avatar_success', 'Cập nhật ảnh đại diện thành công'));
        } catch (error) {
            console.error('Failed to upload avatar:', error);
            antdMessage.error(t('profile.update_avatar_fail', 'Không thể tải lên ảnh đại diện'));
        } finally {
            setIsUploading(false);
        }
    };

    const handleProfileUpdate = (updatedUser: User) => {
        setUser(updatedUser);
        if (updatedUser.id === currentUser?.id) {
            authService.dispatchUserUpdate(updatedUser);
        }
    };

    if (!user) {
        return <div className="flex h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">{t('profile.loading', 'Đang tải...')}</div>;
    }

    const getDisplayAvatarUrl = (url?: string) => {
        if (!url) return `https://i.pravatar.cc/150?u=${user.username}`;
        if (url.startsWith('http')) return url;
        return `${API_BASE_URL}${url}`;
    };

    const getRoleClass = (role?: string) => {
        if (!role) return 'role-staff';
        const r = role.toLowerCase();
        if (r.includes('admin')) return 'role-admin';
        if (r.includes('quản lý') || r.includes('manager')) return 'role-manager';
        if (r.includes('giám đốc') || r.includes('director')) return 'role-director';
        if (r.includes('nhân viên') || r.includes('staff')) return 'role-staff';
        return 'role-staff';
    };

    const avatarUrl = getDisplayAvatarUrl(user.avatarUrl);

    return (
        <div className="profile-container">
            {!isMobile && <LeftSidebar />}

            <main className="profile-main-content">
                {/* Hero Section */}
                <section className="profile-hero">
                    <div className="profile-cover">
                        <button className="hero-dark-mode-fab">
                            <span className="material-symbols-outlined">dark_mode</span>
                        </button>
                    </div>

                    <div className="profile-hero-content">
                        <div className="hero-actions">
                            <Button className="btn-primary-mobile" onClick={() => setIsEditModalOpen(true)} style={{ display: isOwnProfile ? 'block' : 'none' }}>
                                {t('profile.btn_edit', 'Chỉnh sửa hồ sơ')}
                            </Button>
                            {isOwnProfile && (
                                <Button
                                    className="btn-primary-mobile"
                                    loading={telegramLinking}
                                    onClick={handleLinkTelegram}
                                >
                                    {telegramLinked
                                        ? t('profile.btn_telegram_linked', 'Telegram đã liên kết')
                                        : t('profile.btn_telegram_link', 'Liên kết Telegram')}
                                </Button>
                            )}
                            <Button className="btn-icon-mobile">
                                <span className="material-symbols-outlined">settings</span>
                            </Button>
                        </div>

                        <div className="avatar-wrapper" onClick={isOwnProfile ? handleAvatarClick : undefined}>
                            <img src={avatarUrl} alt="Avatar" className="profile-avatar-large" />
                            <div className="status-indicator"></div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            {isUploading && (
                                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>

                        <div className="profile-identity">
                            <div className="name-badge-row">
                                <h1>
                                    {user.fullName || user.username}
                                    <span className="material-symbols-outlined verified-badge">verified</span>
                                </h1>
                                {user.role && (
                                    <span className={`role-badge ${getRoleClass(user.role)}`}>
                                        {user.role}
                                    </span>
                                )}
                            </div>
                            <p>{user.department || 'Administrator'}</p>
                        </div>

                        <div className="profile-tabs-wrapper">
                            <div className="profile-tabs-mobile">
                                <button
                                    className={`profile-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('overview')}
                                >{t('profile.tab_activity', 'Hoạt động')}</button>
                                <button
                                    className={`profile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('security')}
                                >{t('profile.tab_security', 'Bảo mật')}</button>
                                <button
                                    className={`profile-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('activity')}
                                >{t('profile.tab_about', 'Giới thiệu')}</button>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="profile-content-grid">
                    {/* Left Column (Info) */}
                    <div className="flex flex-col gap-6">
                        <section className="profile-section">
                            <span className="section-label">{t('profile.section_professional_info', 'Thông tin nghề nghiệp')}</span>
                            <div className="info-card-mobile">
                                <div className="info-item-mobile">
                                    <div className="info-icon-box">
                                        <span className="material-symbols-outlined">badge</span>
                                    </div>
                                    <div className="info-text-box">
                                        <label>{t('profile.lbl_role', 'Vai trò')}</label>
                                        <span>{user.role || 'Senior Security Analyst'}</span>
                                    </div>
                                </div>
                                <div className="info-item-mobile">
                                    <div className="info-icon-box">
                                        <span className="material-symbols-outlined">apartment</span>
                                    </div>
                                    <div className="info-text-box">
                                        <label>{t('profile.lbl_department', 'Phòng ban')}</label>
                                        <span>{user.department || 'Information Security (SecOps)'}</span>
                                    </div>
                                </div>
                                <div className="info-item-mobile">
                                    <div className="info-icon-box">
                                        <span className="material-symbols-outlined">mail</span>
                                    </div>
                                    <div className="info-text-box">
                                        <label>{t('profile.lbl_email', 'Email')}</label>
                                        <span>{user.email || 'insider.threat@corporate.com'}</span>
                                    </div>
                                </div>
                                <div className="info-item-mobile">
                                    <div className="info-icon-box">
                                        <span className="material-symbols-outlined">call</span>
                                    </div>
                                    <div className="info-text-box">
                                        <label>{t('profile.lbl_phone', 'Số điện thoại')}</label>
                                        <span>{user.phoneNumber || '+1 (555) 902-3412'}</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="profile-section">
                            <span className="section-label">{t('profile.section_security_settings', 'Cài đặt bảo mật')}</span>
                            <div className="info-card-mobile">
                                <div className="security-list">
                                    <div className="security-item-card">
                                        <span className={`material-symbols-outlined ${(user.faceEmbeddings && user.faceEmbeddings.length > 0) || user.faceImageUrl ? 'icon-green' : 'icon-gray'}`}>
                                            {(user.faceEmbeddings && user.faceEmbeddings.length > 0) || user.faceImageUrl ? 'sentiment_satisfied' : 'face'}
                                        </span>
                                        <span className="security-item-title">{t('profile.item_face_id', 'Nhận diện khuôn mặt')}</span>
                                        {(user.faceEmbeddings && user.faceEmbeddings.length > 0) || user.faceImageUrl ? (
                                            <span className="status-tag verified">{t('profile.status_verified', 'Đã xác thực')}</span>
                                        ) : (
                                            <span className="status-tag unauthorized">{t('profile.status_not_setup', 'Chưa thiết lập')}</span>
                                        )}
                                    </div>
                                    <div className="security-item-card">
                                        <span className="material-symbols-outlined icon-blue">key</span>
                                        <span className="security-item-title">{t('profile.item_f2k_keys', 'Khóa F2K')}</span>
                                        <span className="status-tag unauthorized">{t('profile.status_not_setup', 'Chưa thiết lập')}</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right Column (Feed) */}
                    <section className="profile-section">
                        <span className="section-label">{t('profile.section_recent_activity', 'Hoạt động gần đây')}</span>
                        <div className="mobile-activity-feed">
                            {userPosts.length === 0 ? (
                                <div className="bg-[var(--color-surface)] rounded-[20px] p-8 border border-[var(--color-border)] text-center">
                                    <p className="text-[var(--color-text-muted)]">{t('profile.no_posts', 'Chưa có bài đăng nào.')}</p>
                                </div>
                            ) : (
                                userPosts.map(post => (
                                    <PostCard
                                        key={post.id}
                                        post={post}
                                        currentUser={user}
                                        onPostUpdated={handlePostUpdated}
                                        onPostDeleted={handlePostDeleted}
                                    />
                                ))
                            )}
                        </div>
                    </section>
                </div>

                {isMobile && <BottomNavigation />}

                <FaceRegistrationModal
                    visible={isFaceModalOpen}
                    onCancel={() => setIsFaceModalOpen(false)}
                    userId={user.id || null}
                    userName={user.fullName || user.username}
                />

                <EditProfileModal
                    visible={isEditModalOpen}
                    onCancel={() => setIsEditModalOpen(false)}
                    user={user}
                    onUpdate={handleProfileUpdate}
                />
            </main>
        </div>
    );
}
