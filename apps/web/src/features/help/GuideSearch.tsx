'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, SearchIcon } from '@/features/shared/icons';
import { recommendedArticles, searchArticles } from './search';
import styles from './GuideSearch.module.css';

export function GuideSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  // Ctrl/⌘+K jumps to the search from anywhere, as the home topbar hint advertises.
  useEffect(() => {
    const focus = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown', focus); return () => window.removeEventListener('keydown', focus);
  }, []);
  const results = query.trim() ? searchArticles(query).slice(0, 5).map(result => result.article) : recommendedArticles;
  function navigate(topic?: typeof recommendedArticles[number]) {
    setOpen(false); setActive(-1); input.current?.blur();
    router.push(topic ? `/panduan?q=${encodeURIComponent(topic.title)}&topic=${encodeURIComponent(topic.id)}` : `/panduan?q=${encodeURIComponent(query.trim())}`);
  }

  return <div className={`topbar-search ${styles.root}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <form className={`search-bar ${styles.form}`} action="/panduan" onSubmit={event => { event.preventDefault(); navigate(open && active >= 0 ? results[active] : undefined); }}>
      <SearchIcon size={19}/>
      <input ref={input} name="q" role="combobox" aria-label="Cari panduan verifikasi" placeholder="Cari panduan verifikasi" autoComplete="off" maxLength={160}
        aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
            event.preventDefault(); setOpen(true);
            const next = event.key === 'ArrowDown' ? (active + 1) % results.length : (active <= 0 ? results.length - 1 : active - 1);
            setActive(next);
          }
        }}/>
      <kbd className="search-shortcut" aria-hidden="true"><span>Ctrl</span>K</kbd>
      <button type="submit" className={`search-submit ${styles.submit}`} aria-label="Cari panduan"><ArrowRightIcon size={17}/></button>
    </form>
    {open && <div className={styles.dropdown}>
      <p className={styles.caption}>{query.trim() ? 'Topik yang mungkin Anda cari' : 'Rekomendasi topik'}</p>
      <ul id={listId} role="listbox" aria-label="Rekomendasi panduan" className={styles.results}>
        {results.map((article, index) => <li key={article.id} id={`${listId}-${index}`} role="option" aria-selected={active === index}
          onMouseDown={event => event.preventDefault()} onClick={() => navigate(article)} onMouseEnter={() => setActive(index)}>
          <SearchIcon size={16}/><div><span className={styles.title}>{article.title}</span><span className={styles.category}>{article.category}</span></div><ArrowRightIcon size={15}/>
        </li>)}
      </ul>
      {!results.length && <p className={styles.empty}>Belum ada topik yang cocok. Coba “upload ijazah”, “wallet”, atau “hasil berbeda”.</p>}
      <div className={styles.footer}><span>Kata terkait dan salah ketik ringan ikut dicocokkan.</span><button type="button" onClick={() => navigate()}>Lihat semua {query.trim() ? 'hasil' : 'panduan'}<ArrowRightIcon size={14}/></button></div>
    </div>}
  </div>;
}
