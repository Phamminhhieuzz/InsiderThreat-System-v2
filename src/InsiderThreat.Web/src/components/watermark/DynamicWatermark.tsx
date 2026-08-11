import React, { useState, useEffect } from 'react';
import './DynamicWatermark.css';

export default function DynamicWatermark() {
    const [ipAddress, setIpAddress] = useState<string>('Đang lấy IP...');
    const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleString('vi-VN'));

    // Lấy thông tin User
    const user = React.useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch {
            return {};
        }
    }, []);

    // Fetch IP and Update Clock
    useEffect(() => {
        let isMounted = true;

        // Fetch IP (Sử dụng ipify api công khai)
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => {
                if (isMounted) setIpAddress(data.ip);
            })
            .catch(() => {
                if (isMounted) setIpAddress('IP Nội bộ / Ẩn danh');
            });

        // Update clock every minute
        const interval = setInterval(() => {
            if (isMounted) setCurrentTime(new Date().toLocaleString('vi-VN'));
        }, 60000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const identifier = user.username || user.fullName || 'Khách';
    const email = user.email || 'Không rõ Email';
    const watermarkText = `${identifier}\n${email}\nIP: ${ipAddress}\n${currentTime}`;

    // Tạo mảng 50 item để lấp đầy grid
    const items = Array.from({ length: 50 }, (_, i) => i);

    return (
        <div className="dynamic-watermark-container">
            <div className="watermark-grid">
                {items.map(i => (
                    <div key={i} className="watermark-item">
                        {watermarkText}
                    </div>
                ))}
            </div>
        </div>
    );
}
