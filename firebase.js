import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBa2FxudYPqY4zrEoo4P9fSWMffzLuJxBY",
  authDomain: "viajeriverland.firebaseapp.com",
  databaseURL: "https://viajeriverland-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "viajeriverland",
  storageBucket: "viajeriverland.firebasestorage.app",
  messagingSenderId: "643111781913",
  appId: "1:643111781913:web:6a1a081c6d8622e5bb4c88"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, onValue, set };
