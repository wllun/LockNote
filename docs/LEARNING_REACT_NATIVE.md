# Learning React Native Through LockNote

This guide is for a web developer who knows Laravel, Node.js, and vanilla
JavaScript, but is starting React and React Native from zero.

The goal is not to memorize every file. The goal is to understand how data and
user actions flow through a React Native application, then make small changes
until the patterns feel familiar.

## The short answer: should I read `app.json` first?

No.

This project does not have an `app.json`. It uses `app.config.js`, the dynamic
JavaScript version of Expo's app configuration. It defines build-time and
native-app metadata such as the app name, URL scheme, icons, package IDs,
plugins, and environment-derived Supabase settings.

`app.config.js` is useful, but it does not explain how the app behaves. Start
with this runtime path instead:

```text
package.json
  -> index.js
    -> App.js
      -> src/navigation/AppNavigator.js
        -> src/screens/HomeScreen.js
          -> src/components/FolderItem.js and NoteItem.js
          -> src/db/folderRepo.js and noteRepo.js
```

Read `app.config.js` after you understand `App.js`. Think of it roughly as
application/build configuration, not as the application's controller or entry
logic.

## 1. What you must know in React Native

### JavaScript first

You already know JavaScript from Node.js and the browser. Make sure these
features feel natural:

- `import` and `export`
- `const`, `let`, arrow functions, and callbacks
- object and array destructuring
- spread syntax such as `{ ...oldValue, changed: true }`
- array methods such as `map`, `filter`, `find`, and `sort`
- promises, `async`, `await`, and `try/catch`
- optional chaining (`item?.name`) and nullish values

### React's mental model

A React component is a JavaScript function that returns a description of UI:

```jsx
const Greeting = ({ name }) => {
  return <Text>Hello, {name}</Text>;
};
```

Learn these concepts in this order:

1. **Components** — reusable functions that return JSX.
2. **JSX** — HTML-like syntax embedded in JavaScript.
3. **Props** — values a parent passes into a child component.
4. **State** — values owned by a component that can change.
5. **Rendering** — when props or state change, React runs the component again.
6. **Events** — functions such as `onPress` and `onChangeText`.
7. **Hooks** — React functions beginning with `use`, such as `useState`.
8. **Effects and cleanup** — synchronize with things outside rendering.
9. **Context** — share a value with many descendants without passing it through
   every component.

The most important hooks in LockNote are:

- `useState` — stores local screen state.
- `useEffect` — runs side effects and returns cleanup when needed.
- `useCallback` — keeps a callback reference stable.
- `useMemo` — avoids rebuilding a computed value unnecessarily.
- `useContext` — reads shared theme or authentication state.

Do not treat `useEffect` as Laravel middleware or a generic "run code" block.
Rendering should stay pure. Use an effect when the component must synchronize
with an external system: storage, navigation events, deep links, subscriptions,
or timers.

### React Native instead of the browser DOM

React Native uses React, but it does not normally render HTML.

| Web | React Native in this project |
| --- | --- |
| `<div>` | `<View>` |
| `<p>`, `<span>`, headings | `<Text>` |
| `<input>` | `<TextInput>` |
| `<button>` / click handler | `<TouchableOpacity onPress={...}>` |
| scrollable list | `<FlatList>` |
| browser alert/dialog | `Alert` / `<Modal>` |
| CSS stylesheet | `StyleSheet.create(...)` |
| `class` / `className` | `style` |
| `onclick` | `onPress` |
| `localStorage` | AsyncStorage |

Styles are JavaScript objects, not CSS rules. Flexbox is the main layout system,
and its default direction is `column`, unlike the browser's usual horizontal
inline flow.

There is no DOM to query. Do not reach for `document.querySelector`, manually
change a node, or store the UI in global variables. Change state and let React
render the result.

### Mobile-specific ideas

You should understand:

- **Navigation:** screens are pushed, popped, or selected in tabs; there are no
  normal browser pages.
- **Screen lifecycle:** a mounted screen can lose and regain focus without
  unmounting.
- **Safe areas:** content must avoid notches and system UI.
- **Keyboard behavior:** text inputs and the on-screen keyboard affect layout.
- **Platform differences:** iOS, Android, and web do not expose identical APIs.
- **Persistence:** component state disappears when the app closes; durable data
  belongs in SQLite or AsyncStorage.
- **Permissions and native APIs:** camera, files, notifications, and similar
  features require platform-aware APIs and often app configuration.
- **Performance:** long collections should use virtualized lists such as
  `FlatList`; avoid unnecessary renders and heavy work during rendering.

### Expo's role

React Native is the UI/runtime framework. Expo supplies tooling and
version-compatible APIs around it:

- starting the development server;
- running on Android, iOS, and web;
- configuring the native app;
- accessing native capabilities through Expo packages;
- building distributable apps with EAS.

This repository uses Expo SDK 54 and React Native 0.81. When adding or changing
Expo behavior, use the Expo SDK 54 documentation rather than examples written
for unknown or older versions.

### Architecture concepts

LockNote separates responsibilities:

```text
Screen -> repository -> local storage
```

A Laravel comparison:

| LockNote | Rough Laravel analogy |
| --- | --- |
| screen component | Blade page plus controller-like interaction logic |
| reusable component | Blade component |
| repository | service/repository layer |
| SQLite tables | database tables |
| navigation route | route to a screen |
| React Context | narrowly scoped app-wide dependency/state provider |
| `app.config.js` | build/application configuration |

This analogy is only a bridge. In React, a screen both describes UI and reacts
to local state. There is no request/response cycle for every interaction.

## 2. What this project can teach you

### App startup and providers

Read `index.js` and `App.js` to learn:

- registering the root component;
- initializing an async dependency before rendering the app;
- showing a loading state;
- wrapping the component tree in providers;
- sharing theme and auth state with Context.

The startup sequence is:

```text
index.js registers App
  -> App installs ThemeProvider and AuthProvider
    -> AppRoot calls initDB() in useEffect
      -> loading spinner
      -> AppNavigator after the database is ready
```

### Navigation

`src/navigation/AppNavigator.js` teaches:

- a `NavigationContainer`;
- bottom tabs;
- a native stack inside each tab;
- screen names and components;
- route parameters;
- theme-aware navigation styling.

For example, Home navigates to the editor with:

```js
navigation.navigate('NoteEditor', { noteId: note.id });
```

The editor then receives `noteId` from its route parameters. This is closer to
passing a small route parameter than passing an entire server-rendered page.

### Components, props, and events

Compare `HomeScreen.js` with `NoteItem.js` and `FolderItem.js`.

The screen owns the data and behavior. An item component receives:

- the item to display;
- an `onPress` callback;
- an `onTogglePin` callback.

That demonstrates one-way data flow: parent state goes down as props, and child
interactions go up through callbacks.

### State and derived UI

`HomeScreen.js` contains local state for folders, notes, loading, refreshing,
search text, search results, and modal visibility.

Study how:

- `useState` stores values;
- an input updates state with `onChangeText`;
- JSX conditionally displays search results or normal lists;
- state controls whether a modal is visible;
- async repository results are copied into state.

### Effects and screen focus

Screens load data on the navigation `focus` event:

```js
useEffect(() => {
  const unsubscribe = navigation.addListener('focus', loadData);
  return unsubscribe;
}, [navigation, loadData]);
```

This is a valuable mobile pattern. Returning from the note editor focuses the
previous screen again, so it reloads fresh data. The returned function removes
the listener and prevents duplicate subscriptions.

### Forms and native interaction

The screens and modals demonstrate:

- controlled `TextInput` fields;
- validation before an action;
- secure text entry;
- `Alert.alert`;
- touch events;
- pull-to-refresh;
- modal presentation;
- icons and accessibility labels.

### Local persistence and repository boundaries

Read `src/db/sqlite.js`, then compare:

- `src/db/noteRepo.js`
- `src/db/noteRepo.web.js`

Native uses SQLite while web uses AsyncStorage. Metro automatically selects the
`.web.js` file for web builds, even though screens import `../db/noteRepo`
without an extension.

Both repository versions expose the same methods and return the same shapes.
This is one of the best lessons in the project: UI code depends on a stable
interface instead of knowing how each platform stores data.

Important domain rules visible in these repositories:

- `folder_id === null` means a root-level note;
- reads exclude soft-deleted records;
- UI deletion normally calls `softDelete()`;
- repositories generate IDs and timestamps;
- pinned items sort first;
- passwords are hashed, but note content is not encrypted.

### Debouncing and cleanup

`src/screens/NoteEditorScreen.js` demonstrates an 800 ms debounced auto-save.
Study it only after you understand basic state and effects.

Look for:

- a timer reference;
- saving after the user stops typing;
- clearing a pending timer before another operation;
- cleanup when the editor unmounts;
- deletion of a newly created note if it is still completely empty.

Timers plus async state make this one of the more advanced learning files.

### Theme Context

`src/theme.js` is a manageable example of Context:

- a provider owns the selected theme;
- AsyncStorage persists the preference;
- `useColorScheme()` follows the device setting;
- custom hooks expose the colors and mode;
- components derive their `StyleSheet` from the active palette.

### Authentication and deep linking

Learn auth last. It introduces network calls, sessions, subscriptions, app URL
callbacks, validation, and error mapping all at once.

Relevant files are:

- `src/context/AuthContext.js`
- `src/services/supabaseClient.js`
- `src/services/authService.mjs`
- `src/utils/auth.mjs`
- `src/screens/AuthScreen.js`

Auth is the exception to the app's local-only note storage. Notes and folders
remain on the device; Supabase is currently used for account authentication.

## 3. How to read through the code

### Pass 0: run it before studying it

From the project directory:

```powershell
npm install
npm start
```

Press `w` for web, or use an Android/iOS development environment when
available. Create a folder, create a root note, edit it, lock it, pin it, search
for it, and delete it. Write down the exact UI actions you performed. Those
actions become paths to trace in the code.

### Pass 1: build a map, without reading every line

Read in this order:

1. `README.md` — product purpose, commands, and broad layout.
2. `docs/ARCHITECTURE.md` — the system map and important invariants.
3. `docs/PROJECT_STATE.md` — what is complete, incomplete, or intentionally
   limited.
4. `package.json` — entry file, scripts, and major dependencies.
5. `index.js` — the true JavaScript entry point.
6. `App.js` — providers, database initialization, and initial rendering.
7. `src/navigation/AppNavigator.js` — every reachable screen.
8. `app.config.js` — Expo/native build configuration.

On this pass, answer only:

- Where does execution begin?
- What must finish before the UI appears?
- Which providers wrap the app?
- Which screens can the user reach?
- Which dependencies provide navigation, storage, and native features?

Do not stop to understand every styling property.

### Pass 2: trace one read operation

Trace the Home screen loading notes:

```text
HomeScreen receives focus
  -> loadData()
    -> noteRepo.getRootNotes()
      -> SQLite query on native
      -> AsyncStorage filter on web
    -> setNotes(...)
      -> React renders NoteItem components
```

Open the files in this order:

1. `src/screens/HomeScreen.js`
2. `src/db/noteRepo.js`
3. `src/db/noteRepo.web.js`
4. `src/components/NoteItem.js`

Answer:

- What triggers the load?
- Why is the function async?
- Where does durable data come from?
- What changes after `setNotes`?
- Which values are props?
- How does the web implementation preserve the native API?

### Pass 3: trace one write operation

Trace creating and editing a root note:

```text
User taps +
  -> note-type modal opens
  -> handleCreateRootNote()
  -> noteRepo.create(null, '', '')
  -> repository creates ID and timestamps
  -> navigation.navigate('NoteEditor', { noteId })
  -> editor loads the note
  -> title/content state changes
  -> 800 ms debounce
  -> noteRepo.update(...)
```

Read:

1. the create-note handlers in `HomeScreen.js`;
2. `src/components/NoteTypeModal.js`;
3. `create()` in both note repositories;
4. `src/screens/NoteEditorScreen.js`;
5. `update()` in both repositories.

Pay special attention to why `null` is passed as the folder ID: it is a domain
rule meaning that the note lives at the root.

### Pass 4: trace a reusable interaction

Trace opening a password-protected note:

```text
NoteItem onPress
  -> HomeScreen checks note.password
  -> PasswordModal opens
  -> entered password is hashed
  -> hashes are compared
  -> navigate to NoteEditor
```

Read `PasswordModal.js` and `src/utils/crypto.js`. Remember: this gates the UI,
but it does not encrypt note content.

### Pass 5: compare platform implementations

Compare each native/web pair side by side:

```text
src/db/folderRepo.js      <-> src/db/folderRepo.web.js
src/db/noteRepo.js        <-> src/db/noteRepo.web.js
src/db/sqlite.js          <-> src/db/sqlite.web.js
```

Make a table listing every exported method, its arguments, return shape, and
storage operation. The two sides should match. This exercise teaches both
platform resolution and interface design.

### Pass 6: study cross-cutting features

After the main note flow is clear, read:

1. `src/theme.js` and `SettingsScreen.js`;
2. `AuthContext.js` and `ProfileTabScreen.js`;
3. auth service, validation, and auth screens;
4. `app.config.js` for deep-link and environment configuration;
5. tests and `scripts/verify.mjs`.

## A practical six-week learning path

Adjust the pace to your available time. Building small changes matters more
than finishing on schedule.

### Week 1: React fundamentals

- Learn components, JSX, props, state, events, and conditional rendering.
- Recreate `FolderItem` as a tiny isolated component on paper or in a scratch
  screen.
- Change a label, icon, spacing value, and color in LockNote.

Goal: explain why changing state causes the visible UI to update.

### Week 2: Hooks and screen behavior

- Study `HomeScreen`.
- Identify every piece of state and every effect.
- Add a harmless UI filter or empty-state message.
- Use logging temporarily to observe render, focus, and cleanup timing.

Goal: distinguish rendering, event handling, and side effects.

### Week 3: Navigation and forms

- Trace every route in `AppNavigator`.
- Follow route parameters into `FolderScreen` and `NoteEditorScreen`.
- Study controlled inputs and modal state.
- Add a small validation rule with a clear error.

Goal: add a screen or interaction without manipulating a DOM.

### Week 4: Persistence

- Learn basic SQL CRUD.
- Compare SQLite and AsyncStorage repository implementations.
- Add a small field only as a learning branch, updating native and web
  implementations together.
- Preserve root-note and soft-delete behavior.

Goal: follow data from input, through a repository, into storage, and back into
rendered UI.

### Week 5: Lifecycle, timers, and Context

- Study editor auto-save and its cleanup.
- Study the theme provider and custom hooks.
- Experiment with a new theme preference or editor status indicator.

Goal: understand why subscriptions and timers require cleanup.

### Week 6: testing and one complete feature

- Read `scripts/verify.mjs` and `tests/auth.test.mjs`.
- Pick a small roadmap item or self-contained improvement.
- Write down its data shape, UI states, events, persistence changes, and error
  cases before coding.
- Implement it on both native and web storage paths where applicable.
- Run `npm.cmd test`.

Goal: deliver one small feature without breaking project invariants.

## How to study an unfamiliar component

For each screen or component, use this checklist:

1. What props enter the function?
2. What state does it own?
3. Which values are derived rather than stored?
4. What does it render?
5. Which user events can occur?
6. Which event handler changes which state?
7. Which effects run, and what external system do they synchronize with?
8. Does every subscription or timer have cleanup?
9. Which repository or service calls cross the UI boundary?
10. What happens during loading, empty, success, and error states?

Annotate references rather than syntax. For example, when you see
`onPress={() => handleNotePress(note)}`, follow `handleNotePress`, then follow
the navigation destination. That is more useful than reading top to bottom and
trying to remember everything.

## Good first exercises in this repository

Start with changes that are visible and reversible:

1. Change text, spacing, colors, or an icon.
2. Add a character counter to the note editor.
3. Add an "edited at" label using the existing `updated_at` value.
4. Add a client-side toggle that hides or shows a section.
5. Add a confirmation before a non-destructive action.
6. Add a small reusable presentational component.

Then try repository-aware exercises:

1. Add a sort selection while preserving pinned-first ordering.
2. Add a trash screen that reads soft-deleted items rather than permanently
   deleting them.
3. Add a new note metadata field, including its SQLite migration and matching
   AsyncStorage shape.

For real project changes, always preserve these rules:

- update native and `.web.js` repositories together;
- filter soft-deleted records from normal reads;
- use `softDelete()` for user-facing deletion;
- keep `folder_id` nullable for root notes;
- hash passwords and never describe the content as encrypted;
- clear editor save timers before destructive actions and on unmount;
- run `npm.cmd test` before considering the change complete.

## Concepts you do not need on day one

Postpone these until the core app flow makes sense:

- native module development;
- EAS builds and app-store submission;
- React Native's New Architecture internals;
- advanced animation worklets;
- deep-link authentication;
- performance micro-optimization;
- adding a global state library.

LockNote intentionally has no global state library. Its screens reload on focus
and use repositories directly. Learn the architecture that exists before
considering a different one.

## Your target understanding

You are ready to work independently in this project when you can explain this
sentence in detail:

> A user event calls a screen handler; the handler updates local React state,
> navigates, or calls a platform-independent repository; React renders the new
> state, while Metro selects SQLite-backed native code or AsyncStorage-backed
> web code.

Do not aim to remember the whole codebase. Aim to predict what will happen when
one line changes, verify that prediction by running the app, and repeat.
