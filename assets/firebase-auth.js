import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const app = initializeApp({
  apiKey: "AIzaSyCig4C5pu-7xu9O0XxvSg_OP7h11hQh75E",
  authDomain: "semeia-a7cd2.firebaseapp.com",
  projectId: "semeia-a7cd2",
  appId: "1:348956830444:web:ec4b8ac6b13fb6ba0b53c9",
});
const auth = getAuth(app);

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  if (!result.user.emailVerified) throw new Error("Confirme o e-mail da sua conta Google antes de entrar.");
  return result.user.getIdToken();
}

export async function currentIdToken() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export function restoreIdToken() {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      resolve(user ? user.getIdToken() : null);
    });
  });
}
