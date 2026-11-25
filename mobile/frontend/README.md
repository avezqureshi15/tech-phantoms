# FestiveOS — Mobile app

React Native (Expo SDK 58, Expo Router, TypeScript) for Android and iOS.

## 1. Google OAuth setup (once)

In Google Cloud Console, under APIs & Services → Credentials, create:

| Client | Used for |
|---|---|
| **Web application** | The app's `webClientId`. Google signs the ID token for *this* audience. |
| **iOS** (bundle ID `com.festiveos.app`) | iOS sign-in |
| **Android** (package `com.festiveos.app` + your build's SHA-1) | Android sign-in |

Then set:

```bash
# frontend/.env.local   (never committed)
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000      # omit for emulators
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>

# backend/.env
GOOGLE_CLIENT_IDS=<web client id>[,<ios client id>]
```

The backend refuses to start until `JWT_SECRET` (32+ chars) and `GOOGLE_CLIENT_IDS` are set.

## 2. Run

Google Sign-In uses native code, so **Expo Go cannot run this app**. Use a development build:

```bash
pnpm install
npx expo run:ios       # needs Xcode
npx expo run:android   # needs Android Studio + SDK
# or in the cloud, no local toolchains:
npx eas-cli@latest build --profile development --platform all
```

Start the API from `backend/`: `uv run uvicorn festiveos.main:app --reload --host 0.0.0.0 --no-access-log`.

Android emulators reach the host at `10.0.2.2` and iOS simulators at `localhost`
(both are the defaults). Android release builds block plain `http://`; use HTTPS for production.

## 3. Checks

```bash
pnpm typecheck
pnpm lint
npx expo-doctor
```

## Design system

Flat solid colours with festive line art on top. **No gradients as backgrounds**: depth comes from patterns and glass.

* **Patterns** (`components/Patterns.tsx`): lotus, rangoli, jaali, paisley and the Konark sun wheel, plus "plain". The
  person picks one in Members > Appearance (`lib/appearance.ts`, remembered between launches). It is drawn on hero
  surfaces (`<PatternSurface color=...>`: festival hero, Expenses summary, Today) and, faintly, on the page canvas
  (`<Backdrop>`). To add a design: write a 200 x 200 SVG component, add it to `PatternArt`, `PATTERNS` and `PATTERN_IDS`.
* **Glass** (`<Glass>`): native liquid glass on iOS 26, a blur before that, a solid translucent surface on Android or with
  Reduce Transparency on. It only looks like glass when something is behind it, so it is used for the floating tab bar
  (pages scroll underneath), header pills, and chips that sit on a patterned hero. Never put it behind body text.
* **Cards** (`<Card>`, `<ListRow>`): white, hairline edge, no shadow. Heroes are solid colours: the festival's colour
  mixed toward ink (`lib/color.ts`), near-black for money, burnt saffron for Today.
* **Type** (`AppText`): DM Sans only. display 32, title 24, heading 17, body 16, label 14, caption 13, eyebrow 12; scales
  with the system size up to 1.35x.
* **Rows and tiles**: `<ListRow>` with an `<IconTile>`, a soft tint of the festival's colour. Page titles use
  `<PageHeader>`; pick-one choices use `<SegmentedControl>`; many choices use a grouped picker (`FestivalPicker`).
* **Tokens live in `lib/theme.ts`**. Do not hard-code colours, spacing or radii.
* **Responsive**: `useLayout()` gives the size class; `<Screen>` centres a column of at most 640 pt on tablets.
  `<Screen>` pads for the status bar itself on tab screens (`topInset`) and lets iOS inset for the navigation bar on
  screens that have one.
* **Failures are explained**: `<ErrorState {...errorProps(error)} onRetry={...} />`; a crash shows `ScreenErrorBoundary`;
  unknown routes show `+not-found`.
* **Layout pitfalls we hit.** Do not put `flex: 1` inside a control that lives in a scrolling page: it stretches to fill
  the viewport (`Button` has none and `PressableScale` takes `fill={false}`). `EmptyState` is sized by its content for
  the same reason.
* Icons are Ionicons. No emoji in the interface, except a group's own chosen icon.
* **Not done yet**: dark mode (colours are static tokens) and Android visual QA.

## Utsav (AI chat)

* Screen: `src/app/(app)/utsav/` (chat and history), opened from Home. State is a pure reducer
  (`lib/utsav/chat.ts`); the stream is read with Expo's `fetch` (`lib/api.ts` `openStream`), parsed by
  `lib/utsav/sse.ts` and validated against `lib/utsav/schemas.ts`.
* A reply streams as a *draft* and is replaced by the server's final `done` result, so a missed event can never
  leave the transcript wrong. Text is batched to about 20 renders a second.
* Markdown (`components/Markdown.tsx`, `react-native-marked`): model text is untrusted, so images are never fetched,
  links open only for http(s), mail and phone, and raw HTML is shown as text.
* Cards: questions are forms (choices, not free text), confirmations need an explicit approval, hosting plans show
  the server's computed numbers.
* Voice: the mic records a short clip (`expo-audio`, `features/useVoiceInput.ts`), sends it for transcription and puts
  the words in the box. The language is detected from the speech, so there is no language setting anywhere. The words
  are never sent on automatically; the clip is not kept. It stops by itself at 30 seconds.
* Events and calendar: `links` cards open real event listings (only https links open); `calendar_event` cards add an
  all-day event to the phone's calendar when tapped (`lib/calendar.ts`, `expo-calendar`, write-only access on iOS 17+).
* Receipts and documents: `lib/pick.ts` picks a photo, a PDF or a camera shot; a failing native picker never crashes.
  Adding a native module needs `npx expo prebuild` and a new dev build.
* Voice sessions (`app/(app)/voice.tsx`, `features/useVoiceSession.ts`): "Talk with Utsav" (elder mode) and "Practise a
  prayer" are full-screen and hands-free. Utsav's reply is spoken (`/ai/speak`), then the microphone level decides when the
  person has finished (`lib/voice-session.ts`: speech above about -38 dB, finished after 1.8 s of quiet, gives up after
  12 s of silence, stops by 28 s), the clip is transcribed with the language detected, and the loop continues. Big
  buttons: tap the orb, say it again, slower, end. The screen stays awake. **The loop logic is unit-tested with the audio
  layer mocked, but the thresholds, speaker volume and real microphone behaviour must be tested on a phone** (the
  simulator has no usable microphone).
* Jest needs `marked`, `github-slugger` and `html-entities` in `transformIgnorePatterns` (ESM-only packages).

## Layout

```
src/app/         routes (Expo Router): sign-in, (app)/(tabs), festival, tradition, household, member
src/components/  design system: AppText, Button, Card, Chip, Field, Screen, ...
src/features/    React Query hooks for every endpoint
src/lib/         api client (refresh-on-401), auth provider, zod schemas, theme, dates
```

## Not yet done

- Dark mode (the app is locked to light).
- Editing or deleting festivals, events and traditions from the UI (the API supports edits).

## Running on the iOS simulator (local dev)

One-time machine setup: Xcode installed, its license accepted (`sudo xcodebuild -license accept`) and CocoaPods
(`brew install cocoapods`).

```bash
# 1. the API (from backend/), against any Postgres you own
export DATABASE_URL=postgresql+psycopg://user@127.0.0.1:5432/festiveos_dev
uv run alembic upgrade head
GOOGLE_CLIENT_IDS=<your web client id> uv run uvicorn festiveos.main:app --host 127.0.0.1 --port 8000 --no-access-log

# 2. the app (from frontend/)
npx expo run:ios
```

Signing in uses real Google sign-in, so the OAuth client IDs from section 1 are required.

