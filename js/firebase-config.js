// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDw38MMFq57Tee09uZnB2DH300FEs5hc7k",
  authDomain: "overtrack-42387.firebaseapp.com",
  projectId: "overtrack-42387",
  storageBucket: "overtrack-42387.firebasestorage.app",
  messagingSenderId: "104475806754",
  appId: "1:104475806754:web:6b6cca50552360f3178e7b"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Servicios
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export {
  db,
  auth,
  storage
};