import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { message, Spin, Avatar, Tooltip, Tag, Progress, Button, Input, Empty } from 'antd';
import { 
    CloudUploadOutlined, SearchOutlined, DownloadOutlined, 
    FileOutlined, FilePdfOutlined, FileWordOutlined, 
    FileExcelOutlined, FileZipOutlined, FileImageOutlined,
    UserAddOutlined, MoreOutlined, DatabaseOutlined
} from '@ant-design/icons';
import { api, API_BASE_URL } from '../../services/api';
import FilePreviewModal from './FilePreviewModal';
import ProjectMobileTabs from './ProjectMobileTabs';
import './FilesTab.css';
import './ProjectMobileTabs.css';

interface FileItem {
    id: string;
    fileId: string;
    fileName: string;
    contentType: string;
    size: number;
    uploaderName: string;
    uploadedAt: string;
}

const FILE_ICONS_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
    pdf: { icon: <FilePdfOutlined />, color: '#ff4d4f', bg: 'rgba(255, 77, 79, 0.1)' },
    doc: { icon: <FileWordOutlined />, color: '#1890ff', bg: 'rgba(24, 144, 255, 0.1)' },
    docx: { icon: <FileWordOutlined />, color: '#1890ff', bg: 'rgba(24, 144, 255, 0.1)' },
    xls: { icon: <FileExcelOutlined />, color: '#52c41a', bg: 'rgba(82, 196, 26, 0.1)' },
    xlsx: { icon: <FileExcelOutlined />, color: '#52c41a', bg: 'rgba(82, 196, 26, 0.1)' },
    zip: { icon: <FileZipOutlined />, color: '#faad14', bg: 'rgba(250, 173, 20, 0.1)' },
    rar: { icon: <FileZipOutlined />, color: '#faad14', bg: 'rgba(250, 173, 20, 0.1)' },
    image: { icon: <FileImageOutlined />, color: '#722ed1', bg: 'rgba(114, 46, 209, 0.1)' },
    other: { icon: <FileOutlined />, color: '#8c8c8c', bg: 'rgba(140, 140, 140, 0.1)' },
};

interface Member {
    id: string;
    fullName: string;
    avatarUrl?: string;
    roleLevel?: string;
}

interface FilesTabProps {
    activeTab?: string;
    onTabChange?: (key: string) => void;
}

export default function FilesTab({ activeTab, onTabChange }: FilesTabProps) {
    const { id: groupId } = useParams<{ id: string }>();
    const { t } = useTranslation();
    const [files, setFiles] = useState<FileItem[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string; name: string; size?: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [filesRes, membersRes] = await Promise.all([
                api.get<FileItem[]>(`/api/groups/${groupId}/files`),
                api.get<Member[]>(`/api/groups/${groupId}/members-details`)
            ]);
            setFiles(filesRes);
            setMembers(membersRes);
        } catch (err) {
            message.error(t('project_detail.files.load_fail', { defaultValue: 'Không thể tải dữ liệu tệp tin' }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (groupId) fetchData();
    }, [groupId]);

    const handleFileUpload = async (uploadFiles: File[]) => {
        if (uploadFiles.length === 0) return;
        setUploading(true);
        const hide = message.loading(t('feed.posting', { defaultValue: 'Đang tải lên...' }), 0);

        try {
            for (const file of uploadFiles) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('description', `${t('project_detail.breadcrumbs.projects')}: ${file.name}`);
                await api.postForm(`/api/groups/${groupId}/files`, formData);
            }
            message.success(t('library.upload_success', { name: 'Files' }));
            fetchData();
        } catch (err) {
            message.error(t('library.upload_fail', { name: 'Files', error: '' }));
        } finally {
            setUploading(false);
            hide();
        }
    };

    const handleDownload = (file: FileItem) => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const downloaderName = user.fullName || 'User';
        const url = `${API_BASE_URL}/api/upload/download/${file.fileId}?originalName=${encodeURIComponent(file.fileName)}&downloaderName=${encodeURIComponent(downloaderName)}`;
        window.open(url, '_blank');
    };

    const getFileType = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
        if (['pdf'].includes(ext)) return 'pdf';
        if (['doc', 'docx'].includes(ext)) return 'doc';
        if (['xls', 'xlsx'].includes(ext)) return 'xls';
        if (['zip', 'rar'].includes(ext)) return 'zip';
        return 'other';
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const filtered = useMemo(() => 
        files.filter(f => f.fileName.toLowerCase().includes(searchQuery.toLowerCase())),
    [files, searchQuery]);

    const totalStorage = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);
    const storageLimit = 2 * 1024 * 1024 * 1024; // 2GB
    const storagePercent = (totalStorage / storageLimit) * 100;

    if (loading) return <div className="loading-files"><Spin size="large" /></div>;

    return (
        <>
        <div className="filesTab animate-in">
            <div className="files-header">
                <div className="header-info">
                    <span className="section-label">{t('project_detail.files.resource_library')}</span>
                    <h2 className="files-title">{t('project_detail.files.project_assets')} <Tag className="count-tag">{files.length}</Tag></h2>
                </div>
                <div className="files-header-actions">
                    <Input 
                        prefix={<SearchOutlined />} 
                        placeholder={t('project_detail.files.search')} 
                        style={{ width: 280, borderRadius: 10 }}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <Button 
                        type="primary" 
                        icon={<CloudUploadOutlined />} 
                        loading={uploading} 
                        onClick={() => inputRef.current?.click()}
                        className="upload-main-btn"
                    >
                        {t('project_detail.files.upload')}
                    </Button>
                    <input ref={inputRef} type="file" multiple hidden onChange={(e) => {
                        handleFileUpload(Array.from(e.target.files || []));
                    }} />
                </div>
            </div>

            {/* Mobile Tabs Relocated Below Search Bar */}
            {activeTab && onTabChange && (
                <ProjectMobileTabs activeTab={activeTab} onTabChange={onTabChange} />
            )}

            <div className="files-main-layout">
                <div className="files-content-area">
                    {/* Droppable Zone */}
                    <div
                        className={`modern-drop-zone ${dragOver ? 'active' : ''}`}
                        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOver(false);
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                handleFileUpload(Array.from(e.dataTransfer.files));
                            }
                        }}
                    >
                        <div className="drop-zone-content">
                            <div className="drop-icon-wrap">
                                <CloudUploadOutlined />
                            </div>
                            <div className="drop-text">
                                <h3>{t('project_detail.files.drop_zone')}</h3>
                                <p>{t('library.dragger_hint')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="files-grid">
                        {filtered.map(file => {
                            const type = getFileType(file.fileName);
                            const config = FILE_ICONS_CONFIG[type] || FILE_ICONS_CONFIG['other'];
                            return (
                                <div key={file.id} className="modern-file-card">
                                    <div className="file-card-visual" style={{ background: config.bg, color: config.color }}>
                                        {config.icon}
                                    </div>
                                    <div className="file-card-details">
                                        <Tooltip title={file.fileName} placement="topLeft">
                                            <h4 className="file-name">{file.fileName}</h4>
                                        </Tooltip>
                                        <div className="file-meta">
                                            <span className="file-size">{formatSize(file.size)}</span>
                                            <span className="file-dot">•</span>
                                            <span className="file-uploader">{file.uploaderName}</span>
                                        </div>
                                    </div>
                                    <div className="file-card-actions">
                                        <Button 
                                            type="text" 
                                            shape="circle" 
                                            icon={<DownloadOutlined />} 
                                            onClick={() => handleDownload(file)} 
                                            title="Tải xuống"
                                        />
                                        <Button 
                                            type="text" 
                                            shape="circle" 
                                            icon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>} 
                                            onClick={() => setPreviewFile({
                                                url: `${API_BASE_URL}/api/Upload/${file.fileId}`,
                                                name: file.fileName,
                                                size: file.size
                                            })}
                                            title="Xem trực tiếp"
                                        />
                                        <Button type="text" shape="circle" icon={<MoreOutlined />} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filtered.length === 0 && (
                        <div className="empty-files-container">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('library.no_docs')} />
                        </div>
                    )}
                </div>

                <div className="files-side-panel">
                    <div className="side-card storage-card">
                        <div className="side-card-header">
                            <DatabaseOutlined /> <span>{t('project_detail.files.storage_usage')}</span>
                        </div>
                        <div className="storage-meter">
                            <Progress 
                                percent={Math.round(storagePercent)} 
                                strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                                size="small"
                                showInfo={false}
                            />
                            <div className="storage-stats">
                                <span className="used">{formatSize(totalStorage)} {t('project_detail.files.used')}</span>
                                <span className="total">{t('project_detail.files.total')} {formatSize(storageLimit)}</span>
                            </div>
                        </div>
                        <Button block type="dashed" size="small" style={{ marginTop: 12 }}>{t('project_detail.files.upgrade_storage', { defaultValue: 'Nâng cấp bộ nhớ' })}</Button>
                    </div>

                    <div className="side-card team-card">
                        <div className="side-card-header">
                            <span>{t('library.viewers_placeholder', { defaultValue: 'Thành viên Truy cập' })}</span>
                            <span className="member-count">{members.length}</span>
                        </div>
                        <div className="member-list-mini">
                            {members.map(m => (
                                <div key={m.id} className="mini-member-item">
                                    <Avatar size="small" src={m.avatarUrl || `https://ui-avatars.com/api/?name=${m.fullName}`} />
                                    <div className="member-info">
                                        <p className="name">{m.fullName}</p>
                                        <p className="role">{m.roleLevel || t('library.role_employee')}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button 
                            block 
                            type="primary" 
                            ghost 
                            icon={<UserAddOutlined />} 
                            style={{ marginTop: 16, borderRadius: 8 }}
                        >
                            {t('project_detail.team.invite')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
        {previewFile && (
            <FilePreviewModal
                open={true}
                onClose={() => setPreviewFile(null)}
                fileUrl={previewFile.url}
                fileName={previewFile.name}
                fileSize={previewFile.size}
            />
        )}
        </>
    );
}
