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
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#111625]/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white sm:text-lg">Opportunity Feed</h2>
            <p className="text-xs text-dark-400 sm:text-sm">Real-time market terminal layout with wallet-aware execution states.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-dark-300">
            {items.length} routes
          </span>
        </div>
      </div>

      <div className="space-y-2.5 p-3 sm:space-y-3 sm:p-6">
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
