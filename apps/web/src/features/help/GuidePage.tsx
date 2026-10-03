'use client';
import { useState } from 'react';
import { BookIcon, ChevronDownIcon, SearchIcon } from '@/features/shared/icons';
import { normalizeSearch, recommendedArticles, searchArticles } from './search';
import { guideCategories } from './content';
import styles from './GuidePage.module.css';

export function GuidePage({initialQuery='',initialTopic=''}:{initialQuery?:string;initialTopic?:string}){
  const [query,setQuery]=useState(initialQuery);
  const [category,setCategory]=useState('Semua');
  const matches=searchArticles(query);
  const filtered=matches.filter(({article})=>category==='Semua'||article.category===category);
  const related=Boolean(query.trim()&&filtered.length&&!filtered.some(({article})=>normalizeSearch(`${article.title} ${article.body}`).includes(normalizeSearch(query))));
  return <>
    <div className="page-heading"><div><h1>Panduan Verifikasi</h1><p>Pelajari alur pemeriksaan, blockchain, perlindungan data, dan penerbitan ijazah.</p></div><BookIcon className="heading-icon" size={63}/></div>
    <div className="guide-search"><SearchIcon size={20}/><input aria-label="Cari topik panduan" placeholder="Cari tentang QR, Sepolia, Zama FHE, atau penerbitan…" value={query} maxLength={160} onChange={event=>setQuery(event.target.value)}/></div>
    <div className="guide-layout">
      <nav className="guide-categories" aria-label="Kategori panduan">{guideCategories.map(item=><button key={item} className={category===item?'active':''} aria-pressed={category===item} onClick={()=>setCategory(item)}>{item}</button>)}</nav>
      <div className="guide-articles">
        <p className="section-label" role="status">{filtered.length} TOPIK {query&&`UNTUK “${query}”`}</p>
        {related&&<p className={styles.related}>Berikut topik terdekat berdasarkan kata terkait atau ejaan yang mirip.</p>}
        {filtered.length?filtered.map(({article},index)=><details className="guide-article" key={article.id} id={article.id} open={query===initialQuery&&query.trim()&&(initialTopic?article.id===initialTopic:index===0)?true:undefined}>
          <summary>{article.title}<ChevronDownIcon size={18}/></summary>
          <p>{article.body}</p>
          {article.steps&&<ol className={styles.steps}>{article.steps.map(step=><li key={step}>{step}</li>)}</ol>}
          {article.sources&&<div className={styles.sources}><span>Referensi resmi</span>{article.sources.map(source=><a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer">{source.label}<span className="visually-hidden"> (dibuka di tab baru)</span></a>)}</div>}
        </details>):<div className="empty-page">
          <h3>Topik belum ditemukan</h3>
          <p>{category!=='Semua'&&matches.length?'Topik terkait tersedia di kategori lain.':'Coba kata lain atau pilih salah satu rekomendasi berikut.'}</p>
          <div className={styles.recommendations}>
            {category!=='Semua'&&<button type="button" className="button secondary small-button" onClick={()=>setCategory('Semua')}>Cari di semua kategori</button>}
            {recommendedArticles.map(article=><button type="button" key={article.id} onClick={()=>{setQuery(article.title);setCategory('Semua');}}>{article.title}</button>)}
          </div>
        </div>}
      </div>
    </div>
  </>;
}
