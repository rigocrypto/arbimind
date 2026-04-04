'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { SwapToken } from '@/lib/evmSwapTokens';
import { searchTokens, isSameToken } from '@/lib/evmSwapTokens';

interface TokenSelectorProps {
  /** Currently selected token */
  selected: SwapToken;
  /** Tokens available on the current chain */
  tokens: SwapToken[];
  /** Token selected on the *other* side (disabled in the list) */
  disabledToken?: SwapToken;
  /** Current chain id for same-token comparison */
  chainId: number;
  /** Called when user picks a token */
  onSelect: (token: SwapToken) => void;
}

/** 20×20 token icon with symbol-letter fallback */
function TokenIcon({ token, size = 20 }: { token: SwapToken; size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (!token.logoURI || imgError) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-dark-700 text-[10px] font-bold text-dark-300"
        style={{ width: size, height: size }}
      >
        {token.symbol.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={token.logoURI}
      alt={token.symbol}
      width={size}
      height={size}
      className="rounded-full"
      loading="lazy"
      onError={() => setImgError(true)}
    />
  );
}

export function TokenSelector({
  selected,
  tokens,
  disabledToken,
  chainId,
  onSelect,
}: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = searchTokens(tokens, query);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      // Delay to let panel render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleSelect = useCallback(
    (token: SwapToken) => {
      onSelect(token);
      setOpen(false);
    },
    [onSelect],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [],
  );

  return (
    <div className="relative" ref={panelRef} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setQuery(''); setOpen((v) => !v); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm hover:border-cyan-500/40 transition min-w-[90px]"
      >
        <TokenIcon token={selected} />
        <span className="font-medium">{selected.symbol}</span>
        <ChevronDown className="w-3.5 h-3.5 text-dark-400" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-56 rounded-lg bg-dark-800 border border-dark-600 shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-dark-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-500" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search tokens…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 rounded bg-dark-900 border border-dark-700 text-xs text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>
          </div>

          {/* Token list */}
          <ul className="max-h-48 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-dark-500">No tokens found</li>
            )}
            {filtered.map((token) => {
              const isDisabled =
                disabledToken != null && isSameToken(token, disabledToken, chainId);
              const isSelected = isSameToken(token, selected, chainId);
              return (
                <li key={token.isNative ? token.symbol : token.addresses[chainId] ?? token.symbol}>
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelect(token)}
                    role="option"
                    aria-selected={isSelected}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition
                      ${isSelected ? 'bg-cyan-500/10 text-cyan-400' : 'text-white hover:bg-dark-700'}
                      ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <TokenIcon token={token} />
                    <span className="font-medium w-12 text-left">{token.symbol}</span>
                    <span className="text-xs text-dark-400 truncate">{token.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
