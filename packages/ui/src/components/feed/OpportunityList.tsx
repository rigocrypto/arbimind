'use client';

import type { Opportunity } from '@/lib/feed/types';
import { useFeedStore } from '@/stores/feedStore';

import OpportunityRow from '@/components/feed/OpportunityRow';

type OpportunityListProps = {
  items: Opportunity[];
};

export default function OpportunityList({ items }: OpportunityListProps) {
  const mode = useFeedStore((state) => state.mode);
  const selectedId = useFeedStore((state) => state.selectedId);
  const select = useFeedStore((state) => state.select);

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Opportunity Feed</h2>
            <p className="text-sm text-dark-400">Real-time market terminal layout with wallet-aware execution states.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-dark-300">
            {items.length} routes
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-6">
        {items.map((item) => (
          <OpportunityRow
            key={item.id}
            opportunity={item}
            mode={mode}
            isSelected={selectedId === item.id}
            onSelect={() => select(item.id)}
          />
        ))}
      </div>
    </section>
  );
}
