import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

type UserDocument = {
  hlToken?: {
    accessToken?: string
    locationName?: string
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(auth.currentUser)
  const hlConnected = ref(false)
  const hlLocationName = ref('')
  const loading = ref(true)
  const error = ref('')

  const isLoggedIn = computed(() => !!user.value)

  let unsubscribeUserDoc: Unsubscribe | null = null

  function clearHLConnection() {
    hlConnected.value = false
    hlLocationName.value = ''
  }

  onAuthStateChanged(auth, (firebaseUser) => {
    user.value = firebaseUser
    loading.value = false
    error.value = ''

    unsubscribeUserDoc?.()
    unsubscribeUserDoc = null

    if (!firebaseUser) {
      clearHLConnection()
      return
    }

    unsubscribeUserDoc = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snapshot) => {
        const data = snapshot.data() as UserDocument | undefined
        const token = data?.hlToken

        hlConnected.value = !!token?.accessToken
        hlLocationName.value = token?.locationName || ''
      },
      (snapshotError) => {
        error.value = snapshotError.message
        clearHLConnection()
      },
    )
  })

  async function signUp(email: string, password: string) {
    loading.value = true
    error.value = ''

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      user.value = credential.user
    } catch (signUpError) {
      error.value = signUpError instanceof Error ? signUpError.message : 'Unable to sign up'
      throw signUpError
    } finally {
      loading.value = false
    }
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = ''

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      user.value = credential.user
    } catch (signInError) {
      error.value = signInError instanceof Error ? signInError.message : 'Unable to sign in'
      throw signInError
    } finally {
      loading.value = false
    }
  }

  async function logOut() {
    loading.value = true
    error.value = ''

    try {
      await signOut(auth)
      user.value = null
      clearHLConnection()
    } catch (logOutError) {
      error.value = logOutError instanceof Error ? logOutError.message : 'Unable to sign out'
      throw logOutError
    } finally {
      loading.value = false
    }
  }

  async function reloadHLStatus() {
    if (!user.value) {
      return
    }

    const snapshot = await getDoc(doc(db, 'users', user.value.uid))
    const data = snapshot.data() as UserDocument | undefined
    const token = data?.hlToken

    hlConnected.value = !!token?.accessToken
    hlLocationName.value = token?.locationName || ''
  }

  return {
    user,
    hlConnected,
    hlLocationName,
    loading,
    error,
    isLoggedIn,
    signUp,
    signIn,
    logOut,
    reloadHLStatus,
  }
})
