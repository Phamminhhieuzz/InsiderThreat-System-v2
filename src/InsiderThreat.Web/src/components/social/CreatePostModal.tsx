import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import { feedService } from '../../services/feedService';
import { API_BASE_URL } from '../../services/api';
import { DEPARTMENTS, POST_CATEGORIES } from '../../constants';
import { detectSensitiveContent } from '../../utils/contentAnalyzer';
import { validateFileSize } from '../../utils/imageCompressor';
import styles from './CreatePostModal.module.css';

interface CreatePostModalProps {
    user: any;
    onClose: () => void;
    onPostCreated: (post: any) => void;
}

const BG_COLORS = [
    null,
    'linear-gradient(135deg,#f857a4,#ff5858)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
    'linear-gradient(135deg,#e0e0e0,#f5f5f5)',
    '#1a1a2e',
    'linear-gradient(135deg,#1e40af,#3b82f6)',
    'linear-gradient(135deg,#f7971e,#ffd200)',
];

const CreatePostModal: React.FC<CreatePostModalProps> = ({ user, onClose, onPostCreated }) => {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('General');
    const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
    const [allowedDepartments, setAllowedDepartments] = useState<string[]>([]);
    const [postBgColor, setPostBgColor] = useState<string | null>(null);
    const [showWarning, setShowWarning] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getAvatarUrl = (userObj: any) => {
        if (!userObj) return `https://i.pravatar.cc/150?u=user`;
        const url = userObj.avatarUrl;
        if (!url) return `https://i.pravatar.cc/150?u=${userObj.username || 'user'}`;
        if (url.startsWith('http')) return url;
        return `${API_BASE_URL}${url}`;
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const sizeError = validateFileSize(file);
            if (sizeError) {
                message.error(sizeError);
                return;
            }
            setSelectedFile(file);
            setPostBgColor(null); // Clear background color if media is selected
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeFile = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async () => {
        if (!content.trim() && !selectedFile) return;

        const analysis = detectSensitiveContent(content);
        if (analysis.isSensitive) {
            setWarningMessage(analysis.warningMessage);
            setShowWarning(true);
            return;
        }

        await performCreatePost();
    };

    const performCreatePost = async () => {
        setIsPosting(true);
        try {
            let mediaFiles: any[] = [];
            let postType = 'Text';

            if (selectedFile) {
                const uploadResult = await feedService.uploadFile(selectedFile);
                const fileType = selectedFile.type.startsWith('image/') ? 'image' :
                    selectedFile.type.startsWith('video/') ? 'video' : 'file';

                mediaFiles.push({
                    type: fileType,
                    url: uploadResult.url,
                    fileName: uploadResult.fileName,
                    fileSize: uploadResult.size
                });

                postType = fileType === 'image' ? 'Image' : fileType === 'video' ? 'Video' : 'File';
            } else if (content.includes('http')) {
                postType = 'Link';
            }

            const newPost = await feedService.createPost(
                content,
                'Public',
                mediaFiles,
                selectedCategory,
                postType,
                allowedRoles,
                allowedDepartments
            );

            onPostCreated(newPost);
            onClose();
        } catch (error: any) {
            console.error("Failed to create post", error);
            const errMsg = error.response?.data?.message || error.message || t('feed.post_fail_try_again', "Please try again.");
            message.error(t('feed.post_fail_msg', { msg: errMsg, defaultValue: `Failed to post: ${errMsg}` }));
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.modalContent}>
                {/* Header */}
                <div className={styles.header}>
                    <h2>{t('feed.create_post_title', 'TẠO BÀI VIẾT')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>

                {/* Body - Scrollable content */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {/* User Info */}
                    <div className={styles.userInfo}>
                        <div className={styles.avatar} style={{ backgroundImage: `url(${getAvatarUrl(user)})` }} />
                        <div className={styles.userDetails}>
                            <div className={styles.userName}>{user?.fullName || user?.username}</div>
                            <div className={styles.privacyBadge}>
                                🌐 {t('feed.public_badge', 'CÔNG KHAI')}
                            </div>
                        </div>
                    </div>

                    {/* Editor Area */}
                    <div className={styles.editorArea}>
                        {postBgColor && !previewUrl ? (
                            <div className={styles.colorPreviewContainer} style={{ background: postBgColor }}>
                                <textarea
                                    autoFocus
                                    className={`${styles.textarea} ${styles.textareaColorMode}`}
                                    placeholder={t('feed.post_placeholder_short', 'Bạn đang nghĩ gì?')}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    style={{ color: '#fff', fontSize: content.length > 60 ? '18px' : '24px' }}
                                />
                            </div>
                        ) : (
                            <textarea
                                autoFocus
                                className={styles.textarea}
                                placeholder={previewUrl ? t('feed.caption_placeholder', 'Thêm chú thích...') : t('feed.post_placeholder', { name: user?.fullName?.split(' ').pop() || user?.username, defaultValue: `${user?.fullName?.split(' ').pop() || user?.username} ơi, bạn đang nghĩ gì?` })}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                            />
                        )}

                        {/* Media Preview */}
                        {previewUrl && (
                            <div className={styles.mediaPreview}>
                                {selectedFile?.type.startsWith('video/') ? (
                                    <video src={previewUrl} controls />
                                ) : (
                                    <img src={previewUrl} alt="Preview" />
                                )}
                                <button className={styles.removeMedia} onClick={removeFile}>×</button>
                            </div>
                        )}
                    </div>

                    {/* Color Picker Section (Visible when no media) */}
                    {!previewUrl && (
                        <div className={styles.colorPicker}>
                            {BG_COLORS.map((color, i) => (
                                <button
                                    key={i}
                                    className={`${styles.colorOption} ${postBgColor === color || (!postBgColor && i === 0) ? styles.colorOptionActive : ''}`}
                                    onClick={() => setPostBgColor(i === 0 ? null : color)}
                                    style={{ background: i === 0 ? 'var(--color-bg)' : color || 'transparent' }}
                                >
                                    {i === 0 && <span style={{ opacity: 0.5 }}>×</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Toolbar */}
                <div className={styles.toolbar}>
                    <div className={styles.toolbarItem} onClick={() => fileInputRef.current?.click()}>
                        <div className={styles.mediaIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                            </svg>
                            <span className={styles.toolbarLabel}>{t('feed.add_media', 'Ảnh/Video')}</span>
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" style={{ display: 'none' }} />
                        <span className="material-symbols-outlined text-[var(--color-text-muted)]">add_circle</span>
                    </div>
                </div>

                {/* Advanced Selectors */}
                <div className={styles.selectors}>
                    <select
                        className={styles.select}
                        onChange={(e) => {
                            const val = e.target.value;
                            setAllowedRoles([]);
                            setAllowedDepartments([]);
                            if (val === 'Managers') setAllowedRoles(['Manager', 'Admin']);
                            else if (DEPARTMENTS.includes(val)) setAllowedDepartments([val]);
                        }}
                    >
                        <option value="Public">{t('feed.scope_public', '🌐 Toàn công ty')}</option>
                        <option value="Managers">{t('feed.scope_managers', '👔 Chỉ quản lý')}</option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>🏢 {d}</option>)}
                    </select>

                    <select
                        className={styles.select}
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                        {POST_CATEGORIES.map(c => <option key={c} value={c}>#{c}</option>)}
                    </select>
                </div>

                {/* Footer Submit */}
                <div className={styles.footer}>
                    <button
                        className={styles.submitButton}
                        onClick={handleSubmit}
                        disabled={(!content.trim() && !selectedFile) || isPosting}
                    >
                        {isPosting ? (
                            <>
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                                {t('feed.posting', 'Đang đăng bài...')}
                            </>
                        ) : (
                            t('feed.post_now', 'ĐĂNG BÀI NGAY')
                        )}
                    </button>
                </div>
            </div>

            {/* Sensitive Content Warning */}
            {showWarning && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1100] p-4">
                    <div className="bg-[var(--color-surface)] border-t-4 border-yellow-500 rounded-2xl p-6 max-w-md shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="material-symbols-outlined text-yellow-500 text-3xl">warning</span>
                            <h3 className="text-xl font-bold text-[var(--color-text-main)]">{t('feed.sensitive_detected', 'Phát hiện nội dung nhạy cảm')}</h3>
                        </div>
                        <p className="text-[var(--color-text-muted)] mb-5 leading-relaxed">{warningMessage}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowWarning(false)} className="flex-1 px-4 py-2 bg-[var(--color-surface-lighter)] text-[var(--color-text-main)] rounded-xl font-semibold">Hủy</button>
                            <button onClick={() => { setShowWarning(false); performCreatePost(); }} className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-xl font-bold">Vẫn đăng</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreatePostModal;
