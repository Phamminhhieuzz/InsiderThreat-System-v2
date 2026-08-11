import React, { useState, useEffect, useRef } from 'react';
import { Button, Upload, message, Input, Modal, Select, Popconfirm, Avatar, Switch } from 'antd';
import {
    SearchOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api, API_BASE_URL } from '../services/api';
import BottomNavigation from '../components/BottomNavigation';
import LeftSidebar from '../components/LeftSidebar';
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import "@cyntler/react-doc-viewer/dist/index.css";
import { renderAsync } from "docx-preview";
import SecureDocumentViewer from '../components/SecureDocumentViewer';
import { preloadPhoneDetectorModel } from '../hooks/usePhoneDetector';
import './LibraryPage.css';


const DocxPreview = ({ docId }: { docId: string }) => {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        let isMounted = true;

        const loadDoc = async () => {
            try {
                setLoading(true);
                const response = await fetch(`${API_BASE_URL}/api/DocumentLibrary/${docId}/file`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                if (!response.ok) throw new Error(t('library.load_doc_fail', 'Không thể tải tài liệu'));
                const blob = await response.blob();

                if (isMounted && containerRef.current) {
                    containerRef.current.innerHTML = '';
                    await renderAsync(blob, containerRef.current, undefined, {
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: true,
                        experimental: true,
                    });
                }
            } catch (err: any) {
                console.error("Docx Preview Error:", err);
                if (isMounted) setError(err.message || t('library.preview_error', 'Lỗi khi hiển thị tài liệu'));
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadDoc();
        return () => { isMounted = false; };
    }, [docId]);

    return (
        <div style={{ width: '100%', height: '100%', overflow: 'auto', backgroundColor: 'var(--color-bg)', position: 'relative' }}>
            {loading && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '10px 20px', background: 'var(--color-surface)', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', color: 'var(--color-text-main)' }}>{t('library.loading', 'Đang tải...')}</div>}
            {error && <div style={{ padding: 20, textAlign: 'center', color: 'red' }}>{t('library.error_prefix', 'Lỗi:')} {error}</div>}
            <div ref={containerRef} style={{ padding: '20px', minHeight: '100%' }} />
        </div>
    );
};

const { Dragger } = Upload;

interface SharedDocument {
    id: string;
    fileId: string;
    fileName: string;
    contentType: string;
    uploaderId: string;
    uploaderName: string;
    uploadDate: string;
    size: number;
    description?: string;
    minimumRole: string;
    allowedUserIds?: string[];
    allowedDownloadUserIds?: string[];
    requireCamera?: boolean;
    requireWatermark?: boolean;
    enableAgentMonitoring?: boolean;
    disableMobileDownload?: boolean;
    department?: string;
    securityLevel?: string;
}

interface UserSummary {
    id: string;
    username: string;
    fullName: string;
    role: string;
    department: string;
}

const LibraryPage = () => {
    const { t } = useTranslation();
    const [documents, setDocuments] = useState<SharedDocument[]>([]);
    const [allUsers, setAllUsers] = useState<UserSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [isUploadModalVisible, setIsUploadModalVisible] = useState(false);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editingDocument, setEditingDocument] = useState<SharedDocument | null>(null);
    const [previewingDocument, setPreviewingDocument] = useState<SharedDocument | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [uploadFileList, setUploadFileList] = useState<any[]>([]);

    // Form states
    const [description, setDescription] = useState('');
    const [minRole, setMinRole] = useState('Nhân viên');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [selectedDownloadUserIds, setSelectedDownloadUserIds] = useState<string[]>([]);
    const [requireCamera, setRequireCamera] = useState(true);
    const [requireWatermark, setRequireWatermark] = useState(true);
    const [enableAgentMonitoring, setEnableAgentMonitoring] = useState(true);
    const [disableMobileDownload, setDisableMobileDownload] = useState(false);
    const [department, setDepartment] = useState('General');
    const [securityLevel, setSecurityLevel] = useState('Internal');
    const [filterDept, setFilterDept] = useState('All');
    const [filterLevel, setFilterLevel] = useState('All');

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const data = await api.get<SharedDocument[]>('/api/DocumentLibrary');
            setDocuments(data);
        } catch (error) {
            console.error('Error fetching documents:', error);
            message.error(t('library.load_list_fail', 'Không thể tải danh sách tài liệu'));
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const users = await api.get<UserSummary[]>('/api/Users');
            setAllUsers(users.filter(u => u.username !== user.username));
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    useEffect(() => {
        fetchDocuments();
        fetchUsers();
        // Tải trước mô hình AI trong nền để mở tài liệu là hiện ra ngay lập tức
        preloadPhoneDetectorModel();
    }, []);

    const handleDownload = async (doc: SharedDocument) => {
        try {
            message.loading({ content: t('library.downloading', 'Đang chuẩn bị tải xuống...'), key: 'downloading' });
            const response = await fetch(`${API_BASE_URL}/api/DocumentLibrary/download/${doc.fileId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = doc.fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            message.success({ content: t('library.download_success', 'Tải xuống thành công!'), key: 'downloading', duration: 2 });
        } catch (error) {
            console.error('Download error:', error);
            message.error({ content: t('library.download_fail', 'Lỗi khi tải xuống tài liệu.'), key: 'downloading', duration: 2 });
        }
    };

    const handlePreview = (doc: SharedDocument) => {
        setPreviewingDocument(doc);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/api/DocumentLibrary/${id}`);
            message.success(t('library.delete_success', 'Đã xóa tài liệu'));
            fetchDocuments();
        } catch (error) {
            message.error(t('library.delete_fail', 'Không thể xóa tài liệu'));
        }
    };

    const handleOpenEditModal = (doc: SharedDocument) => {
        console.log('Opening edit modal for doc:', doc);
        setEditingDocument(doc);
        setMinRole(doc.minimumRole);
        setSelectedUserIds(doc.allowedUserIds || []);
        setSelectedDownloadUserIds(doc.allowedDownloadUserIds || []);
        setRequireCamera(doc.requireCamera ?? true);
        setRequireWatermark(doc.requireWatermark ?? true);
        setEnableAgentMonitoring(doc.enableAgentMonitoring ?? true);
        setDisableMobileDownload(doc.disableMobileDownload ?? false);
        setDepartment(doc.department || 'General');
        setSecurityLevel(doc.securityLevel || 'Internal');
        setIsEditModalVisible(true);
    };

    const handleUpdatePermissions = async () => {
        if (!editingDocument) return;

        console.log('Updating permissions with:', {
            department,
            securityLevel,
            minRole
        });

        setLoading(true);
        try {
            await api.put(`/api/DocumentLibrary/${editingDocument.id}/permissions`, {
                minimumRole: minRole,
                allowedUserIds: selectedUserIds,
                allowedDownloadUserIds: selectedDownloadUserIds,
                requireCamera,
                requireWatermark,
                enableAgentMonitoring,
                disableMobileDownload,
                department: department,
                securityLevel: securityLevel
            });
            message.success(t('library.update_success', 'Đã cập nhật cấu hình bảo mật và quyền truy cập'));
            setIsEditModalVisible(false);
            fetchDocuments();
        } catch (error) {
            console.error('Error updating permissions:', error);
            message.error(t('library.update_fail', 'Không thể cập nhật quyền truy cập'));
        } finally {
            setLoading(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getRoleBadgeStyle = (role: string) => {
        switch (role) {
            case 'Giám đốc': return { bg: 'rgba(234, 88, 12, 0.15)', color: '#ea580c' }; // Orange
            case 'Quản lý': return { bg: 'rgba(29, 78, 216, 0.15)', color: '#3b82f6' }; // Blue
            case 'Nhân viên': return { bg: 'rgba(21, 128, 61, 0.15)', color: '#22c55e' }; // Green
            default: return { bg: 'var(--color-surface-lighter)', color: 'var(--color-text-muted)' };
        }
    };

    const getFileIconColor = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'doc':
            case 'docx': return { icon: 'description', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.15)' };
            case 'xls':
            case 'xlsx': return { icon: 'table_view', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.15)' };
            case 'pdf': return { icon: 'picture_as_pdf', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
            default: return { icon: 'draft', color: 'var(--color-text-muted)', bg: 'var(--color-surface-lighter)' };
        }
    };

    const getSecurityLevelStyle = (level: string) => {
        switch (level) {
            case 'Restricted': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'TUYỆT MẬT' }; // Red
            case 'Confidential': return { bg: 'rgba(217, 70, 239, 0.15)', color: '#d946ef', label: 'BẢO MẬT' }; // Purple
            case 'Internal': return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'NỘI BỘ' }; // Blue
            case 'Public': return { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'CÔNG KHAI' }; // Green
            default: return { bg: 'var(--color-surface-lighter)', color: 'var(--color-text-muted)', label: 'NỘI BỘ' };
        }
    };

    const getDepartmentStyle = (dept: string) => {
        switch (dept) {
            case 'Engineering': return { icon: 'code', label: 'Engineering' };
            case 'Product': return { icon: 'inventory_2', label: 'Product' };
            case 'Security': return { icon: 'verified_user', label: 'Security' };
            case 'Business': return { icon: 'payments', label: 'Business' };
            case 'HR': return { icon: 'groups', label: 'HR & Admin' };
            default: return { icon: 'folder', label: 'Chung' };
        }
    };

    const uploadProps = {
        name: 'file',
        multiple: true,
        action: `${API_BASE_URL}/api/DocumentLibrary`,
        headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        data: {
            description,
            minimumRole: minRole,
            allowedUserIdsJson: JSON.stringify(selectedUserIds),
            allowedDownloadUserIdsJson: JSON.stringify(selectedDownloadUserIds),
            requireCamera,
            requireWatermark,
            enableAgentMonitoring,
            disableMobileDownload,
            department,
            securityLevel
        },
        showFileList: false,
        onChange(info: any) {
            setUploadFileList(info.fileList);
            const { status } = info.file;
            if (status === 'done') {
                message.success(t('library.upload_success', { name: info.file.name, defaultValue: `${info.file.name} đã được tải lên thành công.` }));
                fetchDocuments();
                setIsUploadModalVisible(false);
                setUploadFileList([]);
                setDescription('');
                setSelectedUserIds([]);
                setSelectedDownloadUserIds([]);
                setMinRole('Nhân viên');
                setRequireCamera(true);
                setRequireWatermark(true);
                setEnableAgentMonitoring(true);
                setDisableMobileDownload(false);
                setDepartment('General');
                setSecurityLevel('Internal');
            } else if (status === 'error') {
                const errorMsg = info.file.response?.message || info.file.response || t('library.unknown_error', "Lỗi không xác định");
                message.error(t('library.upload_fail', { name: info.file.name, error: errorMsg, defaultValue: `${info.file.name} tải lên thất bại: ${errorMsg}` }));
            }
        },
    };

    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.fileName?.toLowerCase().includes(searchText.toLowerCase()) || 
                              doc.uploaderName?.toLowerCase().includes(searchText.toLowerCase());
        const matchesDept = filterDept === 'All' || doc.department === filterDept;
        const matchesLevel = filterLevel === 'All' || doc.securityLevel === filterLevel;
        return matchesSearch && matchesDept && matchesLevel;
    });

    return (
        <div className="library-container">
            {!isMobile && <LeftSidebar />}

            <div className="library-main-wrapper">
                <header className="mobile-library-header">
                    <div className="library-icon-badge">
                        <span className="material-symbols-outlined">folder</span>
                    </div>
                    <div className="library-header-text">
                        <h1>{t('library.title', 'Kho tài liệu')}</h1>
                        <p>{t('library.subtitle', 'Quản lý và chia sẻ tài liệu nội bộ')}</p>
                    </div>

                    {!isMobile && (user.role?.toLowerCase() === 'admin' || user.role?.toLowerCase() === 'giám đốc' || user.role?.toLowerCase() === 'giam doc') && (
                        <Button
                            type="primary"
                            size="large"
                            icon={<span className="material-symbols-outlined" style={{ fontSize: '20px', verticalAlign: 'middle', marginRight: '8px' }}>upload_file</span>}
                            onClick={() => setIsUploadModalVisible(true)}
                            className="desktop-upload-btn"
                        >
                            {t('library.add_btn', 'Thêm tài liệu')}
                        </Button>
                    )}


                </header>

                <div className="mobile-search-wrapper">
                    <Input
                        placeholder={t('library.search_placeholder', "Tìm kiếm tài liệu hoặc người đăng...")}
                        prefix={<SearchOutlined style={{ color: 'var(--color-text-muted)' }} />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="mobile-search-input"
                        allowClear
                    />
                </div>

                <div className="mobile-filter-bar" style={{ 
                    padding: '0 16px 12px', 
                    display: 'flex', 
                    gap: '8px', 
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                }}>
                    <Select
                        size="middle"
                        value={filterDept}
                        onChange={setFilterDept}
                        style={{ minWidth: '120px' }}
                        options={[
                            { value: 'All', label: 'Tất cả Phòng ban' },
                            { value: 'Engineering', label: 'Engineering' },
                            { value: 'Product', label: 'Product' },
                            { value: 'Security', label: 'Security' },
                            { value: 'Business', label: 'Business' },
                            { value: 'HR', label: 'HR & Admin' },
                        ]}
                    />
                    <Select
                        size="middle"
                        value={filterLevel}
                        onChange={setFilterLevel}
                        style={{ minWidth: '120px' }}
                        options={[
                            { value: 'All', label: 'Tất cả Bảo mật' },
                            { value: 'Public', label: 'Công khai' },
                            { value: 'Internal', label: 'Nội bộ' },
                            { value: 'Confidential', label: 'Mật' },
                            { value: 'Restricted', label: 'Tuyệt mật' },
                        ]}
                    />
                </div>

                <main className="mobile-document-list">
                    {loading && documents.length === 0 ? (
                        <div className="p-10 text-center">{t('library.loading_docs', 'Đang tải tài liệu...')}</div>
                    ) : filteredDocs.length === 0 ? (
                        <div className="empty-library">
                            <span className="material-symbols-outlined">folder_off</span>
                            <p>{t('library.no_docs', 'Không thấy tài liệu nào')}</p>
                        </div>
                    ) : (
                        <div className="doc-grid">
                            {filteredDocs.map(doc => {
                                const iconData = getFileIconColor(doc.fileName);
                                const badgeStyle = getRoleBadgeStyle(doc.minimumRole);
                                
                                // Quyền tải xuống: Admin, Người tạo file, hoặc những người có trong danh sách AllowedDownloadUserIds
                                const userCanDownload = user.role?.toLowerCase() === 'admin' || 
                                                    user.role?.toLowerCase() === 'giám đốc' || 
                                                    user.role?.toLowerCase() === 'giam doc' || 
                                                    doc.uploaderId === user.id || 
                                                    (doc.allowedDownloadUserIds && doc.allowedDownloadUserIds.includes(user.id));
                                
                                // Nếu là mobile và bật chế độ ẩn download thì ghi đè quyền uCanDownload
                                const finalCanDownload = userCanDownload && !(isMobile && doc.disableMobileDownload);

                                return (
                                    <div key={doc.id} className="doc-card">
                                        <div className="doc-card-header">
                                            <div className="doc-icon-container" style={{ backgroundColor: iconData.bg, color: iconData.color }}>
                                                <span className="material-symbols-outlined">{iconData.icon}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                <span className="role-badge-compact" style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.color }}>
                                                    {doc.minimumRole}
                                                </span>
                                                <span className="role-badge-compact" style={{ 
                                                    backgroundColor: getSecurityLevelStyle(doc.securityLevel || 'Internal').bg, 
                                                    color: getSecurityLevelStyle(doc.securityLevel || 'Internal').color,
                                                    fontSize: '10px',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontWeight: 700
                                                }}>
                                                    {getSecurityLevelStyle(doc.securityLevel || 'Internal').label}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="doc-info">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                                                    {getDepartmentStyle(doc.department || 'General').icon}
                                                </span>
                                                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                                    {getDepartmentStyle(doc.department || 'General').label}
                                                </span>
                                            </div>
                                            <h3>{doc.fileName}</h3>
                                            <p className="doc-uploader">{doc.uploaderName}</p>
                                        </div>

                                        <div className="doc-metadata">
                                            <div className="meta-item">
                                                <span className="material-symbols-outlined">calendar_today</span>
                                                <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                                            </div>
                                            <div className="meta-item">
                                                <span className="material-symbols-outlined">database</span>
                                                <span>{formatSize(doc.size)}</span>
                                            </div>
                                        </div>

                                        <div className="doc-actions">
                                            {finalCanDownload && (
                                                <button className="doc-action-btn" onClick={() => handleDownload(doc)} title={t('library.tooltip_download', "Tải xuống")}>
                                                    <span className="material-symbols-outlined">download</span>
                                                </button>
                                            )}
                                            {(user.role?.toLowerCase() === 'admin' || user.role?.toLowerCase() === 'giám đốc' || user.role?.toLowerCase() === 'giam doc') && (
                                                <button className="doc-action-btn" onClick={() => handleOpenEditModal(doc)}>
                                                    <span className="material-symbols-outlined">edit</span>
                                                </button>
                                            )}
                                            <button className="doc-action-btn" onClick={() => handlePreview(doc)} title={t('library.tooltip_preview', "Xem trực tiếp")}>
                                                <span className="material-symbols-outlined">visibility</span>
                                            </button>
                                            {(user.role?.toLowerCase() === 'admin' || user.role?.toLowerCase() === 'giám đốc' || user.role?.toLowerCase() === 'giam doc') && (
                                                <Popconfirm
                                                    title={t('library.delete_title', "Xóa tài liệu")}
                                                    description={t('library.delete_confirm', "Bạn có muốn xóa vĩnh viễn tệp này?")}
                                                    onConfirm={() => handleDelete(doc.id)}
                                                    okText={t('library.btn_delete', "Xóa")}
                                                    cancelText={t('library.btn_cancel', "Hủy")}
                                                    okButtonProps={{ danger: true }}
                                                >
                                                    <button className="doc-action-btn delete-btn">
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                </Popconfirm>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>

                <div className="pagination-dots">
                    <div className="dot active"></div>
                    <div className="dot"></div>
                    <div className="dot"></div>
                </div>

                {isMobile && (
                    <button className="dark-mode-fab">
                        <span className="material-symbols-outlined">dark_mode</span>
                    </button>
                )}

                {(user.role?.toLowerCase() === 'admin' || user.role?.toLowerCase() === 'giám đốc' || user.role?.toLowerCase() === 'giam doc') && (
                    <button className="floating-upload-btn" onClick={() => setIsUploadModalVisible(true)}>
                        <span className="material-symbols-outlined">upload_file</span>
                    </button>
                )}

                <BottomNavigation />
            </div>

            <Modal
                title={null}
                open={isUploadModalVisible}
                onCancel={() => setIsUploadModalVisible(false)}
                footer={null}
                className="mobile-modal"
                width={isMobile ? "100%" : 600}
                style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw' } : {}}
                getContainer={false} // Help with potential z-index/portal issues for selects
            >
                <div className="modal-header-mobile">
                    <button className="back-btn-mobile" onClick={() => setIsUploadModalVisible(false)}>
                        <span className="material-symbols-outlined">arrow_back_ios</span>
                    </button>
                    <h2>{t('library.upload_title', 'Tải tài liệu lên')}</h2>
                </div>

                <div className="modal-body-mobile">
                    <div className="upload-field">
                        <label className="field-label">{t('library.field_name', 'Tên tài liệu')}</label>
                        <Input
                            placeholder={t('library.name_placeholder', "Nhập tên tài liệu...")}
                            className="mobile-input"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="upload-field">
                            <label className="field-label">Phòng ban & Chức năng</label>
                            <Select
                                className="mobile-select"
                                value={department}
                                onChange={setDepartment}
                                getPopupContainer={triggerNode => triggerNode.parentElement}
                                options={[
                                    { value: 'Engineering', label: 'Engineering & Tech' },
                                    { value: 'Product', label: 'Product Management' },
                                    { value: 'Security', label: 'Security & Compliance' },
                                    { value: 'Business', label: 'Business & Finance' },
                                    { value: 'HR', label: 'HR & Admin' },
                                    { value: 'General', label: 'Chung (General)' },
                                ]}
                            />
                        </div>
                        <div className="upload-field">
                            <label className="field-label">Cấp độ Bảo mật</label>
                            <Select
                                className="mobile-select"
                                value={securityLevel}
                                onChange={setSecurityLevel}
                                getPopupContainer={triggerNode => triggerNode.parentElement}
                                options={[
                                    { value: 'Public', label: 'Public (Công khai)' },
                                    { value: 'Internal', label: 'Internal (Nội bộ)' },
                                    { value: 'Confidential', label: 'Confidential (Mật)' },
                                    { value: 'Restricted', label: 'Restricted (Tuyệt mật)' },
                                ]}
                            />
                        </div>
                    </div>


                    <div className="upload-field">
                        <label className="field-label">{t('library.field_min_role', 'Cấp bậc tối thiểu')}</label>
                        <Select
                            className="mobile-select"
                            value={minRole}
                            onChange={value => setMinRole(value)}
                            getPopupContainer={triggerNode => triggerNode.parentElement}
                            options={[
                                { value: 'Giám đốc', label: t('library.role_director', 'Giám đốc') },
                                { value: 'Quản lý', label: t('library.role_manager_up', 'Quản lý trở lên') },
                                { value: 'Nhân viên', label: t('library.role_all_employees', 'Tất cả nhân viên') },
                            ]}
                        />
                    </div>

                    <div className="upload-field">
                        <label className="field-label">{t('library.field_viewers', 'Người được xem (Tùy chọn)')}</label>
                        <Select
                            mode="multiple"
                            className="mobile-select"
                            placeholder={t('library.viewers_placeholder', "Chọn người được phép xem...")}
                            value={selectedUserIds}
                            onChange={ids => setSelectedUserIds(ids)}
                            getPopupContainer={triggerNode => triggerNode.parentElement}
                            options={allUsers.map(u => ({
                                value: u.id,
                                label: `${u.fullName} (${u.username})`
                            }))}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </div>

                    <div className="upload-field">
                        <label className="field-label">Người được tải xuống (Tùy chọn)</label>
                        <Select
                            mode="multiple"
                            className="mobile-select"
                            placeholder="Người được phép tải xuống..."
                            value={selectedDownloadUserIds}
                            onChange={ids => setSelectedDownloadUserIds(ids)}
                            getPopupContainer={triggerNode => triggerNode.parentElement}
                            options={allUsers.map(u => ({
                                value: u.id,
                                label: `${u.fullName} (${u.username})`
                            }))}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Yêu cầu Camera AI (Chống chụp trộm màn hình)</label>
                        <Switch checked={requireCamera} onChange={setRequireCamera} />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Kích hoạt Dynamic Watermark (Đóng dấu IP)</label>
                        <Switch checked={requireWatermark} onChange={setRequireWatermark} />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Kích hoạt Giám sát Agent (Chống copy/gửi file)</label>
                        <Switch checked={enableAgentMonitoring} onChange={setEnableAgentMonitoring} />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Ẩn nút tải xuống trên Mobile</label>
                        <Switch checked={disableMobileDownload} onChange={setDisableMobileDownload} />
                    </div>

                    <div className="upload-field">
                        <label className="field-label">{t('library.field_upload', 'Tải tệp lên')}</label>
                        <Dragger {...uploadProps} className="dragger-mobile">
                            <div className="dragger-content-mobile">
                                <div className="upload-cloud-icon">
                                    <span className="material-symbols-outlined">cloud_upload</span>
                                </div>
                                <div className="dragger-text">
                                    <h4>{t('library.dragger_title', 'Kéo và thả hoặc Chọn tệp')}</h4>
                                    <p>{t('library.dragger_hint', 'Hỗ trợ Word, Excel, PDF (Tối đa 25MB)')}</p>
                                </div>
                            </div>
                        </Dragger>

                        <div className="mobile-file-list">
                            {uploadFileList.map(file => (
                                <div key={file.uid} className="mobile-file-item">
                                    <div className="doc-icon-container" style={{ width: 32, height: 32, fontSize: 18, backgroundColor: 'rgba(37, 99, 235, 0.15)', color: '#2563eb' }}>
                                        <span className="material-symbols-outlined">description</span>
                                    </div>
                                    <div className="file-name-info">
                                        <span className="name">{file.name}</span>
                                        <span className="size">{formatSize(file.size || 0)}</span>
                                    </div>
                                    <button className="remove-file-btn">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="modal-footer-mobile">
                    <Button type="primary" className="mobile-primary-btn" onClick={() => (document.querySelector('.dragger-mobile input') as HTMLInputElement)?.click()}>
                        {t('library.btn_upload', 'Tải lên')}
                    </Button>
                    <Button className="mobile-secondary-btn" onClick={() => setIsUploadModalVisible(false)}>
                        {t('library.btn_cancel', 'Hủy')}
                    </Button>
                </div>
            </Modal>

            {/* Edit Permissions Modal */}
            <Modal
                title={null}
                open={isEditModalVisible}
                onCancel={() => setIsEditModalVisible(false)}
                footer={null}
                className="mobile-modal"
                width={isMobile ? "100%" : 600}
                style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw' } : {}}
                getContainer={false}
            >
                <div className="modal-header-mobile">
                    <button className="back-btn-mobile" onClick={() => setIsEditModalVisible(false)}>
                        <span className="material-symbols-outlined">arrow_back_ios</span>
                    </button>
                    <h2>{t('library.edit_title', 'Sửa quyền xem')}</h2>
                </div>

                <div className="modal-body-mobile">
                    <div className="upload-field">
                        <label className="field-label">{t('library.field_name', 'Tên tài liệu')}</label>
                        <Input
                            value={editingDocument?.fileName}
                            disabled
                            className="mobile-input"
                            style={{ opacity: 0.7 }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="upload-field">
                            <label className="field-label">Phòng ban & Chức năng</label>
                            <Select
                                className="mobile-select"
                                value={department}
                                onChange={setDepartment}
                                getPopupContainer={triggerNode => triggerNode.parentElement}
                                options={[
                                    { value: 'Engineering', label: 'Engineering & Tech' },
                                    { value: 'Product', label: 'Product Management' },
                                    { value: 'Security', label: 'Security & Compliance' },
                                    { value: 'Business', label: 'Business & Finance' },
                                    { value: 'HR', label: 'HR & Admin' },
                                    { value: 'General', label: 'Chung (General)' },
                                ]}
                            />
                        </div>
                        <div className="upload-field">
                            <label className="field-label">Cấp độ Bảo mật</label>
                            <Select
                                className="mobile-select"
                                value={securityLevel}
                                onChange={setSecurityLevel}
                                getPopupContainer={triggerNode => triggerNode.parentElement}
                                options={[
                                    { value: 'Public', label: 'Public (Công khai)' },
                                    { value: 'Internal', label: 'Internal (Nội bộ)' },
                                    { value: 'Confidential', label: 'Confidential (Mật)' },
                                    { value: 'Restricted', label: 'Restricted (Tuyệt mật)' },
                                ]}
                            />
                        </div>
                    </div>


                    <div className="upload-field">
                        <label className="field-label">{t('library.field_min_role', 'Cấp bậc tối thiểu')}</label>
                        <Select
                            className="mobile-select"
                            value={minRole}
                            onChange={value => setMinRole(value)}
                            getPopupContainer={triggerNode => triggerNode.parentElement}
                            options={[
                                { value: 'Giám đốc', label: t('library.role_director', 'Giám đốc') },
                                { value: 'Quản lý', label: t('library.role_manager_up', 'Quản lý trở lên') },
                                { value: 'Nhân viên', label: t('library.role_all_employees', 'Tất cả nhân viên') },
                            ]}
                        />
                    </div>

                    <div className="upload-field">
                        <label className="field-label">{t('library.field_viewers', 'Người được xem (Tùy chọn)')}</label>
                        <Select
                            mode="multiple"
                            className="mobile-select"
                            placeholder={t('library.viewers_placeholder', "Chọn người được phép xem...")}
                            value={selectedUserIds}
                            onChange={ids => setSelectedUserIds(ids)}
                            getPopupContainer={triggerNode => triggerNode.parentElement}
                            options={allUsers.map(u => ({
                                value: u.id,
                                label: `${u.fullName} (${u.username})`
                            }))}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </div>

                    <div className="upload-field">
                        <label className="field-label">Người được tải xuống (Tùy chọn)</label>
                        <Select
                            mode="multiple"
                            className="mobile-select"
                            placeholder="Người được phép tải xuống..."
                            value={selectedDownloadUserIds}
                            onChange={ids => setSelectedDownloadUserIds(ids)}
                            getPopupContainer={triggerNode => triggerNode.parentElement}
                            options={allUsers.map(u => ({
                                value: u.id,
                                label: `${u.fullName} (${u.username})`
                            }))}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Yêu cầu Camera AI (Chống chụp trộm màn hình)</label>
                        <Switch checked={requireCamera} onChange={setRequireCamera} />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Kích hoạt Dynamic Watermark (Đóng dấu IP)</label>
                        <Switch checked={requireWatermark} onChange={setRequireWatermark} />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Kích hoạt Giám sát Agent (Chống copy/gửi file)</label>
                        <Switch checked={enableAgentMonitoring} onChange={setEnableAgentMonitoring} />
                    </div>

                    <div className="upload-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Ẩn nút tải xuống trên Mobile</label>
                        <Switch checked={disableMobileDownload} onChange={setDisableMobileDownload} />
                    </div>
                </div>

                <div className="modal-footer-mobile">
                    <Button
                        type="primary"
                        className="mobile-primary-btn"
                        onClick={handleUpdatePermissions}
                        loading={loading}
                    >
                        {t('library.btn_save', 'Lưu thay đổi')}
                    </Button>
                    <Button className="mobile-secondary-btn" onClick={() => setIsEditModalVisible(false)}>
                        {t('library.btn_cancel', 'Hủy')}
                    </Button>
                </div>
            </Modal>

            {/* Preview Document Modal */}
            <Modal
                title={previewingDocument?.fileName}
                open={!!previewingDocument}
                onCancel={() => setPreviewingDocument(null)}
                footer={null}
                width={1000}
                style={{ top: 20 }}
                styles={{ body: { height: '80vh', padding: 0 } }}
                destroyOnHidden={true}
            >
                {previewingDocument && (
                    <SecureDocumentViewer 
                        documentName={previewingDocument.fileName}
                        requireCamera={previewingDocument.requireCamera ?? true}
                        requireWatermark={previewingDocument.requireWatermark ?? true}
                    >
                        {previewingDocument.fileName.toLowerCase().endsWith('.docx') ? (
                            <DocxPreview docId={previewingDocument.id} />
                        ) : (
                            <DocViewer
                                documents={[
                                    {
                                        uri: `${API_BASE_URL}/api/Upload/${previewingDocument.fileId}`,
                                        fileType: previewingDocument.fileName.split('.').pop()?.toLowerCase(),
                                        fileName: previewingDocument.fileName
                                    }
                                ]}
                                pluginRenderers={DocViewerRenderers}
                                style={{ height: '100%' }}
                                config={{
                                    header: {
                                        disableHeader: true,
                                        disableFileName: true,
                                        retainURLParams: false
                                    }
                                }}
                            />
                        )}
                    </SecureDocumentViewer>
                )}
            </Modal>
        </div>
    );
};

export default LibraryPage;
