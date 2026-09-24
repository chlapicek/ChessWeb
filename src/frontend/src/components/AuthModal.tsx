import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { X, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [emailOrNickname, setEmailOrNickname] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [chessRating, setChessRating] = useState('');
  const [fideId, setFideId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const res = await apiClient.post('/auth/register', {
          email,
          password,
          fullName,
          chessRating: chessRating || null,
          fideId: fideId || null,
          nickname: nickname || null,
        });
        login(res.data.token, res.data.user);
        onClose();
      } else {
        const res = await apiClient.post('/auth/login', {
          emailOrNickname,
          password,
        });
        login(res.data.token, res.data.user);
        onClose();
      }
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.data?.errors) {
        setError(err.response.data.errors.join(', '));
      } else {
        setError('An error occurred. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fillQuickAccount = (quickEmail: string, quickPass: string) => {
    setEmailOrNickname(quickEmail);
    setPassword(quickPass);
    setIsRegister(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 transition-colors animate-scale-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isRegister ? t('auth.createAccount') : t('auth.welcomeBack')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRegister ? t('auth.registerDesc') : t('auth.signInDesc')}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-xs bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 p-3 rounded-lg border border-rose-200 dark:border-rose-900">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Demo Accounts */}
        {!isRegister && (
          <div className="mb-4 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5">
            <p className="font-semibold text-slate-700 dark:text-slate-300">{t('auth.quickAccounts')}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => fillQuickAccount('admin@chessweb.local', 'Admin123!#')}
                className="bg-slate-200 dark:bg-slate-800 hover:bg-amber-500/20 hover:text-amber-700 dark:hover:text-amber-300 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-md transition font-medium"
              >
                {t('auth.adminRole')}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('auth.fullName')}
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="David Navara"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {isRegister ? t('auth.email') : t('auth.emailOrNickname')}
            </label>
            <input
              type={isRegister ? 'email' : 'text'}
              required
              value={isRegister ? email : emailOrNickname}
              onChange={(e) => (isRegister ? setEmail(e.target.value) : setEmailOrNickname(e.target.value))}
              placeholder={isRegister ? 'you@example.com' : 'you@example.com / nickname'}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('auth.password')}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('auth.nickname')}
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Magnus"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {isRegister && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('auth.chessRating')}
                </label>
                <input
                  type="text"
                  value={chessRating}
                  onChange={(e) => setChessRating(e.target.value)}
                  placeholder="2200"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('auth.fideId')}
                </label>
                <input
                  type="text"
                  value={fideId}
                  onChange={(e) => setFideId(e.target.value)}
                  placeholder="1234567"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold py-2.5 rounded-lg transition text-sm shadow-md mt-2"
          >
            {loading ? t('common.loading') : isRegister ? t('auth.register') : t('auth.signIn')}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {isRegister ? t('auth.alreadyHaveAccount') : t('auth.noAccountYet')}{' '}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-amber-600 dark:text-amber-400 hover:underline font-semibold"
          >
            {isRegister ? t('auth.signIn') : t('auth.registerNow')}
          </button>
        </div>
      </div>
    </div>
  );
};
