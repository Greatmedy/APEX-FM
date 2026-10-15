import { useCallback, useEffect, useState } from 'react';
import api, { API_URL, errMsg } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Spinner, Field } from '../ui';
import { fmtWAT } from '../../lib/time';

const MAX_BYTES = 500 * 1024;
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const src = (u) => (/^https?:/i.test(u) ? u : API_URL + u);

/** Keep small files as they are; shrink large images to <= 800px so every upload stays under the server limit. */
async function prepare(file) {
  if (!OK_TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is too large. Pick one under 8 MB.');
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('That file is not a readable image.');
  if (file.size <= MAX_BYTES && bmp.width <= 800 && bmp.height <= 800) return file;
  const s = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.88));
  const out = blob && blob.type === 'image/webp' ? blob : await new Promise((r) => cv.toBlob(r, 'image/png'));
  if (!out || out.size > MAX_BYTES) throw new Error('Image is still over 500 KB after resizing. Try a simpler logo.');
  return out;
}

export default function AdBoardsAdmin() {
  const toast = useToast();
  const [days, setDays] = useState(null);
  const [season, setSeason] = useState(null);
  const [gw, setGw] = useState('');
  const [md, setMd] = useState(null);
  const [brands, setBrands] = useState([]);
  const [draft, setDraft] = useState({ name: '', id: '', url: '' });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const max = md?.max || 20;
  const locked = !!md?.locked;

  useEffect(() => {
    api.get('/admin/ads/matchdays').then(({ data }) => {
      setDays(data.matchdays); setSeason(data.season);
      const next = data.matchdays.find((d) => !d.locked);
      setGw(String((next || data.matchdays[data.matchdays.length - 1] || {}).gameweek || ''));
    }).catch((e) => toast(errMsg(e), 'error'));
  }, []); // eslint-disable-line
  const load = useCallback(() => {
    if (!gw || !season) return;
    setMd(null);
    api.get(`/admin/ads/${season}/${gw}`).then(({ data }) => { setMd(data); setBrands(data.brands); setDirty(false); }).catch((e) => toast(errMsg(e), 'error'));
  }, [gw, season]); // eslint-disable-line
  useEffect(load, [load]);

  const upload = async (file) => {
    const blob = await prepare(file);
    const { data } = await api.post(`/admin/ads/${season}/${gw}/images`, blob, { headers: { 'Content-Type': blob.type }, transformRequest: [(d) => d] });
    return data;
  };
  const pickDraft = async (f) => {
    if (!f) return;
    setBusy(true);
    try { const r = await upload(f); setDraft((d) => ({ ...d, id: r.id, url: r.url })); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const replace = async (i, f) => {
    if (!f) return;
    setBusy(true);
    try { const r = await upload(f); setBrands((b) => b.map((x, k) => (k === i ? { ...x, id: r.id, url: r.url } : x))); setDirty(true); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const add = () => {
    const name = draft.name.replace(/\s+/g, ' ').trim();
    if (!name) return toast('Type the brand name.', 'error');
    if (!draft.id) return toast('Upload the brand logo first.', 'error');
    if (brands.length >= max) return toast(`A matchday can have at most ${max} brands.`, 'error');
    setBrands((b) => [...b, { id: draft.id, name, url: draft.url }]); setDraft({ name: '', id: '', url: '' }); setDirty(true);
  };
  const move = (i, d) => setBrands((b) => { const n = [...b], j = i + d; if (j < 0 || j >= n.length) return b; [n[i], n[j]] = [n[j], n[i]]; return n; }) || setDirty(true);
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put(`/admin/ads/${season}/${gw}`, { brands: brands.map((b) => ({ id: b.id, name: b.name })) }); setMd(data); setBrands(data.brands); setDirty(false); toast('Advertising lineup saved', 'success'); setDays((d) => d.map((x) => (String(x.gameweek) === gw ? { ...x, brands: data.brands.length } : x))); }
    catch (e) { toast(errMsg(e), 'error'); load(); } finally { setBusy(false); }
  };

  if (!days) return <Spinner />;
  if (!days.length) return <p className="text-sm text-slate-300">No matchdays exist yet.</p>;
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="glass p-4 space-y-3">
        <p className="font-display text-lg">Pitch-side advertising</p>
        <p className="text-sm text-slate-300">Up to {max} brands per matchday. Boards rotate to the next brand every 5 seconds during matches. The lineup locks when the matchday kicks off.</p>
        <Field label="Matchday">
          <select className="input" value={gw} onChange={(e) => { if (dirty && !window.confirm('Discard unsaved changes?')) return; setGw(e.target.value); }}>
            {days.map((d) => <option key={d.gameweek} value={d.gameweek}>Gameweek {d.gameweek} · {fmtWAT(d.kickoffAt)} · {d.locked ? 'locked' : 'open'} · {d.brands} brand{d.brands === 1 ? '' : 's'}</option>)}
          </select>
        </Field>
        {locked && <p className="text-sm text-gold font-semibold" role="status">This matchday has started. Its lineup is read-only.</p>}
      </div>
      {!md ? <Spinner /> : (
        <>
          <div className="glass overflow-hidden">
            {brands.length === 0 && <p className="p-5 text-sm text-slate-300">No brands yet. Boards will show the default APEX FM board.</p>}
            {brands.map((b, i) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-white/5 first:border-0">
                <span className="num w-6 text-slate-400">{i + 1}</span>
                <img src={src(b.url)} alt="" className="h-12 w-20 object-contain bg-white rounded-lg p-1" />
                <input className="input !min-h-[40px] flex-1 min-w-[140px]" value={b.name} maxLength={32} disabled={locked} aria-label={`Brand ${i + 1} name`} onChange={(e) => { const v = e.target.value; setBrands((l) => l.map((x, k) => (k === i ? { ...x, name: v } : x))); setDirty(true); }} />
                {!locked && (
                  <div className="flex items-center gap-1">
                    <label className="btn btn-ghost !min-h-[40px] !px-3 text-xs cursor-pointer">Replace<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { replace(i, e.target.files[0]); e.target.value = ''; }} /></label>
                    <button className="btn btn-ghost !min-h-[40px] !px-3" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="btn btn-ghost !min-h-[40px] !px-3" onClick={() => move(i, 1)} disabled={i === brands.length - 1} aria-label="Move down">↓</button>
                    <button className="btn btn-danger !min-h-[40px] !px-3 text-xs" onClick={() => { setBrands((l) => l.filter((_, k) => k !== i)); setDirty(true); }}>Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!locked && (
            <div className="glass p-4 space-y-3">
              <p className="font-display text-lg">Add a brand ({brands.length}/{max})</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Brand name"><input className="input" value={draft.name} maxLength={32} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Acme Sports" /></Field>
                <Field label="Logo or image" hint="PNG, JPEG or WebP. Large files are resized automatically."><input type="file" accept="image/png,image/jpeg,image/webp" className="input !p-2" disabled={busy} onChange={(e) => { pickDraft(e.target.files[0]); e.target.value = ''; }} /></Field>
              </div>
              {(draft.url || draft.name) && (
                <div className="flex items-center gap-3 rounded-xl bg-ink/70 border border-white/10 px-3 h-14 max-w-sm" aria-label="Board preview">
                  {draft.url && <img src={src(draft.url)} alt="" className="h-9 w-auto max-w-[110px] object-contain bg-white rounded px-1" />}
                  <span className="font-display tracking-wide truncate">{(draft.name || 'Brand name').toUpperCase()}</span>
                </div>
              )}
              <button className="btn btn-ghost" onClick={add} disabled={busy || brands.length >= max}>Add to lineup</button>
            </div>
          )}
          {!locked && <div className="flex items-center gap-3"><button className="btn btn-gold" onClick={save} disabled={busy || !dirty}>{busy ? 'Working' : 'Save lineup'}</button>{dirty && <span className="text-xs text-gold">Unsaved changes</span>}</div>}
        </>
      )}
    </div>
  );
}
