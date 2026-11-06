import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GlossyBall } from './GlossyBall';
import { sound } from '../utils/audio';
import { IssueResult, Prediction } from '../types';
import { Volume2, VolumeX, Shield, Lock, ExternalLink, Sparkles } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface HackOverlayPanelProps {
  currentIssue: string;
  history: IssueResult[];
  onNewPrediction?: (pred: Prediction) => void;
}

const TELEGRAM_URL = APP_CONFIG.telegram;
const ROUND_MS = 30000;
const CIRCUMFERENCE = 264; // 2 * PI * 42

export const HackOverlayPanel: React.FC<HackOverlayPanelProps> = ({
  currentIssue,
  history,
  onNewPrediction,
}) => {
  // Panel state
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('rj_unlocked') !== 'true';
    } catch {
      return true;
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isMini, setIsMini] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.isMuted());
  const [showTgModal, setShowTgModal] = useState(false);

  // Check existing PassGate session on mount
  useEffect(() => {
    const token = localStorage.getItem('pg_token');
    if (token) {
      fetch(`${APP_CONFIG.passGate.url}/api/public/v1/session`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': APP_CONFIG.passGate.apiKey,
        },
        body: JSON.stringify({ token }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res && res.valid) {
            setIsLocked(false);
          } else {
            localStorage.removeItem('pg_token');
          }
        })
        .catch(() => {});
    }
  }, []);

  // Position state with drag
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('rw_pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 16, y: 16 };
  });

  // Time & countdown state
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [progressOffset, setProgressOffset] = useState(0);
  const [isUrgent, setIsUrgent] = useState(false);

  // Prediction & Signal state
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [displayStatus, setDisplayStatus] = useState<'ANALYZING' | 'WIN' | 'LOSS'>('ANALYZING');
  const [isRolling, setIsRolling] = useState(false);
  const [rollingNum, setRollingNum] = useState<number>(7);

  // Particle Canvas & Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    hasMoved: false,
  });

  const lastProcessedIssue = useRef<string>('');

  // Clamp position within viewport
  const clampPos = useCallback((x: number, y: number, mini: boolean) => {
    const width = mini ? 46 : 290;
    const height = mini ? 46 : 260;
    const pad = 8;
    const maxX = Math.max(pad, window.innerWidth - width - pad);
    const maxY = Math.max(pad, window.innerHeight - height - pad);
    return {
      x: Math.max(pad, Math.min(x, maxX)),
      y: Math.max(pad, Math.min(y, maxY)),
    };
  }, []);

  // Window resize bounds handler
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => clampPos(prev.x, prev.y, isMini));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPos, isMini]);

  // Particle burst generator
  const triggerBurst = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !panelRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = panelRef.current.offsetWidth || 290;
    canvas.height = panelRef.current.offsetHeight || 260;

    const colors = ['#0044ff', '#ffcc00', '#00ffff', '#00ff88', '#ffffff', '#ff1155'];
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      c: string;
      alpha: number;
    }> = [];

    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x: canvas.width / 2,
        y: canvas.height * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        r: 1.5 + Math.random() * 3,
        c: colors[i % colors.length],
        alpha: 1,
      });
    }

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18; // gravity
        p.alpha -= 0.016;

        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.c;
          ctx.shadowColor = p.c;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (alive) {
        animId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    animId = requestAnimationFrame(render);
  }, []);

  // Advanced Algorithm from Panel Source
  const computePrediction = useCallback((nextIssue: string, histList: IssueResult[]) => {
    if (histList.length < 5) {
      const rn = Math.floor(Math.random() * 10);
      return {
        issueNumber: nextIssue,
        num: rn,
        size: rn >= 5 ? ('big' as const) : ('small' as const),
        confidence: 88,
      };
    }

    const recentSizes = histList.slice(0, 25).map((h) => h.size);
    const recent10 = recentSizes.slice(0, 10);

    let bigScore = 0;
    let smallScore = 0;

    recent10.forEach((sz, idx) => {
      const weight = (idx + 1) * 1.2;
      if (sz === 'big') bigScore += weight;
      else smallScore += weight;
    });

    const currentStreakSize = recentSizes[0];
    let streakCount = 0;
    for (let i = 0; i < recentSizes.length; i++) {
      if (recentSizes[i] === currentStreakSize) streakCount++;
      else break;
    }

    if (streakCount >= 3) {
      if (currentStreakSize === 'big') smallScore += streakCount * 10;
      else bigScore += streakCount * 10;
    }

    let isZigzag = true;
    for (let i = 0; i < Math.min(recentSizes.length - 1, 4); i++) {
      if (recentSizes[i] === recentSizes[i + 1]) {
        isZigzag = false;
        break;
      }
    }
    if (isZigzag) {
      if (currentStreakSize === 'big') smallScore += 28;
      else bigScore += 28;
    }

    const finalSize = bigScore >= smallScore ? 'big' : 'small';
    const candidateNums = finalSize === 'big' ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
    const bestNum = candidateNums[Math.floor(Math.random() * candidateNums.length)];
    const confidence = Math.min(98, Math.max(82, 85 + Math.floor(Math.random() * 12)));

    return {
      issueNumber: nextIssue,
      num: bestNum,
      size: finalSize as 'big' | 'small',
      confidence,
    };
  }, []);

  // Trigger Rolling Ball Animation
  const triggerBallRoll = useCallback((targetNum: number) => {
    setIsRolling(true);
    sound.playRoll();
    let count = 0;
    const interval = setInterval(() => {
      setRollingNum(Math.floor(Math.random() * 10));
      count++;
      if (count >= 16) {
        clearInterval(interval);
        setRollingNum(targetNum);
        setIsRolling(false);
      }
    }, 30);
  }, []);

  // Countdown timer clock cycle
  useEffect(() => {
    const timerInterval = setInterval(() => {
      const now = Date.now();
      const rem = ROUND_MS - (now % ROUND_MS);
      const s = Math.ceil(rem / 1000);
      const fraction = rem / ROUND_MS;

      setSecondsLeft(s);
      setIsUrgent(s <= 5);
      setProgressOffset(CIRCUMFERENCE * (1 - fraction));

      if (s <= 5 && rem % 1000 < 60) {
        sound.playUrgentTick();
      }
    }, 50);

    return () => clearInterval(timerInterval);
  }, []);

  // Handle new issue predictions and win/loss resolution
  useEffect(() => {
    if (!currentIssue || currentIssue === lastProcessedIssue.current) return;

    // Check last prediction outcome if history matches
    if (prediction && history.length > 0) {
      const latestHistory = history[0];
      if (latestHistory.issueNumber === prediction.issueNumber) {
        const isWin = latestHistory.size === prediction.size;
        setDisplayStatus(isWin ? 'WIN' : 'LOSS');
        if (isWin) {
          sound.playWin();
          triggerBurst();
          try {
            if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
          } catch {}
        } else {
          sound.playLoss();
          try {
            if (navigator.vibrate) navigator.vibrate(40);
          } catch {}
        }

        setTimeout(() => {
          setDisplayStatus('ANALYZING');
        }, 3000);
      }
    }

    lastProcessedIssue.current = currentIssue;

    // Generate next prediction for current issue
    const newPred = computePrediction(currentIssue, history);
    setPrediction(newPred);
    triggerBallRoll(newPred.num);
    if (onNewPrediction) {
      onNewPrediction(newPred);
    }
  }, [currentIssue, history, computePrediction, onNewPrediction, triggerBallRoll, triggerBurst, prediction]);

  // PIN validation handler: PassGate verification & redirects to Telegram before unlocking
  const handleUnlock = async () => {
    sound.playClick();
    const cleanPin = pinInput.trim();

    // ইউজার রিকোয়েস্ট: Hack unlock হওয়ার আগে telegram a nia jabe
    try {
      window.open(TELEGRAM_URL, '_blank');
    } catch {}

    if (!cleanPin) {
      setPinError('OPENING TELEGRAM FOR PIN...');
      setTimeout(() => setShowTgModal(true), 400);
      return;
    }

    setIsVerifying(true);
    setPinError('Checking…');

    try {
      const response = await fetch(`${APP_CONFIG.passGate.url}/api/public/v1/verify`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': APP_CONFIG.passGate.apiKey,
        },
        body: JSON.stringify({ password: cleanPin }),
      });
      const res = await response.json();

      if (res && res.valid) {
        if (res.token) {
          localStorage.setItem('pg_token', res.token);
        }
        localStorage.setItem('rj_unlocked', 'true');
        setPinError('UNLOCKED!');
        setTimeout(() => {
          setIsLocked(false);
          setPinError('');
          setIsVerifying(false);
          sound.playWin();
          triggerBurst();
        }, 500);
      } else {
        let msg = 'Wrong password';
        if (res?.reason === 'rate_limited') msg = 'Too many attempts. Try later.';
        else if (res?.reason === 'ip_blocked') msg = 'Access from your network is blocked.';
        else if (res?.reason === 'origin_not_allowed') msg = 'This site is not allowed for this key.';
        else if (res?.reason === 'invalid_api_key') msg = 'API key is wrong or revoked.';

        setPinError(msg);
        setIsVerifying(false);
        setTimeout(() => setShowTgModal(true), 600);
      }
    } catch {
      setPinError('Cannot reach server. Is app published?');
      setIsVerifying(false);
      setTimeout(() => setShowTgModal(true), 600);
    }
  };

  // Drag listeners
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a, select')) return;
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      hasMoved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.hasMoved = true;
    }
    if (dragRef.current.hasMoved) {
      const newPos = clampPos(dragRef.current.origX + dx, dragRef.current.origY + dy, isMini);
      setPos(newPos);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const wasTap = !dragRef.current.hasMoved;
    dragRef.current.isDragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    try {
      localStorage.setItem('rw_pos', JSON.stringify(pos));
    } catch {}

    // Tap on mini bubble expands it
    if (wasTap && isMini) {
      sound.playClick();
      setIsMini(false);
    }
  };

  const toggleMini = (e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playClick();
    const nextMini = !isMini;
    setIsMini(nextMini);
    setPos((prev) => clampPos(prev.x, prev.y, nextMini));
  };

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  return (
    <>
      <div
        ref={panelRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          touchAction: 'none',
        }}
        className={`fixed z-[9999] select-none cursor-grab active:cursor-grabbing transition-all duration-200 ${
          isMini
            ? 'w-[48px] h-[48px] rounded-full p-0.5'
            : 'w-[290px] rounded-[22px] overflow-hidden'
        } ${displayStatus === 'WIN' ? 'ring-2 ring-emerald-400/80 shadow-[0_0_35px_rgba(0,255,136,0.6)]' : ''} ${
          displayStatus === 'LOSS' ? 'ring-2 ring-rose-500/80 shadow-[0_0_35px_rgba(255,17,85,0.6)]' : ''
        } bg-[#06010a]/75 backdrop-blur-xl border-2 border-blue-500/90 shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_40px_rgba(0,68,255,0.5),inset_0_0_20px_rgba(0,170,255,0.2)]`}
      >
        {/* Particle Canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-30 w-full h-full" />

        {/* Blurred Background Profile Image */}
        {APP_CONFIG.profileImage && (
          <div
            className={`absolute inset-0 pointer-events-none overflow-hidden z-0 ${
              isMini ? 'rounded-full' : 'rounded-[20px]'
            }`}
          >
            <img
              src={APP_CONFIG.profileImage}
              alt="Background"
              className={`w-full h-full object-cover filter blur-[2px] scale-105 transition-all duration-300 ${
                isMini ? 'opacity-45' : 'opacity-70 contrast-125 brightness-100'
              }`}
            />
            {/* Soft cyber overlay that preserves image details while maintaining text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#080210]/45 via-transparent to-[#020005]/65" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(0,68,255,0.15),rgba(2,0,5,0.45)_95%)]" />
          </div>
        )}

        {/* ================= MINI BUBBLE VIEW ================= */}
        {isMini ? (
          <div className="relative w-full h-full rounded-full flex items-center justify-center group cursor-pointer">
            <svg className="absolute inset-0.5 w-[42px] h-[42px] -rotate-90">
              <circle
                cx="21"
                cy="21"
                r="18"
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="3.5"
              />
              <circle
                cx="21"
                cy="21"
                r="18"
                fill="none"
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke={isUrgent ? '#ff1155' : '#0044ff'}
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={(2 * Math.PI * 18) * (1 - secondsLeft / 30)}
                className="transition-[stroke-dashoffset] duration-75"
              />
            </svg>
            <span
              className={`font-cyber-h font-black text-xs relative z-10 ${
                isUrgent ? 'text-red-400 animate-pulse' : 'text-amber-300'
              }`}
            >
              {secondsLeft}s
            </span>
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#00ff88]" />
          </div>
        ) : (
          /* ================= EXPANDED HACK PANEL ================= */
          <div className="relative p-2.5 text-white">
            {/* Top decorative floating mini balls */}
            <div className="absolute -top-1 left-2 right-2 flex justify-between pointer-events-none z-10">
              <div className="w-3 h-3 rounded-full bg-cover shadow-[0_0_8px_rgba(0,68,255,0.8)] overflow-hidden">
                <GlossyBall num={5} size="xs" />
              </div>
              <div className="w-3 h-3 rounded-full bg-cover shadow-[0_0_8px_rgba(0,68,255,0.8)] overflow-hidden mt-1.5 mr-3">
                <GlossyBall num={2} size="xs" />
              </div>
              <div className="w-3.5 h-3.5 rounded-full bg-cover shadow-[0_0_8px_rgba(0,68,255,0.8)] overflow-hidden -mt-0.5">
                <GlossyBall num={8} size="xs" />
              </div>
            </div>

            {/* Quick Actions (Minimize, Sound, Online Indicator) */}
            <div className="flex items-center justify-between mb-1 relative z-20">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#00ff88]"
                  title="WinGo 30S API Connected"
                />
                <button
                  type="button"
                  onClick={toggleSound}
                  className="p-1 rounded bg-black/40 text-amber-300/80 hover:text-amber-300 hover:bg-black/60 transition-colors"
                  title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
                >
                  {isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                </button>
              </div>

              <button
                type="button"
                onClick={toggleMini}
                className="w-4 h-4 rounded-full border border-amber-400/70 bg-[#140208]/90 text-amber-300 hover:text-white hover:bg-amber-500/30 flex items-center justify-center text-[10px] leading-none transition-colors"
                title="Minimize Panel"
              >
                –
              </button>
            </div>

            {/* Cyber Header with Flapping Animated Wings */}
            <div className="relative text-center mb-1.5">
              <div className="flex justify-between items-center px-1">
                {/* Left Cyber Wing */}
                <svg className="w-7 h-7 flex-shrink-0 animate-wing-left drop-shadow-[0_0_10px_#0044ff]" viewBox="0 0 60 56">
                  <defs>
                    <linearGradient id="wg1" x1="1" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#ffffff" />
                      <stop offset="0.5" stopColor="#0044ff" />
                      <stop offset="1" stopColor="#ffcc00" />
                    </linearGradient>
                  </defs>
                  <path d="M58 34 Q32 6 3 6 Q28 22 58 40 Z" fill="url(#wg1)" />
                  <path d="M58 38 Q30 24 1 28 Q28 38 58 45 Z" fill="url(#wg1)" opacity="0.9" />
                  <path d="M58 43 Q32 40 6 48 Q30 52 57 49 Z" fill="url(#wg1)" opacity="0.8" />
                </svg>

                {/* Title Box with Logo */}
                <div className="flex flex-col items-center justify-center flex-grow mx-1 text-center overflow-hidden">
                  <div className="flex items-center gap-1 justify-center">
                    {APP_CONFIG.profileImage && (
                      <img
                        src={APP_CONFIG.profileImage}
                        alt="Logo"
                        className="w-4 h-4 object-contain rounded-full shadow-[0_0_8px_#00ffff] border border-blue-400/80"
                      />
                    )}
                    <span className="font-cyber-h text-[7.5px] font-black tracking-[1px] whitespace-nowrap bg-gradient-to-b from-white via-amber-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                      {APP_CONFIG.name}
                    </span>
                  </div>
                  <span className="font-cyber-h italic font-black text-xs leading-tight -skew-x-6 bg-gradient-to-b from-white to-blue-400 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(0,68,255,0.95)]">
                    {APP_CONFIG.rawName}
                  </span>
                </div>

                {/* Right Cyber Wing */}
                <svg className="w-7 h-7 flex-shrink-0 animate-wing-right drop-shadow-[0_0_10px_#0044ff]" viewBox="0 0 60 56">
                  <defs>
                    <linearGradient id="wg2" x1="1" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#ffffff" />
                      <stop offset="0.5" stopColor="#0044ff" />
                      <stop offset="1" stopColor="#ffcc00" />
                    </linearGradient>
                  </defs>
                  <path d="M58 34 Q32 6 3 6 Q28 22 58 40 Z" fill="url(#wg2)" />
                  <path d="M58 38 Q30 24 1 28 Q28 38 58 45 Z" fill="url(#wg2)" opacity="0.9" />
                  <path d="M58 43 Q32 40 6 48 Q30 52 57 49 Z" fill="url(#wg2)" opacity="0.8" />
                </svg>
              </div>

              {/* Period Badge */}
              <div className="flex items-center justify-center gap-1.5 mx-auto my-1 px-2.5 py-0.5 w-max bg-blue-900/30 border border-blue-500/70 rounded-full font-cyber-h text-[8.5px] text-amber-100 shadow-[0_0_10px_rgba(0,68,255,0.4)]">
                PERIOD: <span className="text-amber-400 font-black">#{currentIssue || '20261105001'}</span>
              </div>
            </div>

            {/* Main Dual Grid: Left Dial + Right Signal Card */}
            <div className="grid grid-cols-[1fr_1.15fr] gap-2 items-center mt-1">
              {/* Left Dial Panel */}
              <div className="flex flex-col items-center">
                <div className="relative w-[84px] h-[84px] flex items-center justify-center">
                  {/* Outer spinning rainbow aura */}
                  <div
                    className="absolute -inset-1 rounded-full animate-spin-aura opacity-95 blur-sm"
                    style={{
                      background: 'conic-gradient(from 0deg, #0044ff, #ffcc00, #00ffff, #0044ff)',
                    }}
                  />

                  {/* Dark inner dial background */}
                  <div className="absolute inset-[3px] rounded-full bg-[radial-gradient(circle,#250208_25%,#020002_90%)] border-2 border-blue-600/80 shadow-[inset_0_0_15px_rgba(0,0,0,0.98)] z-10" />

                  {/* Circular progress SVG */}
                  <svg className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] -rotate-90 z-20" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="4.5"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={isUrgent ? '#ff1155' : '#0044ff'}
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE}
                      strokeDashoffset={progressOffset}
                      className="transition-[stroke-dashoffset] duration-75"
                    />
                  </svg>

                  {/* Central glossy ball with roll jitter */}
                  <div
                    className={`absolute inset-0 flex items-center justify-center z-30 transition-all ${
                      isRolling ? 'animate-jitter' : ''
                    } ${isLocked ? 'blur-md opacity-30' : ''}`}
                  >
                    <GlossyBall num={isRolling ? rollingNum : prediction?.num ?? 7} size="lg" />
                  </div>
                </div>

                {/* Timer Box */}
                <div
                  className={`-mt-1 flex flex-col items-center bg-[#0a0104]/98 border rounded-lg px-2 py-0.5 z-40 shadow-[0_0_10px_rgba(255,204,0,0.4)] ${
                    isUrgent ? 'border-red-500 animate-pulse-urgent' : 'border-amber-400'
                  }`}
                >
                  <span className="font-cyber-b font-extrabold text-[7px] text-amber-200 tracking-wider">
                    NEXT IN
                  </span>
                  <div className="flex items-center gap-1 font-cyber-h text-[11px] font-black text-amber-300">
                    <svg className="w-2.5 h-2.5 stroke-amber-400 fill-none" viewBox="0 0 20 20" strokeWidth="2">
                      <circle cx="10" cy="10" r="8" />
                      <path d="M10 5v5l3 2" />
                    </svg>
                    <span>{secondsLeft}s</span>
                  </div>
                </div>
              </div>

              {/* Right Panel: Lock Screen OR Active Signal Card */}
              <div className="relative h-[88px] w-full">
                {isLocked ? (
                  /* ================= LOCKED SCREEN ================= */
                  <div className="absolute inset-0 z-30 bg-[#0a0104]/80 backdrop-blur-md rounded-xl p-2 flex flex-col items-center justify-center text-center border-2 border-blue-600 shadow-[inset_0_0_35px_rgba(0,68,255,0.55)]">
                    {APP_CONFIG.profileImage ? (
                      <img
                        src={APP_CONFIG.profileImage}
                        alt="Security Logo"
                        className="w-5 h-5 object-contain rounded-full border border-amber-400 drop-shadow-[0_0_8px_#ffcc00] mb-0.5"
                      />
                    ) : (
                      <Shield className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_#ffcc00] mb-0.5" />
                    )}
                    <div className="font-cyber-h text-[8px] font-black text-amber-400 tracking-[1.5px] drop-shadow-[0_0_6px_rgba(255,204,0,0.8)] mb-1">
                      SECURE HACK LOCK
                    </div>
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value);
                        setPinError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                      placeholder="••••"
                      maxLength={20}
                      className="w-full bg-[#030001]/95 border border-blue-500 rounded px-1.5 py-0.5 font-cyber-h text-[11px] text-amber-300 text-center tracking-[3px] outline-none shadow-inner mb-1 focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleUnlock}
                      disabled={isVerifying}
                      className="w-full bg-gradient-to-r from-blue-700 to-cyan-500 active:scale-95 disabled:opacity-60 text-white font-cyber-h text-[8.5px] font-black py-0.5 rounded shadow-[0_0_15px_rgba(0,68,255,0.9)] tracking-wider transition-transform"
                    >
                      {isVerifying ? 'CHECKING...' : 'ACCESS PANEL'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        window.open(TELEGRAM_URL, '_blank');
                      }}
                      className="w-full mt-0.5 text-amber-300 hover:text-amber-200 text-[7px] font-bold tracking-wide flex items-center justify-center gap-0.5"
                    >
                      <ExternalLink size={7} /> GET PIN ON TELEGRAM
                    </button>
                    {pinError && (
                      <div className="text-[7px] text-amber-300 font-bold mt-0.5 animate-pulse">
                        {pinError}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ================= UNLOCKED SIGNAL DISPLAY ================= */
                  <div className="relative w-full h-full cut-corner p-[2px] bg-gradient-to-br from-blue-600 via-amber-400 to-cyan-400 overflow-hidden">
                    <div
                      className={`relative w-full h-full cut-corner flex flex-col items-center justify-center p-1.5 text-center overflow-hidden transition-all duration-300 ${
                        prediction?.size === 'small'
                          ? 'bg-[radial-gradient(circle,rgba(0,240,255,0.45),rgba(12,1,4,0.99))] shadow-[inset_0_0_18px_rgba(0,240,255,0.6)]'
                          : 'bg-[radial-gradient(circle,rgba(0,68,255,0.55),rgba(12,1,4,0.99))] shadow-[inset_0_0_18px_rgba(0,170,255,0.7)]'
                      }`}
                    >
                      {/* Laser Knife Slice Light Sweep */}
                      <div className="absolute -inset-full bg-gradient-to-tr from-transparent via-white/35 to-transparent pointer-events-none animate-knife-slice" />

                      {/* Main Prediction Word */}
                      <span
                        className={`font-cyber-h italic font-black text-xl leading-none tracking-wider drop-shadow-md ${
                          prediction?.size === 'small'
                            ? 'text-cyan-300 drop-shadow-[0_0_18px_#00ffff]'
                            : 'text-amber-300 drop-shadow-[0_0_18px_#0044ff]'
                        }`}
                      >
                        {prediction?.size === 'small' ? 'SMALL' : 'BIG'}
                      </span>

                      {/* Sub Range Info */}
                      <span className="font-cyber-b font-extrabold text-[8px] text-white/90 my-0.5">
                        {prediction?.size === 'small' ? 'RANGE: 0 - 4' : 'RANGE: 5 - 9'}
                      </span>

                      {/* Status / Outcome Badge */}
                      <div
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-cyber-b font-black border transition-all ${
                          displayStatus === 'WIN'
                            ? 'text-emerald-400 border-emerald-400 bg-emerald-500/30 shadow-[0_0_10px_#00ff88]'
                            : displayStatus === 'LOSS'
                            ? 'text-rose-400 border-rose-400 bg-rose-500/30 shadow-[0_0_10px_#ff1155]'
                            : 'text-emerald-300 border-emerald-400/60 bg-emerald-500/20 shadow-[0_0_6px_rgba(0,255,136,0.6)]'
                        }`}
                      >
                        {displayStatus === 'WIN' && '✔️ WIN'}
                        {displayStatus === 'LOSS' && '✖️ LOSS'}
                        {displayStatus === 'ANALYZING' && (
                          <>
                            <Sparkles size={8} /> {prediction?.confidence ?? 94}% PRO SIGNAL
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Results Bar (Last 10 Balls) */}
            <div className="mt-1.5 p-1 px-1.5 border border-blue-600/65 rounded-lg bg-black/60 backdrop-blur-sm shadow-[inset_0_0_10px_rgba(0,68,255,0.25)]">
              <div className="flex items-center gap-1 mb-0.5 font-cyber-b font-extrabold text-[7.5px] tracking-wider text-amber-400">
                <svg className="w-2.5 h-2.5 stroke-amber-400 fill-none" viewBox="0 0 20 20" strokeWidth="2">
                  <path d="M2 17h16M4 13l4-4 3 3 5-6" />
                </svg>
                <span>RECENT RESULTS</span>
              </div>
              <div className="flex justify-between items-center gap-0.5">
                {history.slice(0, 10).map((item, idx) => (
                  <div key={item.issueNumber || idx} className="shrink-0 animate-[popInBall_0.3s_ease]">
                    <GlossyBall num={item.number} size="xs" />
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom helper button to get VIP PIN or re-lock */}
            <div className="flex justify-between items-center mt-1 px-1 text-[7.5px] text-zinc-400 font-cyber-b">
              {!isLocked ? (
                <button
                  type="button"
                  onClick={() => setIsLocked(true)}
                  className="text-amber-400/80 hover:text-amber-300 flex items-center gap-0.5"
                >
                  <Lock size={8} /> Lock Panel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    window.open(TELEGRAM_URL, '_blank');
                  }}
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  Get VIP Key
                </button>
              )}
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="text-amber-300 hover:text-amber-200 flex items-center gap-0.5"
              >
                Telegram Support <ExternalLink size={8} />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Telegram Channel Access Modal (Prompted on incorrect PIN) */}
      {showTgModal && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b040e] border-2 border-blue-500 rounded-2xl p-5 max-w-sm w-full text-white shadow-[0_0_50px_rgba(0,68,255,0.7)] text-center animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-blue-600/30 border-2 border-amber-400/80 flex items-center justify-center mx-auto mb-3 shadow-[0_0_25px_#0044ff] overflow-hidden">
              {APP_CONFIG.profileImage ? (
                <img
                  src={APP_CONFIG.profileImage}
                  alt="ADVANCE HACK"
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <Shield className="w-7 h-7 text-amber-400" />
              )}
            </div>
            <h3 className="font-cyber-h text-sm font-black text-amber-400 tracking-wider mb-1">
              {APP_CONFIG.name}
            </h3>
            <p className="text-xs text-zinc-300 mb-3">
              To obtain the official Access PIN or join the VIP prediction signals channel, visit our Telegram channel:
            </p>
            <div className="bg-black/60 border border-amber-400/40 rounded-lg p-2.5 mb-4 text-xs font-mono text-amber-300 break-all select-all">
              {TELEGRAM_URL}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  window.open(TELEGRAM_URL, '_blank');
                  setShowTgModal(false);
                }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-500 hover:brightness-110 text-white font-cyber-h text-xs font-black py-2.5 rounded-xl shadow-lg transition-all"
              >
                OPEN TELEGRAM
              </button>
              <button
                type="button"
                onClick={() => setShowTgModal(false)}
                className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
