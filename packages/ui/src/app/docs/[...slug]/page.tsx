export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChevronLeft, ExternalLink, Pencil } from 'lucide-react';

import { DOCS_CONTENT, DOC_PATHS } from '../lib/docsContent';

function DocContentSection({ heading, content }: { heading: string; content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  const elements: ReactNode[] = [];
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
          <code data-language={lang || undefined}>{code}</code>
        </pre>
      );
    } else {
      const lines = part.split('\n');
      const nodes: ReactNode[] = [];
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

  const editUrl =
    'https://github.com/rigocrypto/ArbiMind/blob/main/packages/ui/src/app/docs/lib/docsContent.ts';

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <Link
        href="/docs"
        className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to docs index
      </Link>

      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-white">{doc.title}</h1>
        <p className="text-dark-300 text-sm sm:text-base">{doc.description}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-dark-300 hover:text-cyan-300 transition"
          >
            <Pencil className="w-4 h-4" />
            Edit docsContent.ts
          </a>
        </div>
      </header>

      <div className="space-y-6">
        {doc.sections.map((section) => (
          <DocContentSection key={section.heading} heading={section.heading} content={section.content} />
        ))}
      </div>

      {doc.related?.length ? (
        <aside className="border-t border-dark-700 pt-4">
          <h2 className="text-sm font-semibold text-white mb-3">Related</h2>
          <ul className="space-y-2">
            {doc.related.map((rel) => (
              <li key={rel}>
                <Link
                  href={`/docs/${rel}`}
                  className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  {DOCS_CONTENT[rel]?.title ?? rel}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

export function generateStaticParams() {
  return DOC_PATHS.map((path) => ({ slug: path.split('/') }));
}
