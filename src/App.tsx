import React, { useState, useEffect } from 'react';
import { db } from './firebase'; // Ensure you have the firebase.ts file we discussed
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ChequeData } from './types';
import { Printer, Share2, History, PlusCircle, CheckCircle2 } from 'lucide-react';
import ChequeForm from './components/ChequeForm';
import ChequePreview from './components/ChequePreview';
import ChequePrint from './components/ChequePrint';
// src/App.tsx


export default function App() {
  const [data, setData] = useState<ChequeData>({
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, ''),
    payTo: '',
    amountInWords: '',
    amountInNumbers: '',
    chequeNo: '',
    hidePayee: false
  });

  const [history, setHistory] = useState<ChequeData[]>([]);

  // Requirement #9: Real-time History Sync
  useEffect(() => {
    const q = query(collection(db, "cheques"), orderBy("createdAt", "desc"), limit(5));
    return onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChequeData)));
    });
  }, []);

  const handlePrint = async () => {
    // Requirement #3: Save for record purpose
    try {
      await addDoc(collection(db, "cheques"), {
        ...data,
        createdAt: serverTimestamp()
      });
      window.print();
    } catch (e) {
      console.error("Error saving record: ", e);
      window.print(); // Print anyway if offline
    }
  };

  const shareToWhatsApp = () => {
    // Requirement #3 & #8: Your specific WhatsApp format
    const formattedDate = `${data.date.slice(0,2)}/${data.date.slice(2,4)}/${data.date.slice(4)}`;
    const message = `${data.payTo} ${data.amountInNumbers}/- on ${formattedDate} : ${data.chequeNo}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
      {/* 2026 Professional Navigation */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-orange-200">RL</div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Red Lantern</h1>
            <p className="text-xs text-slate-500">Professional Cheque Suite</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={shareToWhatsApp} className="flex items-center gap-2 bg-[#25D366] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:scale-105 transition">
            <Share2 size={18} /> WhatsApp Group
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-black transition">
            <Printer size={18} /> Print Cheque
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form and History */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="flex items-center gap-2 font-bold mb-6 text-slate-800">
              <PlusCircle size={20} className="text-brand" /> New Entry
            </h2>
            <ChequeForm data={data} onChange={setData} />
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="flex items-center gap-2 font-bold mb-4 text-slate-800">
              <History size={20} /> History
            </h2>
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                  <div className="text-xs font-semibold">{item.payTo}</div>
                  <div className="text-xs font-bold text-brand">₹{item.amountInNumbers}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Preview */}
        <div className="lg:col-span-8">
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center overflow-x-auto">
            <p className="self-start text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Live Bank Preview</p>
            <ChequePreview data={data} />
          </div>
        </div>
      </main>

      {/* Printer Component (Hidden on Screen) */}
      <div className="hidden print:block">
        <ChequePrint data={data} />
      </div>
    </div>
  );
}