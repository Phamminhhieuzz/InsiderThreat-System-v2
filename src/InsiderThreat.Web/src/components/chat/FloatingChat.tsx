import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { chatService } from '../../services/chatService';
import { authService } from '../../services/auth';
import { API_BASE_URL } from '../../services/api';
import type { User } from '../../types';
import styles from './FloatingChat.module.css';

interface FloatingChatProps {
    chatUser: User;
    onClose: () => void;
    windowIndex: number; // For positioning multiple windows
}

interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: string;
}

export default function FloatingChat({ chatUser, onClose, windowIndex }: FloatingChatProps) {
    const currentUser = authService.getCurrentUser();
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch messages when component mounts or chatUser changes
    useEffect(() => {
        if (!chatUser || !currentUser) return;

        const loadMessages = async () => {
            try {
                const apiMessages = await chatService.getMessages(chatUser.id || chatUser.username, currentUser.id || '');
                const mappedMessages = apiMessages.map(msg => ({
                    id: msg.id || Date.now().toString(),
                    text: msg.content,
                    senderId: msg.senderId,
                    timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }));
                setMessages(mappedMessages);
                // Scroll to bottom immediately after messages load
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
                }, 50);
            } catch (error) {
                console.error('Failed to load messages', error);
            }
        };

        loadMessages();
        const interval = setInterval(loadMessages, 3000); // Poll for new messages
        return () => clearInterval(interval);
    }, [chatUser, currentUser]);

    // Auto-scroll to bottom instantly when messages change
    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
    }, [messages]);

    const handleSendMessage = async () => {
        if (!messageInput.trim() || !chatUser || !currentUser) return;

        try {
            await chatService.sendMessage({
                senderId: currentUser.id || '',
                receiverId: chatUser.id || chatUser.username,
                content: messageInput,
                senderContent: messageInput
            });

            // Optimistic UI update
            const newMsg: Message = {
                id: Date.now().toString(),
                text: messageInput,
                senderId: currentUser.id || 'me',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, newMsg]);
            setMessageInput('');
        } catch (error) {
            console.error('Failed to send message', error);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const getAvatarUrl = (user: User) => {
        if (!user.avatarUrl) return `https://i.pravatar.cc/150?u=${user.username}`;
        if (user.avatarUrl.startsWith('http')) return user.avatarUrl;
        return `${API_BASE_URL}${user.avatarUrl}`;
    };

    // Calculate position based on windowIndex (Facebook style)
    const rightPosition = 296 + (windowIndex * 344); // 328px width + 16px gap, starting after 280px sidebar + 16px gap

    const chatWindow = (
        <div
            className={`${styles.floatingChatContainer} ${isMinimized ? styles.minimized : ''}`}
            style={{ right: `${rightPosition}px` }}
        >
            {/* Header */}
            <div className={styles.chatHeader}>
                <div className={styles.chatHeaderLeft}>
                    <span className={styles.chatTitle}>
                        {chatUser.fullName || chatUser.username}
                    </span>
                    <span className={styles.chatBadge}>E2EE</span>
                </div>
                <div className={styles.chatHeaderActions}>
                    <button
                        className={styles.headerButton}
                        onClick={() => setIsMinimized(!isMinimized)}
                        title={isMinimized ? 'Maximize' : 'Minimize'}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {isMinimized ? 'expand_less' : 'expand_more'}
                        </span>
                    </button>
                    <button
                        className={styles.headerButton}
                        onClick={onClose}
                        title="Close"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                    </button>
                </div>
            </div>

            {/* Content - Only show when not minimized */}
            {!isMinimized && (
                <div className={styles.chatContent}>
                    {/* Conversation View */}
                    <div className={styles.conversationContainer}>
                        <div className={styles.conversationHeader}>
                            <div
                                className={styles.conversationAvatar}
                                style={{ backgroundImage: `url(${getAvatarUrl(chatUser)})` }}
                            ></div>
                            <div className={styles.conversationInfo}>
                                <div className={styles.conversationName}>
                                    {chatUser.fullName || chatUser.username}
                                </div>
                                <div className={styles.conversationStatus}>
                                    Active now
                                </div>
                            </div>
                        </div>

                        <div className={styles.messagesArea}>
                            {messages.length > 0 ? (
                                messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`${styles.message} ${msg.senderId === currentUser?.id ? styles.sent : styles.received}`}
                                    >
                                        <div className={styles.messageBubble}>
                                            {msg.text}
                                            <div className={styles.messageTime}>{msg.timestamp}</div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.emptyState}>
                                    <span className={`material-symbols-outlined ${styles.emptyStateIcon}`}>lock</span>
                                    <div className={styles.emptyStateText}>
                                        End-to-end encrypted chat<br />
                                        Start a secure conversation
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className={styles.inputArea}>
                            <input
                                className={styles.messageInput}
                                placeholder="Type a message..."
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <button
                                className={styles.sendButton}
                                onClick={handleSendMessage}
                                disabled={!messageInput.trim()}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Use React Portal to render outside normal DOM hierarchy
    return createPortal(chatWindow, document.body);
}
