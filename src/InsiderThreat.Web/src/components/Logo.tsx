import React from 'react';

export const Logo = ({ className = "", style = {}, showText = true, width = 45, height = 45 }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`} style={style}>
      <svg 
        viewBox="-10 -10 120 130" 
        width={width} 
        height={height} 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sgrad_base" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          
          <linearGradient id="sgrad_mid" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="60%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>

          <filter id="glow-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="-1" dy="4" stdDeviation="3" floodOpacity="0.4" floodColor="#000" />
          </filter>
        </defs>

        {/* Lớp dưới cùng: Đuôi gai bên trái, thanh dưới, vòng cung phải, thanh giữa (bị đè rập) */}
        <path 
          d="M 25,105 L 70,105 A 25,25 0 0,0 70,55 L 20,55 L 20,75 L 70,75 A 5,5 0 0,1 70,85 L 25,85 A 10,10 0 0,0 25,105 Z" 
          fill="url(#sgrad_base)" 
        />
        
        {/* Lớp giữa: Thanh vắt ngang giữa đè lên Lớp 1, vòng cung trái, thanh trên cùng */}
        <path 
          d="M 70,75 L 40,75 A 25,25 0 0,1 40,25 L 75,25 L 75,45 L 40,45 A 5,5 0 0,0 40,55 L 70,55 Z" 
          fill="url(#sgrad_mid)"
          filter="url(#glow-shadow)"
        />
        
        {/* Lớp cao nhất (Flap chữ S vắt chéo đuôi nhọn gập ngược phía trên cùng bên phải) */}
        <path 
          d="M 65,45 L 75,45 C 95,45 85,15 60,15 C 75,18 80,25 75,25 L 65,25 Z" 
          fill="url(#sgrad_base)"
          filter="url(#glow-shadow)"
        />
      </svg>
      {showText && (
        <span className="font-bold text-lg tracking-wide hidden dark:block" style={{ color: '#3b82f6', letterSpacing: '1px' }}>
          InsiderThreat-System
        </span>
      )}
      {showText && (
        <span className="font-bold text-lg tracking-wide block dark:hidden" style={{ color: '#0f172a' }}>
          InsiderThreat-System
        </span>
      )}
    </div>
  );
};

export default Logo;
