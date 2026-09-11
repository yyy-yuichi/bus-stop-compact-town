import { useEffect, useRef, useState } from 'react';
import { placeLink } from './placeLink';
import type { SharedPlace } from './placeLink';
import MapIcon from './MapIcon';

export default function SharePlace({ place }: { place: SharedPlace }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const input = useRef<HTMLInputElement>(null);
  const url = placeLink(window.location.href, place);
  useEffect(() => { setStatus('idle'); }, [url]);
  useEffect(() => { if (status === 'manual') { input.current?.focus(); input.current?.select(); } }, [status]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setStatus('copied'); }
    catch { setStatus('manual'); }
  };
  return <div className="share-place">
    <button className="share-button" onClick={copy}><MapIcon name="link" />この場所のリンクをコピー</button>
    <p role="status">{status === 'copied' ? 'リンクをコピーしました' : status === 'manual' ? '下のリンクを選択してコピーしてください' : ''}</p>
    {status === 'manual' && <input ref={input} readOnly value={url} aria-label="この場所の共有リンク" onFocus={e => e.currentTarget.select()} />}
  </div>;
}
