import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { ChequeData } from '../types';

export default function ChequeForm({ data, onChange }: { data: ChequeData, onChange: any }) {
  const [prevDates, setPrevDates] = useState<string[]>([]);

  // Requirement #4: Memory Logic
  useEffect(() => {
    if (data.payTo.length > 3) {
      const fetchMemory = async () => {
        const q = query(
          collection(db, "cheques"), 
          where("payTo", "==", data.payTo),
          orderBy("createdAt", "desc"),
          limit(3)
        );
        const snap = await getDocs(q);
        // Extract dates and remove duplicates
        const dates = snap.docs.map(doc => doc.data().date);
        setPrevDates([...new Set(dates)]);
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
          className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand outline-none transition"
          value={data.payTo} 
          onChange={e => onChange({...data, payTo: e.target.value})}
          placeholder="Enter Supplier Name"
        />
        
        {/* Requirement #2: Optional Toggle */}
        <div className="flex items-center gap-2 mt-2">
          <input 
            type="checkbox" 
            id="hidePayee"
            className="rounded border-slate-300 text-brand focus:ring-brand"
            checked={data.hidePayee} 
            onChange={e => onChange({...data, hidePayee: e.target.checked})} 
          />
          <label htmlFor="hidePayee" className="text-xs text-slate-500 cursor-pointer">Don't print name on cheque</label>
        </div>
        
        {/* Requirement #4: Previous Dates UI */}
        {prevDates.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Previous Dates Given:</p>
            <div className="flex flex-wrap gap-2">
              {prevDates.map(d => (
                <button 
                  key={d} 
                  onClick={() => onChange({...data, date: d})} 
                  className="text-[11px] bg-orange-50 text-brand px-3 py-1 rounded-full border border-orange-100 hover:bg-brand hover:text-white transition"
                >
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
          <input 
            className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono" 
            maxLength={8}
            value={data.date} 
            onChange={e => onChange({...data, date: e.target.value})} 
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cheque No.</label>
          <input 
            className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono" 
            value={data.chequeNo} 
            onChange={e => onChange({...data, chequeNo: e.target.value})} 
            placeholder="Record Only"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount (Numbers)</label>
        <input 
          className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg" 
          value={data.amountInNumbers} 
          onChange={e => onChange({...data, amountInNumbers: e.target.value})} 
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount (Words)</label>
        <textarea 
          className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" 
          rows={2} 
          value={data.amountInWords} 
          onChange={e => onChange({...data, amountInWords: e.target.value})} 
          placeholder="Rupees..."
        />
      </div>
    </div>
  );
}