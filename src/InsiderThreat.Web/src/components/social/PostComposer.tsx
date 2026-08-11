import { Card, Avatar, Input, Button, message, Upload, Space, Progress, Tag } from 'antd';
import { UserOutlined, PictureOutlined, VideoCameraOutlined, SmileOutlined, SendOutlined, CloseCircleFilled, FileImageOutlined, PlaySquareOutlined, BarChartOutlined, PlusOutlined } from '@ant-design/icons';
import { useState, useRef } from 'react';
import api from '../../services/api';
import styles from './PostComposer.module.css';
import axios from 'axios';

interface PostComposerProps {
    onPostCreated?: (post: any) => void;
}

interface SelectedFile {
    file: File;
    preview: string;
    type: 'image' | 'video';
}

const PostComposer: React.FC<PostComposerProps> = ({ onPostCreated }) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isPollMode, setIsPollMode] = useState(false);
    const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const newSelectedFiles: SelectedFile[] = files.map(file => {
                const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
                return {
                    file,
                    preview: URL.createObjectURL(file),
                    type
                };
            });
            setSelectedFiles([...selectedFiles, ...newSelectedFiles]);
        }
    };

    const removeFile = (index: number) => {
        const newFiles = [...selectedFiles];
        URL.revokeObjectURL(newFiles[index].preview);
        newFiles.splice(index, 1);
        setSelectedFiles(newFiles);
    };

    const handlePost = async () => {
        if (!content.trim() && selectedFiles.length === 0 && (!isPollMode || pollOptions.every(opt => !opt.trim()))) {
            message.warning('Please write something or specify poll options!');
            return;
        }

        const validPollOptions = pollOptions.filter(opt => opt.trim() !== '');
        if (isPollMode && validPollOptions.length < 2) {
            message.warning('A poll must have at least 2 options!');
            return;
        }

        try {
            setLoading(true);
            setUploadProgress(0);

            // 1. Upload files first if any
            const uploadedMedia = [];
            for (let i = 0; i < selectedFiles.length; i++) {
                const { file, type } = selectedFiles[i];
                const formData = new FormData();
                formData.append('file', file);

                // Dùng axios trực tiếp để theo dõi progress
                const token = localStorage.getItem('token');
                const uploadRes = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'https://tuyen-thda.io.vn'}/api/upload`, formData, {
                    headers: { 
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    },
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                        setUploadProgress(percentCompleted);
                    }
                });

                uploadedMedia.push({
                    url: uploadRes.data.url,
                    type: type === 'video' ? 'video' : 'image',
                    fileName: file.name
                });
            }

            // 2. Create the post
            const type = isPollMode ? 'Poll' : (selectedFiles.some(f => f.type === 'video') ? 'Video' : (selectedFiles.length > 0 ? 'Image' : 'Text'));
            
            const newPost = await api.post<any>('/api/socialfeed/posts', {
                content: content.trim(),
                privacy: 'Public',
                type,
                mediaFiles: uploadedMedia,
                pollOptions: isPollMode ? validPollOptions : undefined,
                multipleChoice: false,
                pollDurationDays: 7
            });

            // Cleanup
            setContent('');
            setIsPollMode(false);
            setPollOptions(['', '']);
            selectedFiles.forEach(f => URL.revokeObjectURL(f.preview));
            setSelectedFiles([]);
            setUploadProgress(0);
            
            message.success('Posted successfully!');
            if (onPostCreated) onPostCreated(newPost);
        } catch (error: any) {
            console.error('Error creating post:', error);
            message.error(error.response?.data?.message || 'Failed to create post. File might be too large.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className={styles.composer}>
            <div className={styles.input}>
                <Avatar size={40} icon={<UserOutlined />} src={user.avatarUrl} />
                <Input.TextArea
                    className={styles.textarea}
                    placeholder={`What's on your mind, ${user.fullName || 'User'}?`}
                    variant="borderless"
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                />
            </div>

            {/* Preview Section */}
            {selectedFiles.length > 0 && (
                <div style={{ padding: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {selectedFiles.map((file, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '100px', height: '100px' }}>
                            {file.type === 'image' ? (
                                <img src={file.preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', borderRadius: '8px', color: '#fff' }}>
                                    <PlaySquareOutlined style={{ fontSize: '24px' }} />
                                </div>
                            )}
                            <CloseCircleFilled 
                                style={{ position: 'absolute', top: '-5px', right: '-5px', color: '#ff4d4f', fontSize: '18px', cursor: 'pointer', background: '#fff', borderRadius: '50%' }} 
                                onClick={() => removeFile(idx)}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Poll Section */}
            {isPollMode && (
                <div className={styles.pollSection}>
                    <div className={styles.pollHeader}>
                        <span className={styles.pollTitle}>Bình chọn</span>
                        <CloseCircleFilled 
                            className={styles.pollClose} 
                            onClick={() => setIsPollMode(false)}
                        />
                    </div>
                    <div className={styles.pollOptions}>
                        {pollOptions.map((option, idx) => (
                            <div key={idx} className={styles.pollOptionInput}>
                                <Input 
                                    placeholder={`Lựa chọn ${idx + 1}`} 
                                    value={option}
                                    onChange={(e) => {
                                        const newOpts = [...pollOptions];
                                        newOpts[idx] = e.target.value;
                                        setPollOptions(newOpts);
                                    }}
                                />
                                {pollOptions.length > 2 && (
                                    <CloseCircleFilled 
                                        className={styles.removeOption}
                                        onClick={() => {
                                            const newOpts = pollOptions.filter((_, i) => i !== idx);
                                            setPollOptions(newOpts);
                                        }}
                                    />
                                )}
                            </div>
                        ))}
                        <Button 
                            type="dashed" 
                            onClick={() => setPollOptions([...pollOptions, ''])} 
                            block
                            icon={<PlusOutlined />}
                        >
                            Thêm lựa chọn
                        </Button>
                    </div>
                </div>
            )}

            {/* Progress Bar */}
            {loading && uploadProgress > 0 && uploadProgress < 100 && (
                <div style={{ padding: '0 16px 10px' }}>
                    <Progress percent={uploadProgress} size="small" status="active" />
                    <div style={{ fontSize: '10px', textAlign: 'center' }}>Uploading media...</div>
                </div>
            )}

            <div className={styles.divider} />

            <div className={styles.actions}>
                <input 
                    type="file" 
                    hidden 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    multiple 
                    accept="image/*,video/*"
                />
                
                <div className={styles.action} onClick={() => fileInputRef.current?.click()}>
                    <PictureOutlined style={{ color: '#45bd62' }} />
                    <span>Photo/Video</span>
                </div>
                <div className={styles.action} onClick={() => message.info('Live streaming coming soon!')}>
                    <VideoCameraOutlined style={{ color: '#f3425f' }} />
                    <span>Live Video</span>
                </div>
                <div className={styles.action} onClick={() => setIsPollMode(!isPollMode)}>
                    <BarChartOutlined style={{ color: '#2563eb' }} />
                    <span>Poll</span>
                </div>
                
                <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={loading}
                    onClick={handlePost}
                    style={{ marginLeft: 'auto', borderRadius: '20px', padding: '0 20px' }}
                >
                    Post
                </Button>
            </div>
        </Card>
    );
};

export default PostComposer;
