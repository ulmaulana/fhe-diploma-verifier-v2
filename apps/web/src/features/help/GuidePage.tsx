'use client';

import { useState } from 'react';
import { WorkspaceHeading } from '@/features/layout/WorkspaceHeading';
import {
  ArrowRightIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EncryptionIcon,
  FileIcon,
  InstitutionIcon,
  ReadDocumentIcon,
  SearchIcon,
  ShieldCheckIcon,
} from '@/features/shared/icons';
import { normalizeSearch, recommendedArticles, searchArticles } from './search';
import { guideCategories } from './content';
import styles from './GuidePage.module.css';

const categoryIcons = {
  Semua: CopyIcon,
  Memulai: ArrowRightIcon,
  'Cara kerja': ReadDocumentIcon,
  'Blockchain & FHE': EncryptionIcon,
  'Dokumen & QR': FileIcon,
  'Memahami hasil': CheckCheckIcon,
  'Data & privasi': ShieldCheckIcon,
  Penerbit: InstitutionIcon,
};

export function GuidePage({ initialQuery = '', initialTopic = '' }: { initialQuery?: string; initialTopic?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState('Semua');
  const [expandedTopics, setExpandedTopics] = useState(() => new Set([
    initialTopic || searchArticles(initialQuery)[0]?.article.id || '',
  ]));
  const matches = searchArticles(query);
  const filtered = matches.filter(({ article }) => category === 'Semua' || article.category === category);
  const related = Boolean(query.trim() && filtered.length && !filtered.some(({ article }) => (
    normalizeSearch(`${article.title} ${article.body}`).includes(normalizeSearch(query))
  )));

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    const first = searchArticles(nextQuery).find(({ article }) => category === 'Semua' || article.category === category);
    setExpandedTopics(new Set(!nextQuery.trim() && first ? [first.article.id] : []));
  }

  function changeCategory(nextCategory: string) {
    setCategory(nextCategory);
    const first = matches.find(({ article }) => nextCategory === 'Semua' || article.category === nextCategory);
    setExpandedTopics(new Set(first ? [first.article.id] : []));
  }

  function toggleTopic(id: string, open: boolean) {
    setExpandedTopics(current => {
      if (current.has(id) === open) return current;
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return <>
    <WorkspaceHeading
      title="Panduan"
      accent="Verifikasi"
      description="Pelajari alur pemeriksaan, blockchain, perlindungan data, dan penerbitan ijazah."
      art="guide"
    />
    <div className={styles.search}>
      <SearchIcon size={21} aria-hidden="true" />
      <input
        aria-label="Cari topik panduan"
        placeholder="Cari tentang QR, Sepolia, Zama FHE, atau penerbitan…"
        value={query}
        maxLength={160}
        onChange={event => changeQuery(event.target.value)}
      />
    </div>
    <div className={styles.layout}>
      <nav className={`greek-panel ${styles.categories}`} aria-label="Kategori panduan">
        <h2>Kategori</h2>
        <div className={styles.categoryList}>
          {guideCategories.map(item => {
            const CategoryIcon = categoryIcons[item];
            return <button
              type="button"
              key={item}
              className={category === item ? styles.activeCategory : undefined}
              aria-pressed={category === item}
              aria-controls="guide-topics"
              onClick={() => changeCategory(item)}
            >
              <CategoryIcon size={24} aria-hidden="true" />
              <span>{item}</span>
            </button>;
          })}
        </div>
      </nav>
      <section className={`greek-panel ${styles.articles}`} aria-label="Topik panduan" id="guide-topics">
        <p className={styles.count} role="status" aria-live="polite">
          {filtered.length} TOPIK {query && <>UNTUK “{query}”</>}
        </p>
        {related && <p className={styles.related}>Berikut topik terdekat berdasarkan kata terkait atau ejaan yang mirip.</p>}
        <div className={styles.articleList}>
          {filtered.length ? filtered.map(({ article }) => <details
            className={styles.article}
            key={article.id}
            id={article.id}
            open={expandedTopics.has(article.id)}
            onToggle={event => toggleTopic(article.id, event.currentTarget.open)}
          >
            <summary>{article.title}<ChevronDownIcon size={20} aria-hidden="true" /></summary>
            <div className={styles.answer}>
              <p>{article.body}</p>
              {article.steps && <ol className={styles.steps}>
                {article.steps.map(step => <li key={step}>{step}</li>)}
              </ol>}
              {article.sources && <div className={styles.sources}>
                <span>Referensi resmi</span>
                {article.sources.map(source => <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer">
                  {source.label}<span className="visually-hidden"> (dibuka di tab baru)</span>
                </a>)}
              </div>}
            </div>
          </details>) : <div className={styles.empty}>
            <SearchIcon size={34} aria-hidden="true" />
            <h3>Topik belum ditemukan</h3>
            <p>{category !== 'Semua' && matches.length ? 'Topik terkait tersedia di kategori lain.' : 'Coba kata lain atau pilih salah satu rekomendasi berikut.'}</p>
            <div className={styles.recommendations}>
              {category !== 'Semua' && <button type="button" onClick={() => changeCategory('Semua')}>Cari di semua kategori</button>}
              {recommendedArticles.map(article => <button type="button" key={article.id} onClick={() => {
                setQuery(article.title);
                setCategory('Semua');
                setExpandedTopics(new Set([article.id]));
              }}>{article.title}<ArrowRightIcon size={16} aria-hidden="true" /></button>)}
            </div>
          </div>}
        </div>
      </section>
    </div>
  </>;
}
