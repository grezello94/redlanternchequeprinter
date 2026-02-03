// src/types.ts
export interface ChequeData {
  id?: string;
  date: string;
  payTo: string;
  amountInWords: string;
  amountInNumbers: string;
  accountNumber: string;
  branch: string;
  ifscCode: string;
  payeeName?: string;
  chequeNo: string;   // Requirement #3
  hidePayee: boolean; // Requirement #2
  createdAt?: any;    // For Firebase sorting
}