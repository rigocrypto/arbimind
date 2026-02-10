'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

interface PairSearchProps {
  defaultValue?: string;
  onSubmit: (pairAddress: string) => void;
  loading?: boolean;
}

export function PairSearch({ defaultValue = '', onSubmit, loading = false }: PairSearchProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="card">
      <label htmlFor="pair" className="block text-sm font-medium text-dark-300 mb-2">
        DexScreener Pair Address (Solana)
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          id="pair"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Pair address (e.g. 4k3Dy...)"
          className="input-field w-full"
        />
        <button
          className="btn-primary sm:w-auto flex items-center justify-center gap-2"
          onClick={() => onSubmit(value.trim())}
          type="button"
          disabled={loading}
        >
          <Search className="w-4 h-4" />
          {loading ? 'Loading' : 'Load'}
        </button>
      </div>
    </div>
  );
}
