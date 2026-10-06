import { useEffect, useState } from 'react';
import api, { errMsg } from '../lib/api';
import { Modal, Spinner, ErrorState } from './ui';
import PlayerCard from './PlayerCard';
import Crest from './Crest';

export default function SquadModal({ templateKey, onClose, onChoose, busy }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!templateKey) return;
    setData(null); setErr('');
    api.get(`/templates/${templateKey}`).then(({ data: d }) => setData(d)).catch((e) => setErr(errMsg(e)));
  }, [templateKey]);
  const groups = data && [['Goalkeepers', ['GK']], ['Defenders', ['CB', 'LB', 'RB']], ['Midfielders', ['CDM', 'CM', 'CAM']], ['Attackers', ['LW', 'RW', 'ST']]];
  return (
    <Modal open={!!templateKey} onClose={onClose} title={data ? `${data.club.name} squad` : 'Squad'} wide>
      {err ? <ErrorState message={err} /> : !data ? <Spinner label="Loading squad" /> : (
        <>
          <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 px-5 pt-4 pb-3 bg-ink/95 backdrop-blur border-b border-white/10">
            <div className="flex items-center gap-3">
              <Crest colors={data.club.crest} mono={data.club.short} size={52} />
              <div className="flex-1 min-w-0">
                <p className="font-display text-xl truncate">{data.club.name}</p>
                <p className="text-sm text-slate-300">{data.club.stadium} · Best XI OVR <b className="text-gold">{data.club.ovr}</b></p>
              </div>
            </div>
            {onChoose && (
              <button className="btn btn-gold w-full !min-h-[48px] text-base mt-3" disabled={busy} onClick={() => onChoose(data.club.key)}>
                {busy ? 'Saving' : `Choose ${data.club.name}`}
              </button>
            )}
          </div>
          {groups.map(([title, pos]) => (
            <div key={title} className="mb-5">
              <p className="text-xs font-bold text-slate-300 mb-2">{title}</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.players.filter((p) => pos.includes(p.position)).map((p) => <PlayerCard key={p._id} p={p} shirt={data.club.kit.shirt} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}