'use client';

import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import type { AdminTx } from '@/lib/adminApi';

const ETHERSCAN = 'https://etherscan.io/tx';

function TxLink({ hash }: { hash: string }) {
  const short = `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  return (
    <a
      href={`${ETHERSCAN}/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
    >
      {short}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

const columnHelper = createColumnHelper<AdminTx>();

const columns = [
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => format(info.getValue(), 'MM/dd HH:mm'),
  }),
  columnHelper.accessor('hash', {
    header: 'Tx Hash',
    cell: (info) => <TxLink hash={info.getValue()} />,
  }),
  columnHelper.accessor('strategy', {
    header: 'Strategy',
    cell: (info) => <span className="capitalize">{info.getValue()}</span>,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const v = info.getValue();
      const cls = v === 'success' ? 'text-green-400' : v === 'failed' ? 'text-red-400' : 'text-yellow-400';
      return <span className={cls}>{v}</span>;
    },
  }),
  columnHelper.accessor('grossProfit', {
    header: 'Gross',
    cell: (info) => `${info.getValue().toFixed(4)} ETH`,
  }),
  columnHelper.accessor('netProfit', {
    header: 'Net',
    cell: (info) => {
      const v = info.getValue();
      return <span className={v >= 0 ? 'text-green-400' : 'text-red-400'}>{v.toFixed(4)} ETH</span>;
    },
  }),
  columnHelper.accessor('gasCost', {
    header: 'Gas',
    cell: (info) => `${info.getValue().toFixed(4)} ETH`,
  }),
  columnHelper.accessor('blockNumber', {
    header: 'Block',
    cell: (info) => info.getValue().toLocaleString(),
  }),
];

interface AdminTxTableProps {
  txs: AdminTx[];
  strategyFilter?: string;
  statusFilter?: string;
  onStrategyFilterChange?: (v: string) => void;
  onStatusFilterChange?: (v: string) => void;
}

export function AdminTxTable({
  txs,
  strategyFilter = '',
  statusFilter = '',
  onStrategyFilterChange,
  onStatusFilterChange,
}: AdminTxTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'time', desc: true }]);

  const filteredTxs = useMemo(() => {
    let out = txs;
    if (strategyFilter) out = out.filter((t) => t.strategy === strategyFilter);
    if (statusFilter) out = out.filter((t) => t.status === statusFilter);
    return out;
  }, [txs, strategyFilter, statusFilter]);

  const table = useReactTable({
    data: filteredTxs,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getCoreRowModel(),
  });

  const strategies = useMemo(() => [...new Set(txs.map((t) => t.strategy))], [txs]);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-white mb-4">Transactions</h3>
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={strategyFilter}
          onChange={(e) => onStrategyFilterChange?.(e.target.value)}
          className="input-field text-sm py-1.5"
        >
          <option value="">All strategies</option>
          {strategies.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange?.(e.target.value)}
          className="input-field text-sm py-1.5"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-dark-600">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="text-left py-2 px-2 text-dark-400 font-medium cursor-pointer hover:text-white"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'desc' ? ' ↓' : h.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="py-2 px-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.getRowModel().rows.length === 0 && (
        <div className="py-8 text-center text-dark-500 text-sm">No transactions</div>
      )}
    </div>
  );
}
