'use client';

import { useEffect } from 'react';

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

  return (
    <DashboardLayout currentPath="/feed">
      <div className="min-h-[calc(100vh-64px)] px-4 pb-10">
        <FeedControlRail />

        <div className="mt-4 grid grid-cols-12 gap-4">
          <aside className="col-span-12 xl:col-span-3">
            <FeedFiltersSidebar />
          </aside>

          <main className="col-span-12 xl:col-span-6">
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

          <section className="col-span-12 xl:col-span-3">
            <OpportunityDetailPanel opportunity={selected} />
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
