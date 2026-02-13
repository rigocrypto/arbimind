export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DOCS_CONTENT, DOC_PATHS } from '../lib/docsContent';
import { ChevronLeft, ExternalLink, Pencil } from 'lucide-react';

function DocContentSection({ heading, content }: { heading: string; content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  const elements: React.ReactNode[] = [];
  let key = 0;
  for (const part of parts) {
    if (part.startsWith('```') && part.endsWith('```')) {
      const match = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
      const lang = match?.[1] || '';
      const code = match?.[2]?.trim() || part.slice(3, -3);
      elements.push(
        <pre
          key={key++}
          className="overflow-x-auto p-4 rounded-lg bg-dark-800 border border-dark-600 text-sm font-mono text-dark-200"
        >
          <code>{code}</code>
        </pre>
      );
    } else {
      const lines = part.split('\n');
      const nodes: React.ReactNode[] = [];
      let inTable = false;
      let tableRows: string[] = [];
      const flushTable = () => {
        if (tableRows.length > 0) {
          const header = tableRows[0].split('|').filter(Boolean).map((c) => c.trim());
          const dataRows = tableRows.slice(2); // skip separator
          nodes.push(
            <div key={nodes.length} className="overflow-x-auto my-3">
              <table className="min-w-full border border-dark-600 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-dark-800">
                    {header.map((h, i) => (
                      <th key={i} className="px-4 py-2 text-left text-sm font-medium text-cyan-400 border-b border-dark-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, ri) => {
                    const cells = row.split('|').filter(Boolean).map((c) => c.trim());
                    return (
                      <tr key={ri} className="border-b border-dark-700 last:border-0">
                        {cells.map((cell, ci) => (
                          <td key={ci} className="px-4 py-2 text-sm text-dark-300">
                            <code className="text-cyan-300/90">{cell}</code>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
          tableRows = [];
        }
      };
      for (const line of lines) {
        if (line.startsWith('|') && line.includes('|')) {
          inTable = true;
          tableRows.push(line);
        } else {
          if (inTable) {
            flushTable();
            inTable = false;
          }
          if (line.trim()) {
            nodes.push(
              <p key={nodes.length} className="text-dark-300 text-sm leading-relaxed mb-2">
                {line}
              </p>
            );
          }
        }
      }
      flushTable();
      elements.push(<div key={key++}>{nodes}</div>);
    }
  }
  return (
    <section className="mb-6">
      <h3 className="text-lg font-semibold text-white mb-3">{heading}</h3>
      <div className="space-y-2">{elements}</div>
    </section>
  );
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = Array.isArray(slug) ? slug.join('/') : String(slug || '');
  const doc = path ? DOCS_CONTENT[path] : null;

  if (!doc) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <div>Docs page content goes here.</div>
    </div>
  );
}

export function generateStaticParams() {
  return DOC_PATHS.map((path) => ({ slug: path.split('/') }));
}
