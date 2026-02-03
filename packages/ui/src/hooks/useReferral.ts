'use client';

import { useAccount } from 'wagmi';
import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'https://arbimind.vercel.app';
const REF_STORAGE_KEY = 'arbimind_ref';

export function useReferral() {
  const { address, isConnected } = useAccount();
  const [earnings, setEarnings] = useState(0);

  const refLink = address ? `${BASE_URL}/?ref=${address}` : '';

  // Store ref code from URL when user lands (e.g. ?ref=0xABC)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && /^0x[a-fA-F0-9]{40}$/.test(ref)) {
      localStorage.setItem(REF_STORAGE_KEY, ref);
    }
  }, []);

  useEffect(() => {
    if (!address) {
      setEarnings(0);
      return;
    }
    fetch(`${API_BASE}/referral/earnings?address=${address}`)
      .then((res) => res.ok ? res.json() : { earnings: 0 })
      .then((data) => setEarnings(data?.earnings ?? 0))
      .catch(() => setEarnings(0));
  }, [address]);

  const copyRefLink = useCallback(async () => {
    if (!refLink) return;
    try {
      await navigator.clipboard.writeText(refLink);
      toast.success('Referral link copied!');
    } catch {
      toast.error('Could not copy link');
    }
  }, [refLink]);

  // The address that referred the current user (from ?ref= in URL), for engine/start
  const storedReferrer =
    typeof window !== 'undefined' ? localStorage.getItem(REF_STORAGE_KEY) : null;

  return { refLink, earnings, copyRefLink, referrer: storedReferrer };
}
