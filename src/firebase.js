import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyAkBVmQcsdvr4ATjnU3YbgxZAl3HXA46GY",
  authDomain:        "star-flow-3eb19.firebaseapp.com",
  projectId:         "star-flow-3eb19",
  storageBucket:     "star-flow-3eb19.firebasestorage.app",
  messagingSenderId: "206533908974",
  appId:             "1:206533908974:web:2757f14c8a40d2891a16ff",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
