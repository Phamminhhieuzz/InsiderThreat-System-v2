import React, { useRef, useEffect, useState } from 'react';
import { Modal, Spin, Button } from 'antd';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import "@cyntler/react-doc-viewer/dist/index.css";
import { renderAsync } from "docx-preview";
import { API_BASE_URL } from '../../services/api';
import './FilePreviewModal.css';

interface FilePreviewModalProps {
    open: boolean;
    onClose: () => void;
    fileUrl: string;           // Full URL to the file
    fileName: string;
    fileSize?: number;
    fileId?: string;           // Optional: used for docx-preview direct fetch
}

const getFileExt = (name: string) => name?.split('.').pop()?.toLowerCase() || '';

// --- Helper Hook for Authorized Fetch ---
const useFileBlob = (fileUrl: string) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const load = async () => {
            try {
                const token = localStorage.getItem('token');
                
                // Chuẩn hóa URL nếu là đường dẫn tương đối
                const normalizedUrl = fileUrl.startsWith('http') 
                    ? fileUrl 
                    : `${API_BASE_URL}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;

                const response = await fetch(normalizedUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error('Không thể tải tài liệu (401/404)');
                
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                if (isMounted) setBlobUrl(url);
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        load();
        return () => {
            isMounted = false;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [fileUrl]);

    return { blobUrl, loading, error };
};

// --- Word/DOCX Local Renderer ---
const DocxPreviewLocal = ({ fileUrl }: { fileUrl: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { blobUrl, loading, error } = useFileBlob(fileUrl);

    useEffect(() => {
        if (!containerRef.current || !blobUrl) return;

        const render = async () => {
            try {
                const response = await fetch(blobUrl);
                const blob = await response.blob();
                if (containerRef.current) {
                    containerRef.current.innerHTML = '';
                    await renderAsync(blob, containerRef.current, undefined, {
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        experimental: true,
                    });
                }
            } catch (err) {
                console.error('Docx render error:', err);
            }
        };

        render();
    }, [blobUrl]);

    return (
        <div className="fpv-docx-wrapper">
            {loading && (
                <div className="fpv-loading">
                    <Spin size="large" />
                    <p>Đang tải tài liệu...</p>
                </div>
            )}
            {error && <div className="fpv-error">{error}</div>}
            <div ref={containerRef} className="fpv-docx-container" />
        </div>
    );
};

// --- Image Renderer ---
const ImagePreview = ({ blobUrl, fileName }: { blobUrl: string; fileName: string }) => (
    <div className="fpv-image-wrapper">
        <img src={blobUrl} alt={fileName} className="fpv-image" />
    </div>
);

// --- PDF / Generic via DocViewer ---
const DocViewerWrapper = ({ blobUrl, fileName }: { blobUrl: string; fileName: string }) => (
    <DocViewer
        documents={[{ uri: blobUrl, fileName }]}
        pluginRenderers={DocViewerRenderers}
        config={{
            header: { disableHeader: true },
            pdfZoom: { defaultZoom: 1.0, zoomJump: 0.2 },
        }}
        style={{ height: '100%', background: 'var(--color-bg)' }}
    />
);

export default function FilePreviewModal({ open, onClose, fileUrl, fileName, fileSize }: FilePreviewModalProps) {
    const ext = getFileExt(fileName);
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    const isDocx  = ['doc', 'docx'].includes(ext);
    const { blobUrl, loading, error } = useFileBlob(fileUrl);

    const formatSize = (bytes?: number) => {
        if (!bytes) return '';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            closeIcon={null}
            width="90vw"
            style={{ top: 20, maxWidth: 1200 }}
            styles={{ body: { padding: 0, height: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' } }}
            className="file-preview-modal"
        >
            {/* Header Bar */}
            <div className="fpv-header">
                <div className="fpv-file-info">
                    <span className="fpv-filename">{fileName}</span>
                    {fileSize && <span className="fpv-filesize">{formatSize(fileSize)}</span>}
                </div>
                <div className="fpv-actions">
                    <Button
                        type="text"
                        icon={<DownloadOutlined />}
                        href={fileUrl}
                        target="_blank"
                        download={fileName}
                        className="fpv-btn"
                        title="Tải xuống"
                    />
                    <Button
                        type="text"
                        icon={<CloseOutlined />}
                        onClick={onClose}
                        className="fpv-btn fpv-btn-close"
                    />
                </div>
            </div>

            {/* Content */}
            <div className="fpv-content">
                {loading && (
                    <div className="fpv-loading">
                        <Spin size="large" />
                        <p>Đang chuẩn bị tài liệu...</p>
                    </div>
                )}
                {error && <div className="fpv-error">{error}</div>}
                
                {!loading && !error && blobUrl && (
                    <>
                        {isImage && <ImagePreview blobUrl={blobUrl} fileName={fileName} />}
                        {isDocx  && <DocxPreviewLocal fileUrl={fileUrl} />}
                        {!isImage && !isDocx && <DocViewerWrapper blobUrl={blobUrl} fileName={fileName} />}
                    </>
                )}
            </div>
        </Modal>
    );
}
