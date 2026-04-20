// ============================================================================
//  SONDER — FIREBASE (auth + firestore)
// ============================================================================
//  Sections:
//     [INIT]      initialize Firebase app + auth + firestore
//     [AUTH]      sign in / sign up / sign out / current user listener
//     [MEMORIES]  create / read memories (your own + public)
//     [COMMENTS]  add / read comments on a memory
// ============================================================================

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection, doc,
  addDoc, getDoc, getDocs,
  query, where, orderBy,
  serverTimestamp
} from 'firebase/firestore';


// ============================================================================
//  [INIT]  initialize Firebase (config from .env)
// ============================================================================
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);


// ============================================================================
//  [AUTH]  sign in / sign up / sign out / current user listener
// ============================================================================
export const onAuth      = (cb)         => onAuthStateChanged(auth, cb);
export const signUpEmail = (email, pw)  => createUserWithEmailAndPassword(auth, email, pw);
export const signInEmail = (email, pw)  => signInWithEmailAndPassword(auth, email, pw);
export const signInGoogle = ()          => signInWithPopup(auth, new GoogleAuthProvider());
export const logout      = ()           => signOut(auth);


// ============================================================================
//  [MEMORIES]  create / read memories
// ============================================================================
//  Schema:
//     memories/{id}
//       uid:        owner's auth uid
//       song:       { spotifyId, name, artists[], albumArt, previewUrl }
//       note:       string
//       location:   string
//       photoUrl:   string | null   (TODO: photo upload)
//       date:       ISO date string (YYYY-MM-DD)
//       isPublic:   boolean
//       createdAt:  serverTimestamp
// ============================================================================

export async function createMemory({ song, note, location, photoUrl, date, isPublic }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return addDoc(collection(db, 'memories'), {
    uid: user.uid,
    song, note, location, photoUrl, date, isPublic,
    createdAt: serverTimestamp()
  });
}

export async function getMyMemories() {
  const user = auth.currentUser;
  if (!user) return [];
  // Filter only — sort client-side to skip the composite-index requirement.
  const q = query(collection(db, 'memories'), where('uid', '==', user.uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function getMemory(id) {
  const ref = doc(db, 'memories', id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getPublicMemories() {
  const q = query(collection(db, 'memories'), where('isPublic', '==', true));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}


// ============================================================================
//  [COMMENTS]  add / read comments on a memory
// ============================================================================
//  Schema:
//     memories/{memoryId}/comments/{id}
//       uid:        commenter's auth uid
//       email:      commenter's email (for display)
//       text:       string
//       createdAt:  serverTimestamp
// ============================================================================

export async function addComment(memoryId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return addDoc(collection(db, 'memories', memoryId, 'comments'), {
    uid: user.uid,
    email: user.email,
    text,
    createdAt: serverTimestamp()
  });
}

export async function getComments(memoryId) {
  const q = query(
    collection(db, 'memories', memoryId, 'comments'),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
