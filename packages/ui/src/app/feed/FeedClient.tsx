'use client';

import { useEffect, useState } from 'react';

import FeedControlRail from '@/components/feed/FeedControlRail';
import FeedEmptyState from '@/components/feed/FeedEmptyState';
import FeedFiltersSidebar from '@/components/feed/FeedFiltersSidebar';
import OpportunityDetailPanel from '@/components/feed/OpportunityDetailPanel';
import OpportunityList from '@/components/feed/OpportunityList';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { useOpportunityFeed } from '@/hooks/useOpportunityFeed';
import { useFeedStore } from '@/stores/feedStore';

export default function FeedClient() {
  const { data, isLoading } = useOpportunityFeed();
  const selectedId = useFeedStore((state) => state.selectedId);
  const select = useFeedStore((state) => state.select);
  const source = useFeedStore((state) => state.source);
  const [mobilePanel, setMobilePanel] = useState<'FEED' | 'FILTERS' | 'DETAIL'>('FEED');

  useEffect(() => {
    if (!data || data.length === 0) {
      if (selectedId) {
        select(null);
      }
      return;
    }

    const selectedStillExists = selectedId ? data.some((item) => item.id === selectedId) : false;
    if (!selectedStillExists) {
      select(data[0].id);
    }
  }, [data, selectedId, select]);

  const selected = data?.find((item) => item.id === selectedId) ?? null;
  const hasSelection = Boolean(selected);

  return (
    <DashboardLayout currentPath="/feed">
      <div className="mx-auto min-h-[calc(100dvh-64px)] w-full max-w-[440px] px-3 pb-44 sm:max-w-none sm:px-4 sm:pb-10">
        <FeedControlRail />

        <div className="sticky top-[8.6rem] z-20 mt-3 rounded-xl border border-white/10 bg-[#0f1420]/90 p-1 backdrop-blur xl:hidden">
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => setMobilePanel('FEED')}
              className={[
                'rounded-lg px-3 py-2 text-xs font-semibold transition',
                mobilePanel === 'FEED' ? 'bg-cyan-500/20 text-cyan-200' : 'text-dark-300',
              ].join(' ')}
            >
              Feed
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('FILTERS')}
              className={[
                'rounded-lg px-3 py-2 text-xs font-semibold transition',
                mobilePanel === 'FILTERS' ? 'bg-purple-500/20 text-purple-200' : 'text-dark-300',
              ].join(' ')}
            >
              Filters
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('DETAIL')}
              disabled={!hasSelection}
              className={[
                'rounded-lg px-3 py-2 text-xs font-semibold transition',
                mobilePanel === 'DETAIL' ? 'bg-fuchsia-500/20 text-fuchsia-200' : 'text-dark-300',
                !hasSelection ? 'opacity-40' : '',
              ].join(' ')}
            >
              Detail
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4">
          <aside className={[
            'col-span-12 xl:col-span-3',
            mobilePanel === 'FILTERS' ? 'block' : 'hidden',
            'xl:block',
          ].join(' ')}>
            <FeedFiltersSidebar />
          </aside>

          <main className={[
            'col-span-12 xl:col-span-6',
            mobilePanel === 'FEED' ? 'block' : 'hidden',
            'xl:block',
          ].join(' ')}>
            {isLoading ? (
              <div className="glass-card p-6 text-sm text-white/60">
                Loading {source === 'DEMO' ? 'demo' : 'live'} opportunities...
              </div>
            ) : data && data.length > 0 ? (
              <OpportunityList items={data} />
            ) : (
              <FeedEmptyState />
            )}
          </main>

          <section className={[
            'col-span-12 xl:col-span-3',
            mobilePanel === 'DETAIL' ? 'block' : 'hidden',
            'xl:block',
          ].join(' ')}>
            <OpportunityDetailPanel opportunity={selected} />
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
