import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Avatar, Tooltip } from 'antd';
import { CloseOutlined, SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import styles from './ChatWidget.module.css';
import { authService } from '../services/auth';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
}

export const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', text: 'Xin chào! Tôi là trợ lý ảo AI. Tôi có thể giúp gì cho bạn?', sender: 'bot', timestamp: new Date() }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const user = authService.getCurrentUser();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            text: inputValue,
            sender: 'user',
            timestamp: new Date()
        };

        const currentMessages = [...messages, userMsg];
        setMessages(currentMessages);
        setInputValue('');
        setLoading(true);

        try {
            const apiMessages = [
                { role: 'system', content: 'You are a helpful AI assistant in an enterprise application. Communicate clearly and concisely. You can understand and respond in Vietnamese.'},
                ...messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
                { role: 'user', content: userMsg.text }
            ];

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer [GROQ_API_KEY]'
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: apiMessages,
                    temperature: 0.7,
                })

            });

            const data = await response.json();
            
            if (data.choices && data.choices.length > 0) {
                const reply = data.choices[0].message.content;
                const botMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    text: reply,
                    sender: 'bot',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, botMsg]);
            } else {
                throw new Error("Invalid response format");
            }
        } catch (error) {
            console.error('Error sending message to bot:', error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: "Xin lỗi, đã xảy ra lỗi kết nối. Vui lòng thử lại sau.",
                sender: 'bot',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`${styles.widgetContainer} chat-widget-global`}>
            {/* Floating Button */}
            {!isOpen && (
                <Tooltip title="Chat với AI" placement="left">
                    <motion.div
                        drag
                        dragMomentum={false}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={styles.floatingButtonWrap}
                        onClick={() => setIsOpen(true)}
                    >
                        <div className={styles.floatingButton}>
                            <span style={{ fontWeight: '800', fontSize: '18px', letterSpacing: '1px', color: '#fff' }}>AI</span>
                        </div>
                    </motion.div>
                </Tooltip>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className={styles.chatWindow}>
                    <div className={styles.header}>
                        <div className={styles.headerTitle}>
                            <RobotOutlined className={styles.headerIcon} />
                            <span>Trợ lý AI</span>
                        </div>
                        <Button
                            type="text"
                            icon={<CloseOutlined />}
                            onClick={() => setIsOpen(false)}
                            className={styles.closeButton}
                        />
                    </div>
                    <div className={styles.messageList}>
                        {messages.map((item) => (
                            <div
                                key={item.id}
                                className={`${styles.messageItem} ${item.sender === 'user' ? styles.userMessage : styles.botMessage}`}
                            >
                                <div className={styles.messageContent}>
                                    <Avatar
                                        icon={item.sender === 'bot' ? <RobotOutlined /> : <UserOutlined />}
                                        className={styles.avatar}
                                        size="small"
                                    />
                                    <div className={styles.bubble}>
                                        {item.text}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className={styles.botThinking}>
                                <span>Bot đang trả lời...</span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className={styles.inputArea}>
                        <Input
                            placeholder="Nhập tin nhắn..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onPressEnter={handleSend}
                            suffix={
                                <Button
                                    type="primary"
                                    icon={<SendOutlined />}
                                    onClick={handleSend}
                                    disabled={!inputValue.trim()}
                                    shape="circle"
                                    size="small"
                                />
                            }
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
