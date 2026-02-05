import { useEffect, useState } from 'react';
import { db, repairIndexedDbPersistence } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import type { ChequeData } from '../types';

export default function ChequeForm({ data, onChange }: { data: ChequeData, onChange: any }) {
  const [prevDates, setPrevDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const isIndexedDbError = (e: any) => {
    const msg = (e?.message || '').toString();
    return e?.name === 'IndexedDbTransactionError' ||
      msg.includes('IndexedDbTransactionError') ||
      msg.includes('IDBTransaction') ||
      msg.includes('IndexedDB');
  };

  const withIndexedDbRetry = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e: any) {
      if (isIndexedDbError(e)) {
        const repaired = await repairIndexedDbPersistence();
        if (repaired) {
          try {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('rl:db-repaired'));
            }
          } catch { /* no-op */ }
          return await fn();
        }
      }
      throw e;
    }
  };

  // Save cheque to Firestore
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      await addDoc(collection(db, 'cheques'), {
        ...data,
        createdAt: serverTimestamp(),
      });
      setSaveMsg('Cheque saved!');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error';
      console.error('Error saving cheque:', err);
      setSaveErr(message);
      setSaveMsg('Error saving cheque');
    }
    setSaving(false);
  };

  useEffect(() => {
    if (data.payTo.length > 3) {
      const fetchMemory = async () => {
        try {
          const snap = await withIndexedDbRetry(async () => {
            const q = query(
              collection(db, "cheques"), 
              where("payTo", "==", data.payTo),
              orderBy("createdAt", "desc"),
              limit(3)
            );
            return await getDocs(q);
          });
          setPrevDates(snap.docs.map(doc => doc.data().date));
        } catch (err) {
          console.error('Error fetching previous dates:', err);
          setPrevDates([]);
        }
      };
      fetchMemory();
    } else {
      setPrevDates([]);
    }
  }, [data.payTo]);

  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payee Name</label>
        <input 
          className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"
          value={data.payTo} 
          onChange={e => onChange({...data, payTo: e.target.value})}
          placeholder="Joshua Foods"
        />
        
        <div className="flex items-center gap-2 mt-2">
          <input type="checkbox" id="hideP" checked={data.hidePayee} onChange={e => onChange({...data, hidePayee: e.target.checked})} />
          <label htmlFor="hideP" className="text-xs text-slate-500 cursor-pointer">Don't print name on cheque</label>
        </div>
        
        {prevDates.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase">Previous Dates:</p>
            <div className="flex gap-2">
              {prevDates.map((d, i) => (
                <button key={i} onClick={() => onChange({...data, date: d})} className="text-[10px] bg-orange-50 text-[#e67e22] px-2 py-1 rounded border border-orange-100">
                  {d.slice(0,2)}/{d.slice(2,4)}/{d.slice(4)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date (DDMMYYYY)</label>
          <input className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono" maxLength={8} value={data.date} onChange={e => onChange({...data, date: e.target.value})} />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cheque No.</label>
          <input className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl" value={data.chequeNo} onChange={e => onChange({...data, chequeNo: e.target.value})} placeholder="123456" />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount (Numbers)</label>
        <input className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={data.amountInNumbers} onChange={e => onChange({...data, amountInNumbers: e.target.value})} placeholder="50000" />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount (Words)</label>
        <textarea className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" rows={2} value={data.amountInWords} onChange={e => onChange({...data, amountInWords: e.target.value})} placeholder="Rupees Fifty Thousand Only" />
      </div>
      {/* Save button */}
      <div className="pt-4">
        <button
          className="bg-[#e67e22] text-white px-6 py-2 rounded-xl font-bold disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Cheque'}
        </button>
        {saveMsg && <span className="ml-3 text-sm text-slate-500">{saveMsg}</span>}
        {saveErr && <div className="mt-2 text-xs text-red-600">Error details: {saveErr}</div>}
      </div>
    </div>
  );
}
