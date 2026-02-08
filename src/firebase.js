import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyDVBpC-BPFNKyt9xU9lZEcZU1L7z1buMrk",
  authDomain:        "star-flow-796c6.firebaseapp.com",
  projectId:         "star-flow-796c6",
  storageBucket:     "star-flow-796c6.firebasestorage.app",
  messagingSenderId: "53315400000",
  appId:             "1:53315400000:web:2c1065187bb65393d80aa5",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
