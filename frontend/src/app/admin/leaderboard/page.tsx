'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { LeaderboardEntry } from '@/types';
import { Trophy, Star, Crown, Medal, Award, TrendingUp } from 'lucide-react';
import { ListSkeleton } from '@/components/SkeletonLoaders';

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await api.get('/dashboard/admin');
        setLeaderboard(res.data.leaderboard || []);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) {
    return <ListSkeleton count={10} />;
  }

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-6 h-6 text-yellow-600" />;
    if (index === 1) return <Medal className="w-6 h-6 text-slate-500" />;
    if (index === 2) return <Medal className="w-6 h-6 text-amber-700" />;
    return <span className="text-lg font-bold text-muted-foreground">{index + 1}</span>;
  };

  const getRankBg = (index: number) => {
    if (index === 0) return 'from-yellow-50 to-amber-50 border-yellow-200';
    if (index === 1) return 'from-slate-50 to-slate-100 border-slate-200';
    if (index === 2) return 'from-amber-50 to-orange-50 border-amber-200';
    return 'from-transparent to-transparent border-border';
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="w-7 h-7 text-yellow-500" />
          Leaderboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Top performers based on reward points</p>
      </div>

      {/* Info Banner */}
      <div className="glass rounded-xl p-4 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0 border border-yellow-100">
          <Award className="w-5 h-5 text-yellow-600" />
        </div>
        <div>
          <p className="text-sm font-medium">Reward System</p>
          <p className="text-xs text-muted-foreground">
            Employees earn +1 reward point for completing tasks before the deadline. Tasks completed after the deadline earn no points.
          </p>
        </div>
        <TrendingUp className="w-5 h-5 text-indigo-500 ml-auto shrink-0" />
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 ? (
        <div className="space-y-3">
          {leaderboard.map((emp, i) => (
            <div
              key={emp.id}
              className={`glass rounded-xl p-5 flex items-center gap-4 bg-gradient-to-r ${getRankBg(i)} stat-card`}
            >
              {/* Rank */}
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                {getRankIcon(i)}
              </div>

              {/* Avatar */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold ${
                i === 0 ? 'bg-gradient-to-br from-yellow-500 to-amber-500' :
                i === 1 ? 'bg-gradient-to-br from-slate-400 to-slate-500' :
                i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' :
                'bg-gradient-to-br from-purple-600 to-violet-500'
              }`}>
                {emp.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${i === 0 ? 'text-lg' : ''}`}>{emp.name}</p>
                <p className="text-sm text-muted-foreground">{emp.email}</p>
              </div>

              {/* Points */}
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <Star className={`w-5 h-5 ${i === 0 ? 'text-yellow-500' : 'text-indigo-500'}`} />
                  <span className={`text-2xl font-bold ${i === 0 ? 'text-yellow-600' : 'text-indigo-600'}`}>
                    {emp.reward_points}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">points</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-xl p-16 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No employees on the leaderboard yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Complete tasks early to earn reward points!</p>
        </div>
      )}
    </div>
  );
}
