export interface ChequeData {
  id?: string;
  date: string;
  payTo: string;
  amountInWords: string;
  amountInNumbers: string;
  chequeNo: string;
  hidePayee: boolean;
  createdAt?: any;
}