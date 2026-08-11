import { useState, useCallback, useRef, useEffect } from 'react';
import { Typography, Card, Input, Button, Space, message, Layout, Tag, Tooltip, Badge, Tabs, notification, Switch } from 'antd';
import {
    VideoCameraOutlined, EnterOutlined, ApiOutlined,
    AudioOutlined, AudioMutedOutlined, DesktopOutlined,
    PhoneOutlined, CopyOutlined, VideoCameraAddOutlined, PushpinFilled,
    FileTextOutlined, DownloadOutlined, AudioFilled,
    TeamOutlined, MessageOutlined, SendOutlined,
    CheckOutlined, CloseOutlined, RiseOutlined, MoreOutlined,
} from '@ant-design/icons';
import { Dropdown, Drawer } from 'antd';
import { useSpeechTranscript } from '../hooks/useSpeechTranscript';
import { authService } from '../services/auth';
import { useWebRTC } from '../hooks/useWebRTC';
import type { PeerState } from '../hooks/useWebRTC';
import { useTranslation } from 'react-i18next';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import styles from './MeetPage.module.css';


const { Title, Text } = Typography;
const { Content } = Layout;

export default function MeetPage() {
    const { t } = useTranslation();
    const [inputCode, setInputCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [requireApproval, setRequireApproval] = useState(() => {
        return localStorage.getItem('meet_require_approval') === 'true';
    });

    useEffect(() => {
        localStorage.setItem('meet_require_approval', requireApproval.toString());
    }, [requireApproval]);

    const user = authService.getCurrentUser();
    const myConnectionId = useRef<string>('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const {
        localStream, peers, roomCode, isConnected,
        isAudioEnabled, isVideoEnabled, isScreenSharing,
        peerUpdateCounter, transcripts, sendTranscript,
        chatMessages, raisedHands, waitingList, isWaiting, isJoinRejected, mutedByHost,
        isRoomHost, isTranscriptActive,
        createRoom, joinRoom, leaveRoom,
        toggleAudio, toggleVideo, toggleScreenShare,
        startTranscript, stopTranscript,
        sendChatMessage, raiseHand, lowerHand,
        muteParticipant, muteAll, unmuteAll,
        approveParticipant, rejectParticipant,
        screenSharingPeers,
    } = useWebRTC();

    const inMeeting = !!roomCode;
    const myName = user?.fullName || user?.username || t('meet.lbl_you', 'Bạn');
    const isHandRaised = raisedHands.has(myConnectionId.current);

    // Auto-pin someone when they start screen sharing
    const [pinnedId, setPinnedId] = useState<string | null>(null);

    useEffect(() => {
        if (screenSharingPeers.size > 0) {
            // Pick the first peer sharing screen (usually only one)
            const peerId = Array.from(screenSharingPeers)[0];
            if (pinnedId !== peerId) setPinnedId(peerId);
        } else if (isScreenSharing) {
            if (pinnedId !== 'local') setPinnedId('local');
        } else {
            // Only unpin if the pinned user was the one who was sharing
            if (pinnedId === 'local' && !isScreenSharing) {
                setPinnedId(null);
            } else if (pinnedId && !screenSharingPeers.has(pinnedId)) {
                // If it was another peer, check if they are still in the room and still sharing
                setPinnedId(null);
            }
        }
    }, [screenSharingPeers, isScreenSharing, pinnedId]);

    // Right panel
    const [rightPanel, setRightPanel] = useState<'participants' | 'chat' | 'transcript' | null>(null);

    // Chat input
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // Transcript
    const handleTranscriptResult = useCallback((text: string, displayName: string) => {
        sendTranscript(text, displayName);
    }, [sendTranscript]);

    const { isListening, error: speechError } = useSpeechTranscript({
        displayName: myName,
        enabled: isTranscriptActive && !!inMeeting,
        onResult: handleTranscriptResult,
    });

    // Auto-scroll chat & transcript
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts]);

    // Thông báo khi có người giơ tay
    useEffect(() => {
        if (raisedHands.size > 0 && isRoomHost) {
            const peer = (Array.from(peers.values()) as PeerState[]).find(p => raisedHands.has(p.connectionId));
            if (peer) notification.info({ message: `${(peer as PeerState).displayName} giơ tay yêu cầu phát biểu`, duration: 4 });
        }
    }, [raisedHands]);

    // Thông báo khi bị tắt mic bởi host
    useEffect(() => {
        if (!isAudioEnabled && !isRoomHost) {
            message.warning('Host đã tắt mic của bạn');
        }
    }, [isAudioEnabled]);

    // Thông báo khi bị từ chối
    useEffect(() => {
        if (isJoinRejected) {
            message.error('Yêu cầu vào phòng bị từ chối');
        }
    }, [isJoinRejected]);

    // Bỏ pin nếu peer rời phòng
    useEffect(() => {
        if (pinnedId && !(Array.from(peers.values()) as PeerState[]).find(p => p.connectionId === pinnedId)) {
            setPinnedId(null);
        }
    }, [peers, peerUpdateCounter]);

    const localVideoRef = useCallback((node: HTMLVideoElement | null) => {
        if (node && localStream) {
            node.srcObject = localStream;
            node.play().catch(() => { });
        }
    }, [localStream]);

    const handleCreateRoom = useCallback(async () => {
        setLoading(true);
        try {
            const code = await createRoom(requireApproval);
            message.success(`${t('meet.create_success', 'Đã tạo phòng: ')}${code}`);
        } catch (err: any) {
            message.error(err?.message || t('meet.create_fail', 'Không thể tạo phòng'));
        }
        setLoading(false);
    }, [createRoom, t, requireApproval]);

    const handleJoinRoom = useCallback(async () => {
        const code = inputCode.trim().toUpperCase();
        if (!code) { message.warning(t('meet.input_code_warning', 'Vui lòng nhập mã phòng')); return; }
        setLoading(true);
        try {
            await joinRoom(code);
            message.success(t('meet.join_success', 'Đã tham gia phòng'));
        } catch (err: any) {
            message.error(err?.message || t('meet.join_fail', 'Không thể tham gia phòng'));
        }
        setLoading(false);
    }, [inputCode, joinRoom, t]);

    const handleLeave = useCallback(() => {
        leaveRoom();
        message.info(t('meet.leave_room', 'Đã rời phòng'));
    }, [leaveRoom, t]);

    const copyRoomCode = useCallback(() => {
        if (roomCode) {
            navigator.clipboard.writeText(roomCode);
            message.success(t('meet.copy_code_success', 'Đã sao chép mã phòng'));
        }
    }, [roomCode, t]);

    const handleSendChat = useCallback(() => {
        const text = chatInput.trim();
        if (!text) return;
        sendChatMessage(text);
        setChatInput('');
    }, [chatInput, sendChatMessage]);

    const handleDownloadTranscript = useCallback(() => {
        if (transcripts.length === 0) { message.warning('Chưa có nội dung transcript'); return; }
        const content = transcripts.map((entry: { speaker: string; text: string; timestamp: string }) => `[${entry.timestamp}] ${entry.speaker}: ${entry.text}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${roomCode}-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }, [transcripts, roomCode]);

    const allPeers = Array.from(peers.values()) as PeerState[];
    const renderRightPanelContent = () => (
        <Tabs
            activeKey={rightPanel!}
            onChange={(k: string) => setRightPanel(k as any)}
            size="small"
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            items={[
                {
                    key: 'participants',
                    label: <><TeamOutlined /> {isMobile ? '' : 'Thành viên'} ({peers.size + 1})</>,
                    children: (
                        <div className={styles.panelBody}>
                            {isRoomHost && (
                                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                    <Button size="small" icon={<AudioMutedOutlined />} onClick={muteAll} danger>Tắt tất cả</Button>
                                    <Button size="small" icon={<AudioOutlined />} onClick={unmuteAll}>Bật tất cả</Button>
                                </div>
                            )}
                            {/* Mình */}
                            <div className={styles.participantItem}>
                                <span className={styles.participantName}>{myName} (Bạn)</span>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    {isHandRaised && <span>✋</span>}
                                    {!isAudioEnabled && <AudioMutedOutlined style={{ color: '#f5222d' }} />}
                                </div>
                            </div>
                            {/* Các peer */}
                            {allPeers.map(peer => (
                                <div key={peer.connectionId} className={styles.participantItem}>
                                    <span className={styles.participantName}>{peer.displayName}</span>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {raisedHands.has(peer.connectionId) && <span>✋</span>}
                                        {mutedByHost.has(peer.connectionId) && <AudioMutedOutlined style={{ color: '#f5222d' }} />}
                                        {isRoomHost && (
                                            <Tooltip title="Tắt mic">
                                                <Button size="small" icon={<AudioMutedOutlined />} danger
                                                    onClick={() => muteParticipant(peer.connectionId)} />
                                            </Tooltip>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ),
                },
                {
                    key: 'chat',
                    label: <><MessageOutlined /> {isMobile ? '' : 'Chat'} {chatMessages.length > 0 && <Badge count={chatMessages.length} size="small" />}</>,
                    children: (
                        <div className={styles.chatPanel}>
                            <div className={styles.chatBody}>
                                {chatMessages.length === 0 ? (
                                    <div style={{ color: '#888', textAlign: 'center', marginTop: 24, fontSize: 13 }}>Chưa có tin nhắn nào</div>
                                ) : (
                                    chatMessages.map((msg: { connectionId: string; speaker: string; text: string; timestamp: string }, i: number) => (
                                        <div key={i} className={styles.chatEntry} style={{ alignSelf: msg.connectionId === myConnectionId.current ? 'flex-end' : 'flex-start' }}>
                                            <span className={styles.chatSpeaker}>{msg.speaker}</span>
                                            <span className={styles.chatTime}>{msg.timestamp}</span>
                                            <div className={styles.chatBubble} style={{ background: msg.connectionId === myConnectionId.current ? '#1890ff' : '#2a2a3a' }}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={chatEndRef} />
                            </div>
                            <div className={styles.chatInput}>
                                <Input
                                    value={chatInput}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChatInput(e.target.value)}
                                    onPressEnter={handleSendChat}
                                    placeholder="Nhập tin nhắn..."
                                    suffix={<Button type="text" icon={<SendOutlined />} onClick={handleSendChat} />}
                                />
                            </div>
                        </div>
                    ),
                },
                {
                    key: 'transcript',
                    label: <><FileTextOutlined /> {isMobile ? '' : 'Transcript'}</>,
                    children: (
                        <div className={styles.transcriptPanel}>
                            <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderBottom: '1px solid #333', flexShrink: 0 }}>
                                {isRoomHost && (
                                    <Button size="small" icon={<AudioFilled />}
                                        type={isTranscriptActive ? 'primary' : 'default'}
                                        danger={isTranscriptActive}
                                        onClick={() => isTranscriptActive ? stopTranscript() : startTranscript()}>
                                        {isTranscriptActive ? 'Dừng ghi' : 'Bắt đầu ghi'}
                                    </Button>
                                )}
                                <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTranscript} disabled={transcripts.length === 0}>
                                    Tải xuống
                                </Button>
                            </div>
                            <div className={styles.transcriptBody}>
                                {transcripts.length === 0 ? (
                                    <div style={{ color: '#888', textAlign: 'center', marginTop: 24, fontSize: 13 }}>
                                        {isRoomHost ? 'Bấm "Bắt đầu ghi" để ghi transcript' : 'Chờ host bắt đầu ghi âm'}
                                    </div>
                                ) : (
                                    transcripts.map((entry: { speaker: string; text: string; timestamp: string }, i: number) => (
                                        <div key={i} className={styles.transcriptEntry}>
                                            <span className={styles.transcriptSpeaker}>{entry.speaker}</span>
                                            <span className={styles.transcriptTime}>{entry.timestamp}</span>
                                            <div className={styles.transcriptText}>{entry.text}</div>
                                        </div>
                                    ))
                                )}
                                <div ref={transcriptEndRef} />
                            </div>
                            {speechError && <div style={{ padding: '6px 12px', color: '#ff4d4f', fontSize: 12, borderTop: '1px solid #333' }}>{speechError}</div>}
                            {isListening && <div className={styles.transcriptListening}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f5222d', display: 'inline-block', marginRight: 6, animation: 'pulse 1s infinite' }} />
                                Đang nhận dạng...
                            </div>}
                        </div>
                    ),
                },
            ]}
        />
    );

    return (
        <Layout className={styles.layout}>
            <div className={styles.sidebarContainer}><LeftSidebar /></div>

            <Content className={styles.mainContent}>
                <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {!inMeeting ? (
                        /* ========== LOBBY ========== */
                        <div style={{ maxWidth: 600, margin: '0 auto', marginTop: 80, width: '100%' }}>
                            {isWaiting && (
                                <Card style={{ textAlign: 'center', marginBottom: 16, background: '#1a1a2e', color: '#fff' }}>
                                    <div style={{ fontSize: 16, color: '#fff', marginBottom: 8 }}>Đang chờ host duyệt cho vào phòng...</div>
                                    <div style={{ color: '#aaa', fontSize: 13 }}>Vui lòng đợi chủ phòng chấp nhận yêu cầu của bạn</div>
                                </Card>
                            )}
                            <Card
                                title={<><VideoCameraOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} /> {t('meet.lobby_title', 'Phòng Họp Trực Tuyến')}</>}
                                variant="borderless"
                                style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            >
                                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                                    <ApiOutlined style={{ fontSize: 48, color: 'var(--color-primary)', marginBottom: 16 }} />
                                    <Title level={4}>{t('meet.lobby_subtitle', 'Kết nối với đồng nghiệp của bạn')}</Title>
                                    <Text type="secondary">{t('meet.lobby_desc', 'Tạo phòng mới và chia sẻ mã cho người khác, hoặc nhập mã phòng để tham gia.')}</Text>
                                </div>
                                <Space orientation="vertical" style={{ width: '100%' }} size="large">
                                    <Input
                                        size="large"
                                        placeholder={t('meet.placeholder_code', 'Nhập mã phòng (VD: ABC123)')}
                                        value={inputCode}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputCode(e.target.value.toUpperCase())}
                                        prefix={<VideoCameraOutlined />}
                                        onPressEnter={handleJoinRoom}
                                        maxLength={6}
                                        style={{ textTransform: 'uppercase', letterSpacing: 4, fontWeight: 'bold', textAlign: 'center' }}
                                    />
                                    <div style={{ 
                                        display: 'flex', 
                                        flexDirection: isMobile ? 'column' : 'row', 
                                        gap: 16, 
                                        justifyContent: 'center',
                                        alignItems: 'center' 
                                    }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8, 
                                            justifyContent: 'center', 
                                            height: '40px', 
                                            padding: '0 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-lighter)'
                                        }}>
                                            <Switch
                                                checked={requireApproval}
                                                onChange={(v: boolean) => setRequireApproval(v)}
                                                size="small"
                                            />
                                            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                                Yêu cầu duyệt
                                            </span>
                                        </div>
                                        <Button 
                                            size="large" 
                                            icon={<VideoCameraAddOutlined />} 
                                            onClick={handleCreateRoom} 
                                            loading={loading} 
                                            block={isMobile}
                                            style={{ height: '40px', display: 'flex', alignItems: 'center' }}
                                        >
                                            {t('meet.btn_create', 'Tạo phòng mới')}
                                        </Button>
                                        <Button 
                                            type="primary" 
                                            size="large" 
                                            icon={<EnterOutlined />} 
                                            onClick={handleJoinRoom} 
                                            loading={loading} 
                                            disabled={!inputCode.trim()} 
                                            block={isMobile}
                                            style={{ height: '40px', display: 'flex', alignItems: 'center' }}
                                        >
                                            {t('meet.btn_join', 'Tham gia')}
                                        </Button>
                                    </div>
                                </Space>
                            </Card>
                        </div>
                    ) : (
                        /* ========== IN MEETING ========== */
                        <div className={styles.meetingContainer}>
                            {/* Waiting room requests (host only) */}
                            {isRoomHost && waitingList.length > 0 && (
                                <div className={styles.waitingBanner}>
                                    <TeamOutlined style={{ marginRight: 8 }} />
                                    <strong>{waitingList.length} người đang chờ vào phòng:</strong>
                                    {waitingList.map((p: { connectionId: string; displayName: string }) => (
                                        <span key={p.connectionId} style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            {p.displayName}
                                            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => approveParticipant(p.connectionId)}>Duyệt</Button>
                                            <Button size="small" danger icon={<CloseOutlined />} onClick={() => rejectParticipant(p.connectionId)}>Từ chối</Button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Room Info Bar */}
                            <div className={styles.roomInfoBar}>
                                <span>{t('meet.lbl_room_code', 'Mã phòng: ')} </span>
                                <Tag color="blue" style={{ fontSize: 16, padding: '2px 12px', letterSpacing: 3, fontWeight: 'bold' }}>{roomCode}</Tag>
                                <Tooltip title={t('meet.tooltip_copy', 'Sao chép mã phòng')}>
                                    <Button type="text" icon={<CopyOutlined />} onClick={copyRoomCode} size="small" />
                                </Tooltip>
                                <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: 13 }}>
                                    {t('meet.participants_count', '{{count}} người tham gia', { count: peers.size + 1 })}
                                </span>
                            </div>

                            {/* Main area */}
                            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                                {/* Videos */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    {pinnedId ? (
                                        <div className={isMobile ? styles.spotlightLayout : styles.spotlightSidebarLayout}>
                                            {/* Thumbnails Sidebar (Left) */}
                                            <div className={isMobile ? styles.thumbnailRow : styles.sidebarThumbnails}>
                                                <div className={styles.videoTile}>
                                                    <video ref={localVideoRef} autoPlay muted playsInline className={styles.videoElement} />
                                                    {!isVideoEnabled && <div className={styles.videoOff}><VideoCameraOutlined style={{ fontSize: 20, color: '#fff' }} /></div>}
                                                    <span className={styles.nameTag}>{myName}</span>
                                                </div>
                                                {allPeers.filter(p => p.connectionId !== pinnedId).map(peer => (
                                                    <RemoteVideo key={peer.connectionId} peer={peer} streamId={peer.remoteStream.id}
                                                        onPin={() => setPinnedId(peer.connectionId)}
                                                        hasRaisedHand={raisedHands.has(peer.connectionId)}
                                                        isMuted={mutedByHost.has(peer.connectionId)} />
                                                ))}
                                            </div>

                                            {/* Pinned Video (Center/Right) */}
                                            {pinnedId === 'local' ? (
                                                <div className={styles.videoTileLarge}>
                                                    <video ref={localVideoRef} autoPlay muted playsInline className={styles.videoElement} />
                                                    {!isVideoEnabled && <div className={styles.videoOff}><VideoCameraOutlined style={{ fontSize: 48, color: '#fff' }} /></div>}
                                                    <span className={styles.nameTag}>{myName} (Chia sẻ màn hình)</span>
                                                    <Tooltip title="Bỏ ghim">
                                                        <button onClick={() => setPinnedId(null)} style={{
                                                            position: 'absolute', top: 12, right: 12,
                                                            background: '#1890ff', border: 'none', borderRadius: 6, padding: '6px 12px',
                                                            color: '#fff', cursor: 'pointer', zIndex: 10
                                                        }}>
                                                            <PushpinFilled style={{ fontSize: 16 }} />
                                                        </button>
                                                    </Tooltip>
                                                </div>
                                            ) : (
                                                allPeers.filter(p => p.connectionId === pinnedId).map(peer => (
                                                    <RemoteVideo key={peer.connectionId} peer={peer} streamId={peer.remoteStream.id}
                                                        isPinned onPin={() => setPinnedId(null)} large
                                                        hasRaisedHand={raisedHands.has(peer.connectionId)}
                                                        isMuted={mutedByHost.has(peer.connectionId)} />
                                                ))
                                            )}
                                        </div>
                                    ) : (
                                        <div className={styles.videoGrid}>
                                            <div className={styles.videoTile}>
                                                <video ref={localVideoRef} autoPlay muted playsInline className={styles.videoElement} />
                                                {!isVideoEnabled && <div className={styles.videoOff}><VideoCameraOutlined style={{ fontSize: 36, color: '#fff' }} /></div>}
                                                <span className={styles.nameTag}>{myName} ({t('meet.lbl_you', 'Bạn')})</span>
                                                {isHandRaised && <span className={styles.handRaised}>✋</span>}
                                            </div>
                                            {allPeers.map(peer => (
                                                <RemoteVideo key={peer.connectionId} peer={peer} streamId={peer.remoteStream.id}
                                                    onPin={() => setPinnedId(peer.connectionId)}
                                                    hasRaisedHand={raisedHands.has(peer.connectionId)}
                                                    isMuted={mutedByHost.has(peer.connectionId)} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Right Panel (Desktop) */}
                                {!isMobile && rightPanel && (
                                    <div className={styles.rightPanel}>
                                        {renderRightPanelContent()}
                                    </div>
                                )}

                                {/* Right Panel (Mobile Drawer) */}
                                {isMobile && (
                                    <Drawer
                                        open={!!rightPanel}
                                        onClose={() => setRightPanel(null)}
                                        placement="bottom"
                                        height="75%"
                                        closable={false}
                                        styles={{ body: { padding: 0, backgroundColor: '#1a1a2e' } }}
                                        className={styles.mobileDrawer}
                                    >
                                        <div className={styles.drawerHeader}>
                                            <div className={styles.drawerHandle} />
                                            <Button type="text" icon={<CloseOutlined />} onClick={() => setRightPanel(null)} style={{ color: '#fff' }} />
                                        </div>
                                        {renderRightPanelContent()}
                                    </Drawer>
                                )}
                            </div>

                            {/* Control Bar */}
                            <div className={styles.controlBar} style={{ gap: isMobile ? '12px' : '20px' }}>
                                <Tooltip title={isAudioEnabled ? 'Tắt mic' : 'Bật mic'}>
                                    <Button shape="circle" size="large" icon={isAudioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
                                        onClick={toggleAudio} danger={!isAudioEnabled} className={styles.controlBtn} />
                                </Tooltip>
                                <Tooltip title={isVideoEnabled ? 'Tắt camera' : 'Bật camera'}>
                                    <Button shape="circle" size="large" icon={<VideoCameraOutlined />}
                                        onClick={toggleVideo} danger={!isVideoEnabled} className={styles.controlBtn} />
                                </Tooltip>
                                <Tooltip title={isHandRaised ? 'Hạ tay' : 'Giơ tay phát biểu'}>
                                    <Button shape="circle" size="large" icon={<RiseOutlined />}
                                        onClick={() => isHandRaised ? lowerHand() : raiseHand()}
                                        type={isHandRaised ? 'primary' : 'default'} className={styles.controlBtn} />
                                </Tooltip>
                                
                                {isMobile ? (
                                    <Dropdown
                                        trigger={['click']}
                                        menu={{
                                            items: [
                                                {
                                                    key: 'screen',
                                                    icon: <DesktopOutlined />,
                                                    label: isScreenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình',
                                                    onClick: toggleScreenShare,
                                                    danger: isScreenSharing
                                                },
                                                {
                                                    key: 'participants',
                                                    icon: <TeamOutlined />,
                                                    label: `Thành viên (${peers.size + 1})`,
                                                    onClick: () => setRightPanel('participants')
                                                },
                                                {
                                                    key: 'chat',
                                                    icon: <MessageOutlined />,
                                                    label: `Chat (${chatMessages.length})`,
                                                    onClick: () => setRightPanel('chat')
                                                },
                                                {
                                                    key: 'transcript',
                                                    icon: <FileTextOutlined />,
                                                    label: 'Transcript',
                                                    onClick: () => setRightPanel('transcript')
                                                },
                                                ...(isRoomHost ? [{
                                                    key: 'host-transcript',
                                                    icon: <AudioFilled />,
                                                    label: isTranscriptActive ? 'Dừng ghi âm' : 'Bắt đầu ghi âm',
                                                    onClick: () => isTranscriptActive ? stopTranscript() : startTranscript(),
                                                    danger: isTranscriptActive
                                                }] : [])
                                            ],
                                            className: styles.mobileDropdownMenu
                                        }}
                                        placement="topCenter"
                                    >
                                        <Button shape="circle" size="large" icon={<MoreOutlined />} className={styles.controlBtn} />
                                    </Dropdown>
                                ) : (
                                    <>
                                        <Tooltip title={isScreenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}>
                                            <Button shape="circle" size="large" icon={<DesktopOutlined />}
                                                onClick={toggleScreenShare} type={isScreenSharing ? 'primary' : 'default'} className={styles.controlBtn} />
                                        </Tooltip>
                                        {isRoomHost && (
                                            <Tooltip title={isTranscriptActive ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}>
                                                <Button shape="circle" size="large" icon={<AudioFilled />}
                                                    onClick={() => isTranscriptActive ? stopTranscript() : startTranscript()}
                                                    type={isTranscriptActive ? 'primary' : 'default'} danger={isTranscriptActive} className={styles.controlBtn} />
                                            </Tooltip>
                                        )}
                                        <Tooltip title="Thành viên">
                                            <Badge count={raisedHands.size + waitingList.length} size="small">
                                                <Button shape="circle" size="large" icon={<TeamOutlined />}
                                                    onClick={() => setRightPanel((v: 'participants' | 'chat' | 'transcript' | null) => v === 'participants' ? null : 'participants')}
                                                    type={rightPanel === 'participants' ? 'primary' : 'default'} className={styles.controlBtn} />
                                            </Badge>
                                        </Tooltip>
                                        <Tooltip title="Chat">
                                            <Button shape="circle" size="large" icon={<MessageOutlined />}
                                                onClick={() => setRightPanel((v: 'participants' | 'chat' | 'transcript' | null) => v === 'chat' ? null : 'chat')}
                                                type={rightPanel === 'chat' ? 'primary' : 'default'} className={styles.controlBtn} />
                                        </Tooltip>
                                        <Tooltip title="Transcript">
                                            <Button shape="circle" size="large" icon={<FileTextOutlined />}
                                                onClick={() => setRightPanel((v: 'participants' | 'chat' | 'transcript' | null) => v === 'transcript' ? null : 'transcript')}
                                                type={rightPanel === 'transcript' ? 'primary' : 'default'} className={styles.controlBtn} />
                                        </Tooltip>
                                    </>
                                )}
                                
                                <Tooltip title="Rời phòng">
                                    <Button shape="circle" size="large" icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />}
                                        onClick={handleLeave} danger type="primary" className={styles.controlBtn} />
                                </Tooltip>
                            </div>
                        </div>
                    )}
                </div>
            </Content>

            <div className={styles.bottomNavContainer}><BottomNavigation /></div>
        </Layout>
    );
}

function RemoteVideo({ peer, streamId: _streamId, onPin, isPinned, large, hasRaisedHand, isMuted }: {
    peer: { connectionId: string; displayName: string; remoteStream: MediaStream };
    streamId?: string;
    onPin?: () => void;
    isPinned?: boolean;
    large?: boolean;
    hasRaisedHand?: boolean;
    isMuted?: boolean;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl || !peer.remoteStream) return;
        videoEl.srcObject = peer.remoteStream;
        videoEl.play().catch(() => { });

        const handleTrackAdded = () => {
            videoEl.srcObject = peer.remoteStream;
            videoEl.play().catch(() => { });
            forceUpdate((n: number) => n + 1);
        };
        const handleTrackRemoved = () => {
            videoEl.srcObject = peer.remoteStream;
            forceUpdate((n: number) => n + 1);
        };

        peer.remoteStream.addEventListener('addtrack', handleTrackAdded);
        peer.remoteStream.addEventListener('removetrack', handleTrackRemoved);
        return () => {
            peer.remoteStream.removeEventListener('addtrack', handleTrackAdded);
            peer.remoteStream.removeEventListener('removetrack', handleTrackRemoved);
        };
    }, [peer.remoteStream]);

    return (
        <div className={large ? styles.videoTileLarge : styles.videoTile}>
            <video ref={videoRef} autoPlay playsInline className={styles.videoElement} />
            <span className={styles.nameTag}>{peer.displayName}</span>
            {hasRaisedHand && <span className={styles.handRaised}>✋</span>}
            {isMuted && <AudioMutedOutlined style={{ position: 'absolute', top: 8, left: 8, color: '#f5222d', fontSize: 16 }} />}
            {onPin && (
                <Tooltip title={isPinned ? 'Bỏ ghim' : 'Ghim lên toàn màn hình'}>
                    <button onClick={onPin} style={{
                        position: 'absolute', top: 8, right: 8,
                        background: isPinned ? '#1890ff' : 'rgba(0,0,0,0.5)',
                        border: 'none', borderRadius: 6, padding: '4px 8px',
                        color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                    }}>
                        <PushpinFilled style={{ fontSize: 14 }} />
                    </button>
                </Tooltip>
            )}
        </div>
    );
}
