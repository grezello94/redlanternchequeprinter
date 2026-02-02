import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCwCl_qdv_AAi90GarYC46MPjM-dahi8Sk",
  authDomain: "redlanternchequeprinter.firebaseapp.com",
  projectId: "redlanternchequeprinter",
  storageBucket: "redlanternchequeprinter.firebasestorage.app",
  messagingSenderId: "448772923731",
  appId: "1:448772923731:web:d30aac2fcd998c4f1fc1a6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable Offline Mode
enableIndexedDbPersistence(db).catch((err) => {
  console.error("Persistence failed", err.code);
});

export { db };