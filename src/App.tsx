/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HackOverlayPanel } from './components/HackOverlayPanel';
import { IssueResult, Prediction } from './types';
import { APP_CONFIG } from './config';

const API_URL = 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json';

function getBallColor(n: number): 'green' | 'red' | 'violet' | 'red-violet' | 'green-violet' {
  if (n === 0) return 'red-violet';
  if (n === 5) return 'green-violet';
  if ([1, 3, 7, 9].includes(n)) return 'green';
  return 'red';
}

function generateInitialHistory(): IssueResult[] {
  const list: IssueResult[] = [];
  const basePeriod = BigInt('20261105100050820');
  const numbers = [5, 2, 8, 3, 7, 6, 9, 1, 4, 0, 8, 5, 2, 6, 9];

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    list.push({
      issueNumber: (basePeriod - BigInt(i)).toString(),
      number: num,
      size: num >= 5 ? 'big' : 'small',
      color: getBallColor(num),
      timestamp: Date.now() - i * 30000,
    });
  }
  return list;
}

export default function App() {
  const [history, setHistory] = useState<IssueResult[]>(() => {
    try {
      const saved = localStorage.getItem('rw_hist_items');
      if (saved) return JSON.parse(saved);
    } catch {}
    return generateInitialHistory();
  });

  const [currentIssue, setCurrentIssue] = useState<string>('20261105100050821');
  const [activePrediction, setActivePrediction] = useState<Prediction | null>(null);
  const prevPeriodRef = useRef<string>('');

  // Poll real API or generate synced rounds every 30s
  useEffect(() => {
    let isMounted = true;

    const syncRounds = async () => {
      const now = Date.now();
      // WinGo 30s issue calculation: YYYYMMDD + slot number
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const daySeconds = Math.floor((now % 86400000) / 1000);
      const slot = Math.floor(daySeconds / 30) + 1;
      const calculatedPeriod = `${datePart}1000${String(slot).padStart(5, '0')}`;

      // If period has changed
      if (calculatedPeriod !== prevPeriodRef.current && prevPeriodRef.current !== '') {
        const drawNumber = Math.floor(Math.random() * 10);
        const newResult: IssueResult = {
          issueNumber: prevPeriodRef.current,
          number: drawNumber,
          size: drawNumber >= 5 ? 'big' : 'small',
          color: getBallColor(drawNumber),
          timestamp: now,
        };

        if (isMounted) {
          setHistory((prev) => {
            const nextList = [newResult, ...prev.slice(0, 49)];
            try {
              localStorage.setItem('rw_hist_items', JSON.stringify(nextList));
            } catch {}
            return nextList;
          });
        }
      }

      prevPeriodRef.current = calculatedPeriod;
      if (isMounted) {
        setCurrentIssue(calculatedPeriod);
      }

      // Try polling external API
      try {
        const resp = await fetch(`${API_URL}?t=${now}`, { cache: 'no-store' });
        const json = await resp.json();
        if (json?.data?.list?.length && isMounted) {
          const apiList: IssueResult[] = json.data.list.map((it: { issueNumber: string; number: string }) => {
            const num = parseInt(it.number, 10);
            return {
              issueNumber: it.issueNumber,
              number: num,
              size: num >= 5 ? ('big' as const) : ('small' as const),
              color: getBallColor(num),
              timestamp: now,
            };
          });

          setHistory((prev) => {
            const merged = [...apiList];
            prev.forEach((p) => {
              if (!merged.find((m) => m.issueNumber === p.issueNumber)) {
                merged.push(p);
              }
            });
            return merged.slice(0, 50);
          });
        }
      } catch {
        // Fallback to internal synchronized clock
      }
    };

    syncRounds();
    const interval = setInterval(syncRounds, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black text-white select-none">
      {/* Full-Screen Direct Game Frame */}
      <iframe
        id="gameIframe"
        src={APP_CONFIG.gameFrameUrl}
        title="DKWIN Game Frame"
        className="absolute inset-0 w-full h-full border-0 z-0 bg-black"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />

      {/* The Floating Draggable Cyber Hack Panel ("𝘼𝘿𝙑𝘼𝙉𝘾𝙀 𝙃𝘼𝘾𝙆") */}
      <HackOverlayPanel
        currentIssue={currentIssue}
        history={history}
        onNewPrediction={setActivePrediction}
      />
    </div>
  );
}
