# CareerPath Africa — Mobile App

React Native / Expo application for iOS and Android.

## Tech stack
- **Expo SDK 52** with Expo Router (file-based navigation)
- **NativeWind** (Tailwind CSS for React Native)
- **TanStack Query** for server state
- **Zustand** for auth state
- **Expo SecureStore** for JWT token storage
- **React Native Video** for lesson playback
- **React Native Reanimated** for flashcard flip animations
- **i18next + react-i18next** for EN/FR

## Directory structure
```
app/
  _layout.tsx          Root layout, QueryClient, SafeAreaProvider
  index.tsx            Auth-aware redirect
  auth/
    login.tsx          Login screen
  (student)/           Student tab navigator
    _layout.tsx        Bottom tab bar
    dashboard.tsx      Home dashboard
    courses/
      index.tsx        Course list
      [id].tsx         Course player (video + lesson sidebar)
    search.tsx         Full-text search
    messages/
      index.tsx        Thread list
      [threadId].tsx   Chat view with iMessage bubbles
    flashcards/
      index.tsx        Deck list
      [deckId].tsx     Spaced-repetition flashcard player
    progress.tsx       XP, badges, course completion
    more.tsx           All other pages + sign out
  (teacher)/           (to be built)
  (admin)/             (to be built)

src/
  lib/
    api.ts             Axios instance with JWT interceptor
    theme.ts           Brand colors + spacing constants
  store/
    auth.ts            Zustand auth store
```

## Setup (when ready to build)
```bash
cd apps/mobile
npm install          # or pnpm install
npx expo start       # dev server
npx expo start --android
npx expo start --ios
```

## Environment variables
Create `.env` in this directory:
```
EXPO_PUBLIC_API_URL=https://api.careerpathafrica.com
```

## EAS Build (production)
```bash
npm install -g eas-cli
eas login
eas build --platform all
```
