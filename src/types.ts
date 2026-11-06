export type BetType = 'green' | 'violet' | 'red' | 'big' | 'small' | number;

export interface IssueResult {
  issueNumber: string;
  number: number;
  size: 'big' | 'small';
  color: 'green' | 'red' | 'violet' | 'red-violet' | 'green-violet';
  timestamp: number;
}

export interface Prediction {
  issueNumber: string;
  num: number;
  size: 'big' | 'small';
  confidence: number;
  done?: boolean;
}

export interface UserBet {
  id: string;
  issueNumber: string;
  type: BetType;
  amount: number;
  multiplier: number;
  total: number;
  status: 'pending' | 'won' | 'lost';
  winAmount?: number;
  createdAt: number;
}
