import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';
import { API_BASE_URL } from '../services/api';
import { userService } from '../services/userService';
import { chatService } from '../services/chatService';
import { cryptoService } from '../services/cryptoService';
import { signalRService } from '../services/signalRService';
import type { Message as ApiMessage } from '../services/chatService';
import type { User } from '../types';
import { confirmLogout } from '../utils/logoutUtils';
import Logo from '../components/Logo';
import NavigationBar from '../components/NavigationBar';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import './ChatPage.css';

// Types
interface ChatUser {
    id: string;
    username: string;
    fullName?: string;
    avatar?: string;
    isOnline?: boolean;
    lastMessage?: string;
    lastMessageTime?: string;
    publicKey?: string;
    unreadCount?: number;
    isGroup?: boolean;
}

interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: string;
    attachmentUrl?: string;
    attachmentType?: string;
    attachmentName?: string;
    isRead?: boolean;
    isEdited?: boolean;
}

export default function ChatPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const userIdParam = searchParams.get('userId');
    const groupIdParam = searchParams.get('groupId');

    // Stabilize currentUser to prevent infinite useEffect loops
    const currentUser = useMemo(() => authService.getCurrentUser(), []);
    const { t } = useTranslation();
    const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
    const [messageInput, setMessageInput] = useState('');
    const [contacts, setContacts] = useState<ChatUser[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);

    // Refs for polling/intervals
    const pollInterval = useRef<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Info Popover State
    const [isInfoPopoverOpen, setIsInfoPopoverOpen] = useState(false);
    const infoPopoverRef = useRef<HTMLDivElement>(null);
    const [activeFilter, setActiveFilter] = useState<'media' | 'files' | 'messages'>('media');

    // Search State
    const [searchTerm, setSearchTerm] = useState("");

    // Long-press context menu state
    const [contextMenu, setContextMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const longPressTimer = useRef<number | null>(null);

    // E2EE Key State
    const privateKeyRef = useRef<CryptoKey | null>(null);
    const myPublicKeyRef = useRef<string | null>(null);
    const [e2eeReady, setE2eeReady] = useState(false);

    // Filtered Content for Popover
    const filteredContent = useMemo(() => {
        switch (activeFilter) {
            case 'media':
                return messages.filter(m => m.attachmentType === 'image' || m.attachmentType === 'video');
            case 'files':
                return messages.filter(m => m.attachmentType === 'file');
            case 'messages':
                return messages.filter(m => m.text && !m.text.startsWith('[Sent a'));
            default:
                return [];
        }
    }, [messages, activeFilter]);

    // E2EE: Initialize RSA key pair on mount
    useEffect(() => {
        const initE2EE = async () => {
            if (!currentUser?.id) return;
            try {
                const { publicKey, privateKey } = await cryptoService.initializeKeys(
                    currentUser.id,
                    chatService.uploadPublicKey
                );
                privateKeyRef.current = privateKey;
                myPublicKeyRef.current = publicKey;
                setE2eeReady(true);
                console.log('[E2EE] Keys initialized successfully');
            } catch (error) {
                console.error('[E2EE] Key initialization failed:', error);
            }
        };
        initE2EE();
    }, [currentUser]);

    // E2EE: Helper to decrypt a batch of messages
    const decryptMessages = useCallback(async (apiMessages: ApiMessage[]): Promise<Message[]> => {
        const pk = privateKeyRef.current;
        if (!pk || !currentUser?.id) {
            // No private key yet — return raw (will show encrypted blobs)
            return apiMessages.map(msg => ({
                id: msg.id || Date.now().toString(),
                text: msg.content || '',
                senderId: msg.senderId,
                timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                attachmentUrl: msg.attachmentUrl,
                attachmentType: msg.attachmentType,
                attachmentName: msg.attachmentName,
                isRead: msg.isRead,
                isEdited: msg.isEdited
            }));
        }

        const results: Message[] = [];
        for (const msg of apiMessages) {
            let plainText = msg.content || '';
            const isMe = msg.senderId === currentUser.id;

            if (plainText) {
                // If I sent it, decrypt senderContent (encrypted with my public key)
                // If I received it, decrypt content (encrypted with my public key)
                const cipherToDecrypt = isMe ? (msg.senderContent || msg.content) : msg.content;
                plainText = await cryptoService.decrypt(cipherToDecrypt, pk);
            }

            results.push({
                id: msg.id || Date.now().toString(),
                text: plainText,
                senderId: msg.senderId,
                timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                attachmentUrl: msg.attachmentUrl,
                attachmentType: msg.attachmentType,
                attachmentName: msg.attachmentName,
                isRead: msg.isRead,
                isEdited: msg.isEdited
            });
        }
        return results;
    }, [currentUser]);

    // 2. Fetch Contacts
    useEffect(() => {
        const fetchContacts = async () => {
            if (!currentUser?.id) return;
            try {
                const [allUsers, conversations, onlineUserIds] = await Promise.all([
                    userService.getAllUsers(),
                    chatService.getConversations(currentUser.id),
                    userService.getOnlineUsers()
                ]);

                const onlineSet = new Set(onlineUserIds);

                const getAvatarUrl = (u: User | null | string) => {
                    if (!u) return `https://i.pravatar.cc/150`;
                    if (typeof u === 'string') return u.startsWith('http') ? u : `${API_BASE_URL}${u}`;
                    if (!(u as User).avatarUrl) return `https://i.pravatar.cc/150?u=${(u as User).username || 'user'}`;
                    if ((u as User).avatarUrl?.startsWith('http')) return (u as User).avatarUrl;
                    return `${API_BASE_URL}${(u as User).avatarUrl}`;
                };

                const chatUsersMap = new Map<string, ChatUser>();

                conversations.forEach((conv: any) => {
                    chatUsersMap.set(conv.id, {
                        id: conv.id,
                        username: conv.username,
                        fullName: conv.fullName,
                        avatar: getAvatarUrl(conv.avatar || conv.username),
                        isOnline: onlineSet.has(conv.id),
                        lastMessage: conv.lastMessage,
                        lastMessageTime: conv.lastMessageTime,
                        publicKey: conv.publicKey,
                        unreadCount: conv.unreadCount || 0
                    });
                });

                allUsers.forEach((u: User) => {
                    if (u.id && u.username && u.username !== currentUser.username && !chatUsersMap.has(u.id)) {
                        chatUsersMap.set(u.id, {
                            id: u.id,
                            username: u.username,
                            fullName: u.fullName,
                            avatar: getAvatarUrl(u),
                            isOnline: onlineSet.has(u.id),
                            lastMessage: t('chat.start_chat', "Bắt đầu trò chuyện"),
                            lastMessageTime: "",
                            publicKey: u.publicKey,
                            unreadCount: 0
                        });
                    }
                });

                // Static Community Groups
                const COMMUNITY_GROUPS: ChatUser[] = [
                    { id: '1', username: 'Phòng Phát Triển Sản Phẩm', avatar: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=200&fit=crop', isGroup: true, lastMessage: t('chat.group_welcome', "Chào mừng bạn đến nhóm!"), unreadCount: 0 },
                    { id: '2', username: 'Hội Những Người Thích Cà Phê', avatar: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=200&fit=crop', isGroup: true, lastMessage: t('chat.group_welcome', "Chào mừng bạn đến nhóm!"), unreadCount: 0 },
                    { id: '3', username: 'Kỹ thuật & Công nghệ', avatar: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=200&fit=crop', isGroup: true, lastMessage: t('chat.group_welcome', "Chào mừng bạn đến nhóm!"), unreadCount: 0 },
                    { id: '4', username: 'HR & Văn hóa doanh nghiệp', avatar: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=200&fit=crop', isGroup: true, lastMessage: t('chat.group_welcome', "Chào mừng bạn đến nhóm!"), unreadCount: 0 }
                ];
                COMMUNITY_GROUPS.forEach(g => {
                    if (!chatUsersMap.has(g.id)) chatUsersMap.set(g.id, g);
                });

                const sortedUsers = Array.from(chatUsersMap.values()).sort((a, b) => {
                    if ((a.unreadCount || 0) > 0 && (b.unreadCount || 0) === 0) return -1;
                    if ((a.unreadCount || 0) === 0 && (b.unreadCount || 0) > 0) return 1;

                    if (a.lastMessageTime && b.lastMessageTime) {
                        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
                    }
                    if (a.lastMessageTime) return -1;
                    if (b.lastMessageTime) return 1;

                    return a.username.localeCompare(b.username);
                });

                setContacts(sortedUsers);
            } catch (error) {
                console.error("Failed to fetch contacts", error);
            }
        };

        fetchContacts();
    }, [currentUser]);

    // Auto-select user or group from URL parameter
    useEffect(() => {
        const paramId = userIdParam || groupIdParam;
        if (paramId && contacts.length > 0) {
            setSelectedUser(prevSelected => {
                if (prevSelected?.id === paramId) return prevSelected;
                const userToSelect = contacts.find(c => c.id === paramId);
                return userToSelect || prevSelected;
            });
        }
    }, [userIdParam, groupIdParam, contacts]);

    // Realtime Presence Listeners
    useEffect(() => {
        const handleUserOnline = (userId: string) => {
            setContacts(prev => prev.map(c => c.id === userId ? { ...c, isOnline: true } : c));
            if (selectedUser?.id === userId) {
                setSelectedUser(prev => prev ? { ...prev, isOnline: true } : prev);
            }
        };

        const handleUserOffline = (userId: string) => {
            setContacts(prev => prev.map(c => c.id === userId ? { ...c, isOnline: false } : c));
            if (selectedUser?.id === userId) {
                setSelectedUser(prev => prev ? { ...prev, isOnline: false } : prev);
            }
        };

        const handleMessagesRead = (readerId: string) => {
            if (selectedUser?.id === readerId) {
                setMessages(prev => prev.map(m => ({ ...m, isRead: true })));
            }
        };

        const handleReceiveGroupMessage = (message: any) => {
            if (selectedUser?.id === message.groupId) {
                const newMsg: Message = {
                    id: message.id || Date.now().toString(),
                    text: message.content || '',
                    senderId: message.senderId,
                    timestamp: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    attachmentUrl: message.attachmentUrl,
                    attachmentType: message.attachmentType,
                    attachmentName: message.attachmentName,
                    isRead: true,
                    isEdited: message.isEdited
                };
                setMessages(prev => {
                    // Prevent duplicates from rapid SignalR vs Polling
                    if (prev.find(m => m.id === newMsg.id || (m.timestamp === newMsg.timestamp && m.senderId === newMsg.senderId && m.text === newMsg.text))) return prev;
                    return [...prev, newMsg];
                });
            }
        };

        const hubConnection = signalRService.getConnection();
        if (hubConnection) {
            hubConnection.on('UserOnline', handleUserOnline);
            hubConnection.on('UserOffline', handleUserOffline);
            hubConnection.on('MessagesRead', handleMessagesRead);
            hubConnection.on('ReceiveGroupMessage', handleReceiveGroupMessage);
        }

        return () => {
            if (hubConnection) {
                hubConnection.off('UserOnline', handleUserOnline);
                hubConnection.off('UserOffline', handleUserOffline);
                hubConnection.off('MessagesRead', handleMessagesRead);
                hubConnection.off('ReceiveGroupMessage', handleReceiveGroupMessage);
            }
        };
    }, [selectedUser?.id]);

    // SignalR Group Room Subscription
    useEffect(() => {
        const hubConnection = signalRService.getConnection();
        if (selectedUser?.isGroup && hubConnection) {
            hubConnection.invoke("JoinChatGroup", selectedUser.id).catch(err => console.error("SignalR Join Group Error:", err));

            return () => {
                hubConnection.invoke("LeaveChatGroup", selectedUser.id).catch(err => console.error("SignalR Leave Group Error:", err));
            };
        }
    }, [selectedUser]);

    // 3. Fetch Messages when User Selected (E2EE: client decrypts after receiving)
    useEffect(() => {
        if (!selectedUser || !currentUser || !e2eeReady) return;

        const loadMessages = async () => {
            if (!currentUser?.id) return;
            try {
                if (selectedUser.isGroup) {
                    const apiMessages = await chatService.getGroupMessages(selectedUser.id);
                    const mappedMessages = apiMessages.map((msg: any) => ({
                        id: msg.id || Date.now().toString(),
                        text: msg.content || '',
                        senderId: msg.senderId,
                        timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        attachmentUrl: msg.attachmentUrl,
                        attachmentType: msg.attachmentType,
                        attachmentName: msg.attachmentName,
                        isRead: true, // Auto-read for public groups
                        isEdited: msg.isEdited
                    }));
                    setMessages(prev => {
                        const isDifferent = prev.length !== mappedMessages.length ||
                            prev[prev.length - 1]?.id !== mappedMessages[mappedMessages.length - 1]?.id;
                        return isDifferent ? mappedMessages : prev;
                    });
                } else {
                    const apiMessages = await chatService.getMessages(selectedUser.id, currentUser.id);

                    // E2EE: Decrypt all messages on client side
                    const mappedMessages = await decryptMessages(apiMessages);

                    setMessages(prev => {
                        const isDifferent = prev.length !== mappedMessages.length ||
                            prev[prev.length - 1]?.id !== mappedMessages[mappedMessages.length - 1]?.id ||
                            prev.some((m, i) => m.isRead !== mappedMessages[i]?.isRead);
                        return isDifferent ? mappedMessages : prev;
                    });

                    // Mark messages as read
                    const unreadMsgs = apiMessages.filter((m: any) => m.senderId === selectedUser.id && !m.isRead);
                    if (unreadMsgs.length > 0) {
                        await chatService.markMessagesAsRead(selectedUser.id);
                        setContacts(prev => prev.map(c => c.id === selectedUser.id ? { ...c, unreadCount: 0 } : c));
                    }
                }

            } catch (error) {
                console.error("Failed to load messages", error);
            }
        };

        loadMessages();

        // Polling for new messages every 3s
        pollInterval.current = window.setInterval(loadMessages, 3000);

        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current);
        };

    }, [selectedUser, currentUser, e2eeReady, decryptMessages]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!messageInput.trim() || !selectedUser || !currentUser) return;

        const plainText = messageInput;

        try {
            if (selectedUser.isGroup) {
                // Public Group Message (No E2EE)
                await chatService.sendMessage({
                    senderId: currentUser.id || '',
                    receiverId: '', 
                    groupId: selectedUser.id,
                    content: plainText,
                    senderContent: plainText
                } as any);
            } else {
                // E2EE: Always fetch fresh public key from server to avoid stale cache
                let receiverPublicKey: string | null = null;
                try {
                    receiverPublicKey = (await chatService.getUserPublicKey(selectedUser.id)) ?? null;
                } catch {
                    receiverPublicKey = selectedUser.publicKey ?? null;
                }

                // If receiver has public key, encrypt. Otherwise send plaintext
                if (receiverPublicKey) {
                    // E2EE: Encrypt for receiver (using their public key)
                    const encryptedForReceiver = await cryptoService.encryptForUser(plainText, receiverPublicKey);

                    // E2EE: Encrypt for sender (using my own public key) — so I can read my sent messages
                    let encryptedForSender: string | undefined;
                    if (myPublicKeyRef.current) {
                        encryptedForSender = await cryptoService.encryptForUser(plainText, myPublicKeyRef.current);
                    }

                    // Send encrypted message to server
                    await chatService.sendMessage({
                        senderId: currentUser.id || '',
                        receiverId: selectedUser.id,
                        content: encryptedForReceiver,
                        senderContent: encryptedForSender,
                    });
                } else {
                    // Fallback: send plaintext if receiver has no public key yet
                    await chatService.sendMessage({
                        senderId: currentUser.id || '',
                        receiverId: selectedUser.id,
                        content: plainText,
                        senderContent: plainText
                    });
                }
            }

            // Optimistic UI — show plain text immediately
            const newMsg: Message = {
                id: Date.now().toString(),
                text: plainText,
                senderId: currentUser.id || 'me',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, newMsg]);
            setMessageInput('');

        } catch (error) {
            console.error("Failed to send message", error);
            alert(t('chat.send_fail', "Failed to send message"));
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !selectedUser || !currentUser) return;

        const file = e.target.files[0];
        try {
            const uploadRes = await chatService.uploadFile(file);
            const attachmentUrl = uploadRes.url;
            const attachmentName = uploadRes.originalName;
            const attachmentType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';

            await chatService.sendMessage({
                senderId: currentUser.id || '',
                receiverId: selectedUser.id,
                content: "",
                attachmentUrl: attachmentUrl,
                attachmentType: attachmentType,
                attachmentName: attachmentName
            });

            const newMsg: Message = {
                id: Date.now().toString(),
                text: "",
                senderId: currentUser.id || 'me',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                attachmentUrl: attachmentUrl,
                attachmentType: attachmentType,
                attachmentName: attachmentName
            };
            setMessages(prev => [...prev, newMsg]);

        } catch (error) {
            console.error("Failed to send file", error);
            alert(t('chat.send_file_fail', "Failed to upload/send file"));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSendMessage();
    };

    // ===== Long-press context menu handlers =====
    const handleTouchStart = (msgId: string, e: React.TouchEvent) => {
        const touch = e.touches[0];
        const x = touch.clientX;
        const y = touch.clientY;
        longPressTimer.current = window.setTimeout(() => {
            setContextMenu({ msgId, x, y });
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTouchMove = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const closeContextMenu = () => setContextMenu(null);

    const handleDeleteForEveryone = async () => {
        if (!contextMenu) return;
        try {
            await chatService.deleteForEveryone(contextMenu.msgId);
            setMessages(prev => prev.filter(m => m.id !== contextMenu.msgId));
        } catch (err) {
            console.error('Delete for everyone failed', err);
        }
        closeContextMenu();
    };

    const handleDeleteForMe = async () => {
        if (!contextMenu) return;
        try {
            await chatService.deleteForMe(contextMenu.msgId);
            setMessages(prev => prev.filter(m => m.id !== contextMenu.msgId));
        } catch (err) {
            console.error('Delete for me failed', err);
        }
        closeContextMenu();
    };

    const handleStartEdit = () => {
        if (!contextMenu) return;
        const msg = messages.find(m => m.id === contextMenu.msgId);
        if (msg) {
            setEditingMessageId(msg.id);
            setEditingText(msg.text);
        }
        closeContextMenu();
    };

    const handleSaveEdit = async () => {
        if (!editingMessageId || !editingText.trim() || !selectedUser) return;
        try {
            const plainText = editingText.trim();

            // E2EE: Re-encrypt the edited text
            let encryptedForReceiver = plainText;
            let encryptedForSender: string | undefined;

            // Always fetch fresh public key from server
            let receiverPublicKey: string | null = null;
            try {
                receiverPublicKey = (await chatService.getUserPublicKey(selectedUser.id)) ?? null;
            } catch {
                receiverPublicKey = selectedUser.publicKey ?? null;
            }

            if (receiverPublicKey) {
                encryptedForReceiver = await cryptoService.encryptForUser(plainText, receiverPublicKey);
            }
            if (myPublicKeyRef.current) {
                encryptedForSender = await cryptoService.encryptForUser(plainText, myPublicKeyRef.current);
            }

            await chatService.editMessage(editingMessageId, encryptedForReceiver, encryptedForSender);
            setMessages(prev => prev.map(m =>
                m.id === editingMessageId ? { ...m, text: plainText, isEdited: true } : m
            ));
        } catch (err) {
            console.error('Edit message failed', err);
        }
        setEditingMessageId(null);
        setEditingText('');
    };

    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditingText('');
    };

    const handleLogout = () => {
        confirmLogout(() => {
            authService.logout();
            navigate('/login');
        });
    };

    return (
        <div className="chat-page-container">
            <NavigationBar />
            
            <div className="chat-main-container">
                {!isMobile && <LeftSidebar defaultCollapsed={true} />}
                
                <div className="chat-layout">
                {/* Sidebar */}
                <aside className={`chat-sidebar ${selectedUser ? 'mobile-hidden' : ''}`}>
                    <div className="sidebar-header" style={{ padding: '16px 16px 0 16px' }}>
                        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{t('chat.title_chats', 'Chats')} <span style={{ fontSize: 12, color: '#10b981', border: '1px solid #10b981', padding: '2px 4px', borderRadius: 4 }}>E2EE</span></h2>
                    </div>
                    <div className="sidebar-search">
                        <div className="chat-search-input-wrapper">
                            <span className="material-symbols-outlined" style={{ color: '#9ca3af', fontSize: 20 }}>search</span>
                            <input
                                className="chat-search-input"
                                placeholder={t('chat.search_placeholder', "Search Messenger")}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="conversation-list">
                        {contacts
                            .filter(contact =>
                                (contact.fullName || contact.username).toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .map(contact => (
                                <div
                                    key={contact.id}
                                    className={`conversation-item ${selectedUser?.id === contact.id ? 'active' : ''}`}
                                    onClick={() => setSelectedUser(contact)}
                                >
                                    <div className="conversation-avatar">
                                        <div className="avatar-img" style={{ backgroundImage: `url(${contact.avatar})` }}></div>
                                        {contact.isOnline && <div className="status-indicator status-online"></div>}
                                    </div>
                                    <div className="conversation-info">
                                        <div className="conversation-name">{contact.fullName || contact.username}</div>
                                        <div className="chat-preview-text">
                                            <span style={{ fontWeight: contact.unreadCount ? 'bold' : 'normal', color: contact.unreadCount ? 'var(--color-primary)' : 'inherit' }}>
                                                {contact.lastMessage}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="chat-item-meta">
                                        <div className="chat-time" style={{ fontWeight: contact.unreadCount ? 'bold' : 'normal', color: contact.unreadCount ? 'var(--color-primary)' : 'inherit' }}>
                                            {contact.lastMessageTime
                                                ? new Date(contact.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : ''}
                                        </div>
                                        {contact.unreadCount ? (
                                            <div className="unread-badge">
                                                {contact.unreadCount}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                    </div>


                    {/* Floating Action Button (Mobile) */}
                    <button className="mobile-fab">
                        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                        </svg>
                    </button>
                </aside>

                {/* Bottom Navigation (Mobile) */}
                {isMobile && !selectedUser && <BottomNavigation />}

                {/* Main Chat Area */}
                <main className={`chat-window ${!selectedUser ? 'mobile-hidden' : ''}`}>
                    {selectedUser ? (
                        <>
                            <div className="chat-window-header">
                                <div className="chat-window-user">
                                    <button className="mobile-back-btn" onClick={() => setSelectedUser(null)}>
                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                                        </svg>
                                    </button>
                                    <div className="user-avatar" style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        backgroundImage: `url(${selectedUser.avatar})`,
                                        backgroundSize: 'cover'
                                    }}></div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{selectedUser.fullName || selectedUser.username}</h3>
                                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{selectedUser.isOnline ? t('chat.status_active', 'Active now') : t('chat.status_offline', 'Offline')}</span>
                                    </div>
                                </div>
                                <div className="info-popover-container">
                                    <button
                                        className={`chat-action-btn secondary-btn ${isInfoPopoverOpen ? 'active' : ''}`}
                                        onClick={() => setIsInfoPopoverOpen(!isInfoPopoverOpen)}
                                        title={t('chat.info_title', 'Chat Info')}
                                    >
                                        <span className="material-symbols-outlined">info</span>
                                    </button>

                                    {/* Info Popover */}
                                    {isInfoPopoverOpen && (
                                        <div className="info-popover" ref={infoPopoverRef}>
                                            <div className="info-popover-header">
                                                {t('chat.info_title', 'Chat Info')}
                                            </div>
                                            <div className="info-popover-tabs">
                                                <button
                                                    className={`info-tab ${activeFilter === 'media' ? 'active' : ''}`}
                                                    onClick={() => setActiveFilter('media')}
                                                >
                                                    {t('chat.tab_media', 'Media')}
                                                </button>
                                                <button
                                                    className={`info-tab ${activeFilter === 'files' ? 'active' : ''}`}
                                                    onClick={() => setActiveFilter('files')}
                                                >
                                                    {t('chat.tab_files', 'Files')}
                                                </button>
                                                <button
                                                    className={`info-tab ${activeFilter === 'messages' ? 'active' : ''}`}
                                                    onClick={() => setActiveFilter('messages')}
                                                >
                                                    {t('chat.tab_text', 'Text')}
                                                </button>
                                            </div>

                                            <div className="info-popover-content">
                                                {activeFilter === 'media' && (
                                                    <div className="popover-media-grid">
                                                        {filteredContent.map(msg => (
                                                            msg.attachmentType === 'video' ? (
                                                                <video
                                                                    key={msg.id}
                                                                    className="popover-media-item"
                                                                    src={`${API_BASE_URL}${msg.attachmentUrl}`}
                                                                    onClick={() => window.open(`${API_BASE_URL}${msg.attachmentUrl}`, '_blank')}
                                                                    title="View Video"
                                                                    muted
                                                                />
                                                            ) : (
                                                                <div
                                                                    key={msg.id}
                                                                    className="popover-media-item"
                                                                    style={{ backgroundImage: `url(${API_BASE_URL}${msg.attachmentUrl})` }}
                                                                    onClick={() => window.open(`${API_BASE_URL}${msg.attachmentUrl}`, '_blank')}
                                                                    title="View Image"
                                                                ></div>
                                                            )
                                                        ))}
                                                        {filteredContent.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13, gridColumn: 'span 3', textAlign: 'center', padding: 20 }}>{t('chat.no_media', 'No media shared')}</div>}
                                                    </div>
                                                )}

                                                {activeFilter === 'files' && (
                                                    <div className="popover-file-list">
                                                        {filteredContent.map(msg => (
                                                            <a
                                                                key={msg.id}
                                                                href={`${API_BASE_URL}/api/upload/download/${msg.attachmentUrl?.split('/').pop()}?originalName=${encodeURIComponent(msg.attachmentName || 'file')}&downloaderName=${encodeURIComponent(currentUser?.username || '')}`}
                                                                className="popover-file-item"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                <span className="material-symbols-outlined popover-file-icon">description</span>
                                                                <div className="popover-file-info">
                                                                    <div className="popover-file-name">{msg.attachmentName || t('chat.unknown_file', 'Unknown File')}</div>
                                                                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{msg.timestamp}</div>
                                                                </div>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9ca3af' }}>download</span>
                                                            </a>
                                                        ))}
                                                        {filteredContent.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>{t('chat.no_files', 'No files shared')}</div>}
                                                    </div>
                                                )}

                                                {activeFilter === 'messages' && (
                                                    <div className="popover-message-list">
                                                        {filteredContent.map(msg => (
                                                            <div key={msg.id} className="popover-message-item">
                                                                <div style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.text}</div>
                                                                <span className="popover-message-time">{msg.timestamp}</span>
                                                            </div>
                                                        ))}
                                                        {filteredContent.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>{t('chat.no_text', 'No text messages')}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="chat-messages-area no-scrollbar">
                                {/* E2EE Message Notice for Mobile inside Chat area */}
                                <div className="e2ee-notice-mobile">
                                    <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                                    </svg>
                                    <p>{t('chat.e2ee_notice', 'Messages are end-to-end encrypted. No one outside of this chat, not even SocialNet, can read or listen to them.')}</p>
                                </div>
                                {messages.map((msg, index) => {
                                    const isMe = msg.senderId === currentUser?.id;
                                    const isLastReadMessage = isMe && msg.isRead && !messages.slice(index + 1).some(m => m.senderId === currentUser?.id && m.isRead);

                                    return (
                                        <div
                                            key={msg.id}
                                            className={`message-group ${isMe ? 'sent' : 'received'}`}
                                            onTouchStart={(e) => handleTouchStart(msg.id, e)}
                                            onTouchEnd={handleTouchEnd}
                                            onTouchMove={handleTouchMove}
                                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY }); }}
                                        >
                                            {/* Desktop: nút 3 chấm bên trái (tin nhắn sent) */}
                                            {isMe && (
                                                <button
                                                    className="msg-more-btn desktop-only"
                                                    onClick={(e) => { e.stopPropagation(); setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY }); }}
                                                    title="Tùy chọn"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                        <circle cx="12" cy="5" r="2"/>
                                                        <circle cx="12" cy="12" r="2"/>
                                                        <circle cx="12" cy="19" r="2"/>
                                                    </svg>
                                                </button>
                                            )}
                                            {!isMe && (
                                                <div className="user-avatar" style={{
                                                    width: 28, height: 28, borderRadius: '50%',
                                                    backgroundImage: `url(${selectedUser.avatar})`,
                                                    backgroundSize: 'cover',
                                                    marginRight: 8,
                                                    alignSelf: 'flex-end',
                                                    flexShrink: 0
                                                }}></div>
                                            )}
                                            <div className="message-content" style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                                {/* Inline Edit Mode */}
                                                {editingMessageId === msg.id ? (
                                                    <div className="message-edit-inline">
                                                        <input
                                                            type="text"
                                                            value={editingText}
                                                            onChange={(e) => setEditingText(e.target.value)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
                                                            autoFocus
                                                            className="message-edit-input"
                                                        />
                                                        <div className="message-edit-actions">
                                                            <button onClick={handleSaveEdit} className="edit-save-btn">{t('chat.btn_save', 'Lưu')}</button>
                                                            <button onClick={handleCancelEdit} className="edit-cancel-btn">{t('chat.btn_cancel', 'Hủy')}</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                <>
                                                {/* Text Message */}
                                                {(msg.text && !msg.text.startsWith('[Sent a')) && (
                                                    <div className="message-bubble" style={{ width: 'fit-content', wordBreak: 'break-word', marginTop: msg.attachmentUrl ? 8 : 0 }}>
                                                        {msg.text}
                                                        {msg.isEdited && <span className="message-edited-label">{t('chat.edited_label', '(đã chỉnh sửa)')}</span>}
                                                    </div>
                                                )}

                                                {/* Attachment */}
                                                {msg.attachmentUrl && (
                                                    <div className="message-attachment" style={{ marginTop: 8 }}>
                                                        {msg.attachmentType === 'image' ? (
                                                            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>
                                                                <img
                                                                    src={`${API_BASE_URL}${msg.attachmentUrl}`}
                                                                    alt="attachment"
                                                                    style={{
                                                                        maxWidth: '200px',
                                                                        display: 'block',
                                                                        border: '1px solid #374151',
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : msg.attachmentType === 'video' ? (
                                                            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>
                                                                <video
                                                                    src={`${API_BASE_URL}${msg.attachmentUrl}`}
                                                                    controls
                                                                    style={{
                                                                        maxWidth: '280px',
                                                                        maxHeight: '200px',
                                                                        display: 'block',
                                                                        border: '1px solid #374151',
                                                                        backgroundColor: '#000',
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <a
                                                                href={`${API_BASE_URL}/api/upload/download/${msg.attachmentUrl?.split('/').pop()}?originalName=${encodeURIComponent(msg.attachmentName || 'file')}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                                    padding: '8px 12px', background: '#374151', borderRadius: 8,
                                                                    color: 'white', textDecoration: 'none'
                                                                }}
                                                            >
                                                                <span className="material-symbols-outlined">description</span>
                                                                <span style={{ fontSize: 14 }}>{msg.attachmentName || t('chat.download_file', 'Download File')}</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                )}

                                                <span className="message-time">{msg.timestamp}</span>

                                                {/* Read Receipt */}
                                                {isLastReadMessage && (
                                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>done_all</span>
                                                        {t('chat.read_receipt', 'Đã xem')}
                                                    </div>
                                                )}
                                                </>
                                                )}
                                            </div>
                                            {/* Desktop: nút 3 chấm bên phải (tin nhắn received) */}
                                            {!isMe && (
                                                <button
                                                    className="msg-more-btn desktop-only"
                                                    onClick={(e) => { e.stopPropagation(); setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY }); }}
                                                    title="Tùy chọn"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                        <circle cx="12" cy="5" r="2"/>
                                                        <circle cx="12" cy="12" r="2"/>
                                                        <circle cx="12" cy="19" r="2"/>
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Context Menu Popup */}
                            {contextMenu && (
                                <>
                                    <div className="context-menu-overlay" onClick={closeContextMenu} />
                                    <div
                                        className="context-menu-popup"
                                        style={{
                                            top: Math.min(contextMenu.y, window.innerHeight - 180),
                                            left: Math.min(contextMenu.x, window.innerWidth - 200),
                                        }}
                                    >
                                        {messages.find(m => m.id === contextMenu.msgId)?.senderId === currentUser?.id && (
                                            <>
                                                <button className="context-menu-item" onClick={handleDeleteForEveryone}>
                                                    <span className="context-menu-icon">🗑️</span>
                                                    {t('chat.delete_everyone', 'Xóa với mọi người')}
                                                </button>
                                                <button className="context-menu-item" onClick={handleStartEdit}>
                                                    <span className="context-menu-icon">✏️</span>
                                                    {t('chat.edit_message', 'Chỉnh sửa tin nhắn')}
                                                </button>
                                            </>
                                        )}
                                        <button className="context-menu-item" onClick={handleDeleteForMe}>
                                            <span className="context-menu-icon">🚫</span>
                                            {t('chat.delete_me', 'Xóa ở phía tôi')}
                                        </button>
                                    </div>
                                </>
                            )}

                            <div className="chat-input-area">
                                <div className="chat-input-wrapper">
                                    <button className="chat-action-btn secondary-btn" onClick={() => fileInputRef.current?.click()}>
                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                                        </svg>
                                    </button>
                                    <button className="chat-action-btn secondary-btn mobile-camera-btn" onClick={() => { }}>
                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        </svg>
                                    </button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        onChange={handleFileSelect}
                                    />
                                    <input
                                        className="chat-input-field"
                                        placeholder={t('chat.type_message', "Type an encrypted message...")}
                                        value={messageInput}
                                        onChange={(e) => setMessageInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                    />
                                    <svg className="h-6 w-6 mobile-emoji-btn" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ color: '#9ca3af', marginLeft: 8, cursor: 'pointer' }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <button className="chat-action-btn send-btn" onClick={handleSendMessage}>
                                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#9ca3af' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 64, marginBottom: 16, opacity: 0.5 }}>lock</span>
                            <h2 style={{ fontSize: 24, fontWeight: 600, color: '#f3f4f6' }}>{t('chat.e2ee_title', 'End-to-End Encrypted Chat')}</h2>
                            <p>{t('chat.e2ee_desc', 'Messages are encrypted on your device. Only the recipient can read them.')}</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    </div>
    );
}
