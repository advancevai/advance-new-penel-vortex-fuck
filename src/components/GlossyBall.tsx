import React, { useState } from 'react';

interface GlossyBallProps {
  num: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const LOCAL_BALL_IMAGES: Record<number, string> = {
  2: './assets/aistudio/ball-2-7d433738_7d433738.png',
  5: './assets/aistudio/ball-5-8e182f0c_8e182f0c.png',
  8: './assets/aistudio/ball-8-9d781b7c_9d781b7c.png',
};

// Fallback high-res public CDN links from user's panel script
const CDN_BALL_IMAGES: Record<number, string> = {
  0: 'https://i.postimg.cc/Wzrp0gRV/ball-0-053d2b99.png',
  1: 'https://i.postimg.cc/Qt7ZzDfk/ball-1-12ea01b7.png',
  2: './assets/aistudio/ball-2-7d433738_7d433738.png',
  3: 'https://i.postimg.cc/7hyr8Rcv/ball-3-a91cceac.png',
  4: 'https://i.postimg.cc/WbTc5Qgg/ball-4-cad06388.png',
  5: './assets/aistudio/ball-5-8e182f0c_8e182f0c.png',
  6: 'https://i.postimg.cc/c1QNMsgd/ball-6-44a39882.png',
  7: 'https://i.postimg.cc/2S5RDhH5/ball-7-c8babe29.png',
  8: './assets/aistudio/ball-8-9d781b7c_9d781b7c.png',
  9: 'https://i.postimg.cc/cL5q4CjB/ball-9-19985870.png'
};

const SIZE_MAP = {
  xs: 'w-3.5 h-3.5 text-[8px]',
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-8 h-8 text-sm',
  lg: 'w-11 h-11 text-lg',
  xl: 'w-14 h-14 text-2xl',
};

export const GlossyBall: React.FC<GlossyBallProps> = ({ num, size = 'md', className = '' }) => {
  const [imgError, setImgError] = useState(false);
  const normalizedNum = Math.abs(num) % 10;
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md;

  const imgSrc = LOCAL_BALL_IMAGES[normalizedNum] || CDN_BALL_IMAGES[normalizedNum];

  // If image loaded successfully and not error
  if (!imgError && imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={`Ball ${normalizedNum}`}
        onError={() => setImgError(true)}
        className={`${sizeClasses} object-contain rounded-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] shrink-0 select-none ${className}`}
        draggable={false}
      />
    );
  }

  // High-fidelity SVG/CSS glossy 3D ball fallback
  const isZero = normalizedNum === 0;
  const isFive = normalizedNum === 5;
  const isGreen = [1, 3, 7, 9].includes(normalizedNum);
  const isRed = [2, 4, 6, 8].includes(normalizedNum);

  let bgGradient = 'bg-gradient-to-br from-emerald-400 via-emerald-600 to-green-800';
  let textColor = 'text-emerald-700';

  if (isRed) {
    bgGradient = 'bg-gradient-to-br from-red-400 via-rose-600 to-red-800';
    textColor = 'text-rose-700';
  } else if (isZero) {
    bgGradient = 'bg-gradient-to-tr from-purple-600 via-purple-500 50% to-rose-600';
    textColor = 'text-purple-700';
  } else if (isFive) {
    bgGradient = 'bg-gradient-to-tr from-purple-600 via-purple-500 50% to-emerald-500';
    textColor = 'text-purple-700';
  } else if (isGreen) {
    bgGradient = 'bg-gradient-to-br from-emerald-400 via-emerald-600 to-green-800';
    textColor = 'text-emerald-700';
  }

  return (
    <div
      className={`relative rounded-full flex items-center justify-center p-[8%] overflow-hidden shadow-[inset_-2px_-3px_6px_rgba(0,0,0,0.6),0_4px_10px_rgba(0,0,0,0.5)] ${bgGradient} ${sizeClasses} ${className}`}
    >
      {/* 3D sphere top-left shine */}
      <div className="absolute top-[8%] left-[14%] w-[38%] h-[24%] bg-white/40 rounded-full blur-[1px] transform -rotate-25 pointer-events-none" />
      
      {/* Inner white circle */}
      <div className="w-full h-full rounded-full bg-white flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)]">
        <span className={`font-black font-cyber-h leading-none ${textColor}`}>
          {normalizedNum}
        </span>
      </div>
    </div>
  );
};
