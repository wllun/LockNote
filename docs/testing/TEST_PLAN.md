# LockNote full test plan

Baseline: 18 September 2026. Applies to Expo SDK 54, React Native 0.81 and Premium Proposal 2, including read-only subfolder notes after Pro expiry.

This is a test specification, not a record of passed tests. Every case starts **Not run**. Copy the run template at the end before testing a particular build. The companion `HOW_TO_TEST.docx` explains the execution workflow.

## 1 Scope and priorities

Android mobile is the first release target. Run the complete applicable plan on Android. iOS cases are required before an iOS release. Web remains a supported repository/runtime regression target even if no public website is released. Do not label an Android-only run as cross-platform verification.

| Priority | Meaning | Execution requirement |
| --- | --- | --- |
| P0 | Data loss, unauthorized access, payment/access integrity or unusable startup | Every release and every affected change |
| P1 | Main workflows and known regressions | Full release regression; affected cases after a change |
| P2 | Less common conditions, polish and exploration | Before public release; repeat when affected |

Developer responsibilities: automated checks, implementation-level diagnosis, repository parity, migration and backend assertions. Tester responsibilities: independently exercise the installed app, devices, permissions, networking and real user workflows. The project owner approves product behavior and release exceptions. One person may hold several roles, but should run the tester checks from written steps rather than relying on knowledge of the implementation.

Security tests verify access gates and server authorization, **not encryption**. Local content and JSON backups are plaintext. Never use genuine financial details, personal photographs, real passwords or production customer data as fixtures.

## 2 Safe environments and prerequisites

- Use dedicated test accounts and a separate Supabase/RevenueCat sandbox environment for destructive, subscription, quota and authorization tests.
- Record Git commit, app version, Android versionCode/iOS build number, build profile, device/OS, backend migration version, RevenueCat environment and network state.
- Keep one disposable clean installation and one installation upgraded from an older supported build with existing data. Never uninstall or clear storage on a user's only copy of notes.
- Use two devices or independent app/browser sessions for sync and sharing. Sessions A and B can use the same account for private sync. Sharing uses an owner account A, invited editor B and unrelated account C; switch B to viewer when required.
- Prepare Free, Plus and Pro accounts through verified sandbox subscriptions. Cancellation is not expiry. For expiry, use accelerated sandbox lifecycle or controlled server fixtures in the test environment; do not add a client premium toggle.
- Configure test email delivery and the allowed account-confirmation, account-reset and LockNote-reset redirects. Configure sharing functions, Realtime, the private image bucket, all migrations through `202609170001_premium_plan_2.sql`, and the authenticated RevenueCat webhook before live-service cases.
- Use a native development/store build for native purchases, notifications, file permissions and keyboard behavior. Expo Go/Test Store and browser checks do not certify Google Play or Apple billing.
- Disable Wi-Fi **and** cellular data for offline cases. A Wi-Fi connection without working internet is a separate failure condition.
- Store evidence outside committed test files. Redact emails, tokens, password hashes, private filenames and secrets from screenshots/logs.

### Test data pack

| Fixture | Content and purpose |
| --- | --- |
| Structure | Home/root note; top-level folder `QA Parent`; its subfolder `QA Child`; another top-level destination `QA Move`; one independently locked folder |
| Four note types | Plain, checklist, expense and reminder at Home, parent and child; unique titles and searchable text |
| Text | ASCII, spaces/newlines, Chinese text, emoji, punctuation, long unbroken word; empty and whitespace-only variants |
| Boundaries | Plain 49,999 / 50,000 / 50,001; reminder 4,999 / 5,000 / 5,001; checklist 99 / 100 / 101 items and item text 499 / 500 / 501; expense remark 199 / 200 / 201; bill name 119 / 120 / 121; summary 9,999 / 10,000 / 10,001 |
| Large legacy data | Plain text above 50,000; reminder above 5,000; checklist created under the old limit with more than 100 items; large expense JSON seeded through a valid disposable fixture |
| Expense oracle | Daily: day 1 `egg fish` 10.00, day 2 `food tea` 5.50, day 3 `bus` 2.00. Bills: Internet 47.79 paid, Insurance 100.00 unpaid. Daily total 17.50, grand total 65.29, remaining bills 100.00. Category Food keywords `egg`, `food`, `fish`: 15.50, with the first row counted once |
| Images | Small portrait/landscape JPEG and PNG, multiple images, source just below/at/above 5 MB; backgrounds below/at/above 10 MB; corrupt/unsupported file; revoked picker/gallery permission |
| Backup | Valid v1 and v2 JSON, newer/older timestamp copies, root notes, locks, archive/pin state, tombstones, disabled imported reminders; malformed variants and just below/at/above 25 MB |
| Cloud | Two-device divergent snapshots; stale revisions; revoked roles; below/at/above 25/75/750 MiB server quotas; duplicate/late subscription events |

For exact text boundaries use ASCII fixtures first: the current implementation counts JavaScript string length, so an emoji can occupy more than one UTF-16 code unit. Report displayed-character discrepancies separately instead of assuming a new Unicode policy. Cloud quotas use MiB displayed as MB: 1 MiB = 1,048,576 bytes. Check the authoritative server usage including metadata and upload reservations, not just visible text length.

## 3 Developer automated checks

Run from the repository root in PowerShell with the project's normal development runtime and installed dependencies:

```powershell
npm.cmd test
```

This invokes `scripts/verify.mjs` and the Node test runner. Save the complete output and exit code. The previous implementation run reported 223 tests; counts can change and are not the acceptance criterion. A zero exit code and no task-related failures are required. Do not weaken tests to obtain a pass.

For a focused diagnosis:

```powershell
node --test tests/subfolder-edit-access.test.mjs
node --test tests/expense-record.test.mjs
node scripts/verify.mjs
```

Focused checks do not replace the complete suite for a release. `verify.mjs` checks source parsing, dependency presence and native/web method names. It does **not** prove identical argument behavior, return shapes, SQLite execution or real UI behavior; inspect those separately.

| Existing files in `tests/` | Coverage area and further evidence needed |
| --- | --- |
| `auth`, `email-rate-limit`, `network-availability` | Validation/request/callback/network logic; actual inbox delivery and device links still need manual tests |
| `lock-password`, `confirmation`, `app-dialog` | Lock/recovery/confirmation policies; real keyboard/backdrop interaction still required |
| `checklist-note`, `expense-record`, `reminder-note`, `note-limits` | Payloads, calculations, schedules and bounds; native editing and notifications still required |
| `editor-exit-disposition`, `editor-undo`, `note-timestamp` | Draft cleanup, history and timestamps; installed app lifecycle and persistence still required |
| `folder-hierarchy`, `note-move`, `note-view-mode`, `note-type-presentation` | Structure/view/presentation policies; grid, breadcrumb and touch tests still required |
| `note-color`, `note-background`, `note-attachment`, `note-export` | Media/export logic; actual managed files, permissions, Gallery and PDF viewing still required |
| `backup-data`, `trash`, `sqlite-migration-order` | Backup/deletion/migration policies; real SQLite upgrade and restore still required |
| `private-sync`, `collaboration-note` | Sync and collaboration logic with controlled dependencies; deployed RLS, leases and two-account verification still required |
| `subscription`, `premium-service`, `premium-access`, `premium-attachments`, `subfolder-edit-access` | Entitlements, gating, owner funding, expiry and pending saves; store/webhook/device verification still required |
| `drag-auto-scroll`, `use-drag-auto-scroll`, `app-update` | Edge-scroll and update-policy logic; finger gestures and installed-build gates still required |

Each entry above refers to `<name>.test.mjs`. Some tests use mocks, extracted callbacks or source assertions. Read the test before claiming integration or end-to-end coverage.

### Disposable premium database verification

Developer only, with Docker running. This fixture applies migrations and writes large synthetic records. It must never target hosted or existing databases. Before starting, inspect `docker ps -a --filter name=locknote-premium-plan2-check` and confirm no existing container is being reused. If the name exists, stop and establish its ownership first.

```powershell
docker run --detach --rm --name locknote-premium-plan2-check -e POSTGRES_PASSWORD=disposable-fixture-only postgres:16
docker exec locknote-premium-plan2-check pg_isready -U postgres
node scripts/verify-premium-db.mjs locknote-premium-plan2-check
```

Repeat `pg_isready` until ready before running the script. No port or persistent volume is needed. Record its exit code and final PASS line. Afterward, stop **only the newly created disposable container** with `docker stop locknote-premium-plan2-check`; `--rm` removes its disposable data. The fixture is not idempotent; use a fresh container for another run. Image download requires network access.

It verifies migrations, premium RLS, owner-funded editing/images, reservations, revoked-member uploads, expiry preservation, quota growth/shrink/concurrency, recovery and stale subscription updates. It uses simplified auth/Storage tables, not a full hosted Supabase or RevenueCat installation. Live cases below remain required.

## 4 Installed app test cases

For each row, perform the action, compare the expected result, then record Pass, Fail, Blocked or Not applicable with evidence. An unchecked box is **Not run**, not a failure. Record each platform/plan variant separately. Unless stated otherwise, close and reopen the note and restart the app to verify persistence. Destructive actions use disposable fixtures only.

### A Startup and local storage

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | START-01 | P0 | Clean Android install, launch offline without account | Home becomes usable; no endless loading or required sign-in |
| [ ] | START-02 | P0 | Restart with existing notes, folders, locks and media offline | Data remains intact; normal private notes open |
| [ ] | START-03 | P0 | Launch with missing/invalid Supabase configuration in a disposable build | Local navigation works; online actions explain configuration errors without crashing |
| [ ] | START-04 | P1 | Launch with slow/unreachable auth, RevenueCat and update-policy services | Local database startup is not held hostage by network initialization |
| [ ] | START-05 | P0 | Upgrade an older installation without uninstalling | Guarded SQLite migrations complete; note types, parent links, passwords and timestamps survive |
| [ ] | START-06 | P1 | Repeatedly background/resume and switch tabs | No duplicate listeners, stuck spinners, blank screens or incorrect focus reload |
| [ ] | START-07 | P0 | Open local web build, then refresh with data present | No blank page or module/runtime errors; AsyncStorage/IndexedDB data remains readable |
| [ ] | START-08 | P1 | Simulate local storage failure in a controlled developer fixture | Failure is observable; existing data is not silently reset or claimed saved |

### B Common editing and save lifecycle

Run EDIT-01 through EDIT-08 for **all four note types**, at Home and in a top-level folder; also test a subfolder while Pro is active.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | EDIT-01 | P0 | Create a note and immediately leave without changing anything | Untouched draft is removed before list focus reload; no ghost card |
| [ ] | EDIT-02 | P0 | Type unique content and leave in less than 800 ms using header Back and Android Back | Exit waits for latest local save; reopen shows latest content |
| [ ] | EDIT-03 | P0 | Type continuously, pause, leave and restart | Debounced local save persists latest title/body/data; no older snapshot wins |
| [ ] | EDIT-04 | P1 | Undo typing and structural changes, redo, then edit again | Correct snapshots restored and saved; new edit clears redo; history is session-local |
| [ ] | EDIT-05 | P0 | Edit then delete while autosave is pending | Deleted note does not reappear because a late timer saves it |
| [ ] | EDIT-06 | P1 | Keep title-only or otherwise meaningful draft; compare untouched default fields | Meaningful input persists; unchanged defaults alone do not keep an empty draft |
| [ ] | EDIT-07 | P1 | Type then switch app/tab; return and reopen | Record actual lifecycle behavior; completed/staged saves persist and no duplicate saves corrupt data |
| [ ] | EDIT-08 | P0 | Inject a save rejection; attempt to leave | No false success or silent loss; capture error and whether the draft remains recoverable |
| [ ] | EDIT-09 | P2 | Force-stop process before debounce, then after confirmed local persistence | Document the pre-save loss window; do not assume navigation flushing runs on OS kill. Completed saves survive |
| [ ] | EDIT-10 | P1 | Add local color, background or inline image to an otherwise empty draft with eligible plan | Presentation/media makes the draft meaningful; cleanup does not discard it |

### C Plain notes

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | PLAIN-01 | P1 | Open an existing long plain note | Starts in preview without keyboard or cursor forced to end; top is reachable normally |
| [ ] | PLAIN-02 | P1 | Double-tap near beginning/middle of preview text | Editing focuses the tapped text area; caret is not automatically forced to the document end |
| [ ] | PLAIN-03 | P1 | Create new plain note and single-tap body | Can edit immediately without double-tap; creation alone does not force keyboard |
| [ ] | PLAIN-04 | P1 | Type/paste at 49,999, 50,000 and beyond 50,000 | Maximum enforced with limit dialog; title is not counted; no save corruption |
| [ ] | PLAIN-05 | P0 | Open and leave an imported legacy body above 50,000 without editing | Existing content is not truncated merely by loading or leaving |
| [ ] | PLAIN-06 | P2 | Edit Unicode, multiline content, selections and long unbroken words | Layout, search and persistence remain usable; count behavior is recorded |

### D Checklists

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | CHECK-01 | P1 | Add/edit/check/uncheck/delete items, including empty item text | Ordered items and progress persist accurately |
| [ ] | CHECK-02 | P1 | Add 100 items, complete some, attempt item 101 | Completed items still count; maximum is 100 items present in the active list |
| [ ] | CHECK-03 | P1 | Delete an item from a 100-item list, then add one | Deleted item no longer counts; one new item is accepted |
| [ ] | CHECK-04 | P0 | Load legacy checklist above 100; leave untouched | No items removed; additions blocked until list count is below 100 |
| [ ] | CHECK-05 | P1 | Enter item text at 499, 500 and 501 characters | 500-character limit enforced without damaging other items |
| [ ] | CHECK-06 | P1 | Reorder, delete, undo and redo; reopen | IDs, order, completion and item count remain consistent |
| [ ] | CHECK-07 | P1 | Check item text and progress area while saving | Removed Saving/Saved text below progress stays absent; actual save still works |

### E Expense records and summaries

Use the expense oracle above and compare calculated values, not screenshots alone.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | EXP-01 | P0 | Enter the oracle rows and bills | Daily 17.50, grand total 65.29, unpaid remaining 100.00 |
| [ ] | EXP-02 | P1 | Edit day, remark, amount; add/delete/reorder rows | Correct row persists; totals recompute; row identity is not confused by reordering |
| [ ] | EXP-03 | P1 | Enter zero, decimal, empty, invalid and unusually large amount/day input | No NaN/Infinity/crash; accepted/rejected input matches validation; record negative-value policy rather than invent it |
| [ ] | EXP-04 | P1 | Type/paste remark 199/200/201, bill name 119/120/121 and summary 9,999/10,000/10,001 | Respective limits enforced; dialog explains limit; removed persistent counters/help do not reappear |
| [ ] | EXP-05 | P1 | Save Food category using egg/food/fish keywords | Case-insensitive match; a row matching multiple keywords counts once; category total 15.50 |
| [ ] | EXP-06 | P1 | Save same normalized category name again, edit keywords, then remove it | Updates existing category instead of duplicating; totals and matching transactions refresh |
| [ ] | EXP-07 | P1 | Open category actions and View transactions | Header reads category with amount beside it in parentheses; matching rows only; no redundant description/transactions heading/Back to actions button |
| [ ] | EXP-08 | P1 | Export category transactions | Current device month/year appears automatically in preview/output/filename; no month/year inputs; total beside category name, not repeated below listing |
| [ ] | EXP-09 | P1 | Check/uncheck bill, edit due day, collapse/expand and reset paid state | Paid progress and totals update; reset changes paid status without losing bill definitions |
| [ ] | EXP-10 | P1 | Save commitment template; apply to an empty expense record | Fresh IDs, all unpaid; template is device-local; nonempty records are not accidentally overwritten |
| [ ] | EXP-11 | P1 | Open expense record at narrow phone width, grid/card views and with keyboard shown | Table header/body columns align; drag handle is contained; no horizontal layout escape or clipped amount controls |
| [ ] | EXP-12 | P1 | Open daily expense deletion confirmation | Title uses Delete daily expense; confirm removes only intended row; cancel changes nothing |
| [ ] | EXP-13 | P1 | Open/scroll large expense fixture and rapidly edit rows | Responsive enough for agreed device budget; no full-list jumps, wrong-row edits or data loss |
| [ ] | EXP-14 | P1 | View expense card at Home, folder and search after edits | Grand total uses daily plus paid bills, with that note's currency |
| [ ] | EXP-15 | P2 | Save category with no matches, overlap categories and duplicate-name variants | No-match totals/empty state clear; overlap does not change grand total; normalized names consistent |

### F Expense currency

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | CUR-01 | P1 | Clean install, create first expense note | Default USD displayed as $; old RM is not forced |
| [ ] | CUR-02 | P1 | Search Settings currency by code/name; browse full selector | Supported Currency & Funds catalog is searchable, not just a short common-currency list; baseline has 178 entries |
| [ ] | CUR-03 | P0 | Change Settings currency and decline applying to existing notes | Future expense notes use new code; old notes and amounts remain unchanged |
| [ ] | CUR-04 | P0 | Accept applying to existing private/owned notes | Active eligible records get currency metadata only; no exchange-rate conversion; incoming shared caches excluded |
| [ ] | CUR-05 | P1 | Tap amount-column header and choose another currency | Only current note changes; headers/totals/cards/summaries/export all use its saved code |
| [ ] | CUR-06 | P1 | Restart and sync/export/import currency-bearing records | Per-note code persists; device default remains a local preference |
| [ ] | CUR-07 | P1 | Load missing/unsupported legacy currency code | Safe USD/$ fallback without breaking existing numeric amounts |
| [ ] | CUR-08 | P0 | Bulk change with read-only subfolder expense notes and one controlled save failure | Restricted records are skipped and reported; eligible records update; actual failures distinguished from skips |

### G Reminders

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | REM-01 | P1 | Open existing reminder and double-tap description | Preview scroll does not open keyboard; edit activation works |
| [ ] | REM-02 | P1 | Enter description at 4,999/5,000/5,001; open legacy longer body untouched | Limit enforced for editing; untouched legacy data preserved |
| [ ] | REM-03 | P1 | Schedule one-time, daily, weekly and monthly reminders on native | Correct saved settings and expected local delivery; test foreground/background and closed app |
| [ ] | REM-04 | P1 | Deny notification permission, then grant in OS settings | Clear failure, no false enabled schedule; retry works after grant |
| [ ] | REM-05 | P0 | Disable/delete reminder or containing folder | Corresponding native registrations cancelled; deleted note does not notify later |
| [ ] | REM-06 | P0 | Tap notification for locked/unlocked note | Correct note opens; locked note requires its gate; notification text does not expose locked body |
| [ ] | REM-07 | P1 | Sync/import reminder to another device | Body/schedule portable; notification ID never reused; imported/remote registrations do not silently enable delivery |
| [ ] | REM-08 | P2 | Test timezone change, month-end due date and daylight saving where relevant | Record actual delivery vs intended calendar policy; no crash or silent wrong-note navigation |
| [ ] | REM-09 | P1 | Open reminder on web | Settings/content view and export work; native notification scheduling is not falsely advertised as available |

### H Home folders search and navigation

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | NAV-01 | P1 | Create/rename/open top-level folder; add root and folder notes | Root stays `folder_id = null`; counts include visible descendant notes and exclude soft-deleted records |
| [ ] | NAV-02 | P1 | Pro: create one subfolder; attempt a third folder level or a cycle | Only Home → folder → subfolder allowed; invalid move creates no partial change |
| [ ] | NAV-03 | P1 | Tap Home and parent-name breadcrumb from child; use Back | Each returns to correct destination; parent breadcrumb is responsive |
| [ ] | NAV-04 | P1 | Open a subfolder | No Folders section; Notes view/add controls remain usable when allowed |
| [ ] | NAV-05 | P1 | Change Folder List/Strip and Note List/Grid independently | Home, search, folder and subfolder reflect applicable saved preferences; choices survive restart |
| [ ] | NAV-06 | P1 | Load former combined view preference fixture | Grid migrates to folder strip and note grid; invalid/missing values safely use list |
| [ ] | NAV-07 | P1 | Inspect grid on small/large screens and both themes | Note outer edges align with section/folder content; even column spacing; selected view buttons have rounded corners |
| [ ] | NAV-08 | P1 | Pin notes/folders; search by title/content/checklist text | Pinned items first; results reflect current content; archived/deleted/incoming caches excluded |
| [ ] | NAV-09 | P0 | Search for locked item and open result | Password gate retained; preview must not reveal protected content unexpectedly |
| [ ] | NAV-10 | P1 | Move root note to folder, folder to root, child note to parent/root | Correct relationships and counts; no duplicated or lost note |
| [ ] | NAV-11 | P1 | Pro: move folder under parent then move it back to Home | Whole valid subtree preserved; no invalid extra level or cycle |
| [ ] | NAV-12 | P2 | Native long-press vs web three-dot actions, empty states and pull-to-refresh | Correct controls per platform; focus/refresh reloads without stale cards |

### I Locks passwords and recovery

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | LOCK-01 | P0 | With no LockNote credential, use first Lock action | Prompts to establish shared local password; matching confirmation/minimum validation; no Recovery PIN shortcut |
| [ ] | LOCK-02 | P0 | Lock two different note types; open using correct/wrong password | Both use same shared password; wrong password gives no access |
| [ ] | LOCK-03 | P0 | Use Unlock and Delete on locked notes from lists and editor | Current shared password required; cancel/wrong password changes nothing; labels Lock/Unlock concise |
| [ ] | LOCK-04 | P0 | Change Password using wrong old, mismatch new, then valid fields | Invalid attempts preserve old hashes; valid change updates all active locked-note hashes |
| [ ] | LOCK-05 | P0 | Change Supabase account password separately | Local LockNote credential does not change even if chosen text was originally identical |
| [ ] | LOCK-06 | P0 | Bind LockNote recovery to account A; request and follow email link | One-time link intent verifies exact bound account before replacing local hashes |
| [ ] | LOCK-07 | P0 | Attempt reset with account B, expired/reused link or unrelated callback | No unauthorized replacement or note unlock; clear error |
| [ ] | LOCK-08 | P1 | Set password while signed out; then attempt Forgot Password | Explains missing recovery binding; no ability to claim arbitrary email and bypass gate |
| [ ] | LOCK-09 | P0 | Open legacy per-note credential fixture | Proven legacy password works and migration follows existing policy; old data not made inaccessible |
| [ ] | LOCK-10 | P0 | Lock folder with individual password; open/delete/move via available routes | Folder gate stays independent; no new breadcrumb/move route bypasses authorization |
| [ ] | LOCK-11 | P1 | Request signup/account reset/LockNote reset twice within 120 seconds; restart | Per-normalized-address cooldown persists and applies across email intents |
| [ ] | LOCK-12 | P0 | Developer inspect persisted records and request payloads | No plaintext passwords stored/compared; hash access gating accurately described, never encryption |

### J Dialogs keyboard and accessibility

Repeat DLG-01/02 for password setup/unlock, folder actions, delete confirmation, category actions, transactions, currency, reminder schedule and export dialogs with inputs where present.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | DLG-01 | P1 | Show dialog, focus input, show keyboard, hide keyboard, repeat | Dim backdrop continues covering full application surface; no gap, shifted layer or stuck keyboard |
| [ ] | DLG-02 | P1 | Compare light/dark themes and stacked confirmation dialogs | Common backdrop opacity 0.5 black; dialog remains legible; correct top dialog receives touches |
| [ ] | DLG-03 | P1 | Dismiss with buttons, Android Back and outside tap where supported | Cancel has no destructive effects; focus restored; no accidental touch-through |
| [ ] | DLG-04 | P1 | Large text, TalkBack/VoiceOver, web keyboard focus | Titles/actions announced, input labels clear, accessible buttons reachable, no clipped essential action |
| [ ] | DLG-05 | P1 | Review UI copy | Sign in standardized; export button descriptions, Changes save automatically and removed summary autosave text absent |
| [ ] | DLG-06 | P2 | Change system theme with dialog open; rotate where supported | Theme updates safely; no stale overlay or controls outside viewport |

### K Drag and drop

Run on checklist items, daily expense rows and monthly commitments. Run corresponding image rearrangement checks separately for eligible plain notes.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | DRAG-01 | P1 | Start drag from middle and move finger within viewport center | No sudden scroll to last row; intended item follows gesture |
| [ ] | DRAG-02 | P1 | Hold near actual list viewport top/bottom edges | Short edge hold then capped progressive scrolling in correct direction; not based on finger vs row center |
| [ ] | DRAG-03 | P1 | While scrolling down, move finger into center then top edge | Center stops scrolling; top reverses upward; item can move above original visible rows |
| [ ] | DRAG-04 | P1 | Drag first/last row, long wrapped row, collapsed section and keyboard-visible list | Bounds remain correct; no invalid index, jump or wrong-row reorder |
| [ ] | DRAG-05 | P0 | Hover Trash, cancel/drop, undo and reopen | Auto-scroll stops over Trash; only selected item removed on intended drop; persistence/undo correct |
| [ ] | DRAG-06 | P1 | Background app, navigate away or lose edit permission mid-drag | Drag/timers cancel; no late save or state corruption |
| [ ] | DRAG-07 | P2 | Repeat quick drags and scroll gestures without using handle | Normal scrolling not mistaken for reorder; no duplicate rows; accessible alternatives assessed |

### L Archive Trash and cleanup

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | LIFE-01 | P0 | Archive note and parent folder; search/Home/child navigation | Hidden from ordinary reads/search; available in Archive without deletion |
| [ ] | LIFE-02 | P0 | Restore archived parent containing an independently archived note | Folder contents return except individually archived note; flags preserved |
| [ ] | LIFE-03 | P0 | Delete parent containing child folders, locked/unlocked notes and reminders | Folder containers removed from normal navigation; all descendant notes go to Trash at root; notifications cancelled |
| [ ] | LIFE-04 | P0 | Restore deleted note with original folder present vs deleted | Original folder retained if valid, otherwise Home; tombstone cleared with newer update time |
| [ ] | LIFE-05 | P0 | Delete forever locked/unlocked note; cancel once | Locked path verifies password; confirm irreversible deletion; cancel preserves row/media |
| [ ] | LIFE-06 | P0 | Empty Trash containing locked notes | Only eligible unlocked notes removed; locked ones require individual confirmation |
| [ ] | LIFE-07 | P0 | Disposable fixture at 29 days and at/after 30 days; launch/open Trash | Expired local content purged; younger content preserved; sync tombstones remain to prevent resurrection |
| [ ] | LIFE-08 | P1 | Delete note containing managed attachments/background | Associated local files/Blobs cleaned according to deletion lifecycle; unrelated media retained |
| [ ] | LIFE-09 | P0 | Restore formerly shared deleted note | Returns as private note; obsolete sharing permissions not revived |

### M Media colors and custom backgrounds

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | MEDIA-01 | P1 | Set/change/remove color on four types; restart and change theme | Semantic palette persists locally and preserves readable contrast |
| [ ] | MEDIA-02 | P1 | Pro: choose/change/remove background on four types and note cards | Correct image shown with readable overlay; managed local copy survives picker origin changes |
| [ ] | MEDIA-03 | P1 | Select background at size boundary/corrupt image; deny/cancel picker | 10 MB rule enforced; cancellation leaves old background unchanged; failure clearly reported |
| [ ] | MEDIA-04 | P0 | Backup/sync/share note with color/background to another device | Local-only preference/image not uploaded or included in portable JSON; no foreign file URI appears |
| [ ] | MEDIA-05 | P1 | Pro: insert images at beginning/middle/end of plain body | Anchors preserve text/image order; text edits shift later anchors correctly |
| [ ] | MEDIA-06 | P1 | Insert 20 then attempt 21; select source around 5 MB | Per-note/source bounds enforced; accepted stored/uploaded JPEG strictly below 1 MB |
| [ ] | MEDIA-07 | P1 | Insert several images, drag between text/images and within image row | Wrapping and saved order correct; repeated reopen does not lose anchors |
| [ ] | MEDIA-08 | P1 | Resize image to allowed bounds then undo/redo | Ratio within 0.35–1; aspect ratio preserved; optimized file not repeatedly rewritten |
| [ ] | MEDIA-09 | P0 | Pro owner and Free invited editor add/reorder images; viewer tries | Owner-funded Pro access honored; viewer/server unauthorized mutation rejected |
| [ ] | MEDIA-10 | P0 | Lose internet during upload; reopen/retry, revoke membership during reservation | No unauthorized storage object; no duplicate attachment; reconciliation recovers eligible missing copies |
| [ ] | MEDIA-11 | P1 | Expire Pro with existing media | Existing images/backgrounds readable/downloadable; new paid actions blocked; allowed removal/recovery remains available |

### N PDF image and category export

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | OUT-01 | P1 | Plus/Pro: export each note type to PNG/PDF; open actual saved files | Current data, type-specific content and Unicode legible; no clipped last row/footer or missing image |
| [ ] | OUT-02 | P1 | Native Save as image and Save as PDF | PNG reaches Gallery; PDF reaches chosen Documents destination; success only after file saved |
| [ ] | OUT-03 | P1 | Cancel destination, deny gallery permission, then retry | No false success; app responsive; retry works without duplicate/empty file |
| [ ] | OUT-04 | P1 | Web export with popup restrictions and native optional Share action | Clear failure if blocked; PNG download and isolated print/PDF view work when permitted; no blank export |
| [ ] | OUT-05 | P1 | Export long text, 100 checklist items, large expense and inline images | Output complete/usable or clear documented limitation; verify final content, not just preview |
| [ ] | OUT-06 | P0 | Free: export ordinary note vs existing premium-content recovery note | Ordinary paid export gated; existing images/backgrounds/subfolder content eligible for recovery export |
| [ ] | OUT-07 | P1 | Category-only export using Food oracle | Only matching rows; Food (15.50 in note currency), automatic current month/year; no repeated bottom category total |

### O Portable JSON backup and restore

**Export Backup is intentionally hidden in Settings; the function remains.** BACK-01/02 need the developer service harness or an existing generated fixture. Do not require the tester to tap a nonexistent button or enable it in production just to test. Backup import is visible and Free. Binary inline images, custom backgrounds, colors and app preferences are not a complete portable backup.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | BACK-01 | P0 | Invoke backup export in developer harness with full fixture | Valid versioned JSON includes private/owned folders/notes, hashes, types, parent/root links, pin/archive and tombstones |
| [ ] | BACK-02 | P0 | Inspect JSON and export→import comparison | Incoming caches/account IDs/cloud membership IDs/media binaries excluded; no plaintext password; content plaintext clearly understood |
| [ ] | BACK-03 | P0 | Import valid file then cancel preview/confirmation | Counts shown before mutation; cancel leaves original data unchanged |
| [ ] | BACK-04 | P0 | Merge newer/older notes with same IDs and tombstones | Timestamp policy applied deterministically; no duplicate IDs or deleted-row resurrection; root links preserved |
| [ ] | BACK-05 | P0 | Replace after explicit confirmation | Private data replaced, Shared-with-me caches preserved; folder references valid; no unrelated data silently reset |
| [ ] | BACK-06 | P0 | Import v1 vs v2 with child folders | v1 folders at Home; v2 one-layer links preserved; folder data written before dependent notes |
| [ ] | BACK-07 | P0 | Try invalid JSON/version/types/IDs/dates/hashes/references/cycles/deep nesting | Rejected before destructive mutation; current data intact; useful error |
| [ ] | BACK-08 | P1 | Test size just below/at/above 25 MB and cancelled picker | Valid allowed-size data accepted; oversize rejected; cancellation changes nothing |
| [ ] | BACK-09 | P0 | Import locked notes, owned shared note and enabled reminder | Hash gate preserved; owned collaborative note becomes private; notification IDs stripped and reminders disabled |
| [ ] | BACK-10 | P0 | Inject write failure during Merge/Replace in disposable fixture | Capture consistency/recovery behavior; never report a successful restore with missing data; require recovery before approval |
| [ ] | BACK-11 | P0 | Free: import nested/media-metadata fixture after expiry | Import/recovery remains available; subfolder bodies read-only; excluded media not falsely promised restored |

### P Account and email callbacks

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | AUTH-01 | P1 | Register invalid/normalized email, short password and mismatched confirmation | Field errors before request; valid email trimmed/lowercased; account minimum 8 characters |
| [ ] | AUTH-02 | P0 | Register valid account with confirmation enabled; open email from closed/open app | Actual delivery; correct auth-confirm callback; account identity/session established |
| [ ] | AUTH-03 | P0 | Sign in with wrong then valid credentials; restart offline | Clear wrong-credential error; persisted valid session; private offline notes usable |
| [ ] | AUTH-04 | P0 | Forgot account password, follow one-time link, set confirmed new password | Correct reset-password intent; valid new password works; LockNote local credential unchanged |
| [ ] | AUTH-05 | P0 | Sign out A, sign in B, sign back in A | Cloud queries/status/entitlements scoped to active identity; no incoming caches or privileges exposed cross-account |
| [ ] | AUTH-06 | P1 | Network outage, expired link, rate limit and duplicate request | Human-readable error and correct cooldown; no crash or fake success |
| [ ] | AUTH-07 | P0 | Test native implicit-token and PKCE callback variants where configured | Correct intent/identity; malformed or unrelated URL cannot reset credentials |
| [ ] | AUTH-08 | P2 | Check hosted sender branding and email on another device | LockNote branding and safe redirects; cross-device recovery limitation documented, not assumed supported |

### Q Manual private sync

Use the same account on A and B. Test all note types and parent/root relationships. It is **manual** sync, not automatic/background sync.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | SYNC-01 | P0 | A Sync Notes; B Sync Notes; edit B and sync both | Two-way snapshots preserve title/type/content/locks/pin/archive/folder parents and root notes |
| [ ] | SYNC-02 | P0 | Edit same private note on A/B, then sync in opposite order with known timestamps | Client timestamp last-write-wins policy; no Git/character merge; result matches recorded ordering |
| [ ] | SYNC-03 | P0 | Delete on A, sync; B sync with stale active copy | Tombstone prevents resurrection; restore with newer timestamp propagates deliberately |
| [ ] | SYNC-04 | P0 | B has newer unsynced local change; cloud snapshot is older | Older cloud state does not silently overwrite newer local change |
| [ ] | SYNC-05 | P1 | Offline/timeout/repeated Sync taps, then retry online | Clear status/error; no duplicate concurrent sync or partial claimed success; last success scoped to account |
| [ ] | SYNC-06 | P0 | Expired account above Free quota runs Sync and explicit recovery | No-upload recovery works; newer local drafts preserved; message says local changes were not uploaded |
| [ ] | SYNC-07 | P0 | Unrelated user C queries private rows/RPCs through authenticated client | RLS denies others' data; anon unauthorized; service secrets never present in app |
| [ ] | SYNC-08 | P1 | Sync note with local colors/backgrounds and reminders | Colors/background binaries excluded; notification registration IDs/enabled state device-local |
| [ ] | SYNC-09 | P0 | Native↔web sync and importing child links | Matching object shapes and two-pass parent restore; no foreign-key or orphan-note failure |
| [ ] | SYNC-10 | P1 | Sync immediately after editor exit with pending text | Latest flushed local content sent; no older pending save later undoes synced content |

### R Shared notes permissions leases and conflicts

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | SHARE-01 | P0 | Plus owner A invites registered Free B as editor; change B to viewer | Correct Shared listing and role; Free invitee follows owner funding, not their own upgrade requirement |
| [ ] | SHARE-02 | P0 | Viewer B attempts title/content/checkbox/bill/currency/image mutations via UI and RPC | UI read-only; server rejects unauthorized writes |
| [ ] | SHARE-03 | P0 | A opens editing, B opens same note; then A leaves/backgrounds | One renewable 90-second lease; B sees editing holder/view-only until release/expiry; renewal about every 30 seconds |
| [ ] | SHARE-04 | P0 | Crash/lose connection on lease holder; wait for expiry | Lease eventually reusable without duplicate editing ownership |
| [ ] | SHARE-05 | P0 | Force stale revision save from B after A saves newer snapshot | Server rejects stale whole-note save; no silent last-save overwrite; clear conflict path |
| [ ] | SHARE-06 | P0 | Dirty pending local draft receives Realtime update | Unsaved snapshot not replaced; explicit latest/local resolution where permitted; no character merge claim |
| [ ] | SHARE-07 | P0 | Revoke B, downgrade role or expire owner plan during editing/save | Realtime/access refresh updates UI; server enforcement rejects later unauthorized writes |
| [ ] | SHARE-08 | P0 | Turn internet off with Shared tab or incoming editor open | No Shared-with-me notes shown offline; cached title/body not left visible through navigation/resume |
| [ ] | SHARE-09 | P0 | Owner plan expires; owner edits at root; B tries remote edit/invite | Owner local draft remains pending; remote edits/leases/new invitations pause; online existing reads allowed |
| [ ] | SHARE-10 | P0 | Renew owner plan with newer pending local draft | Reconciliation does not silently overwrite either version; permissions/leases resume safely |
| [ ] | SHARE-11 | P0 | C enumerates memberships, shared rows, images and share-email function | Access denied; no arbitrary account-email enumeration or owner impersonation |
| [ ] | SHARE-12 | P1 | Realtime reconnect, repeated open/close and list focus | Correct last-editor/collaborator metadata; no duplicate subscriptions or stale revoked note |

### S Premium purchases webhook quotas and identity

Live store tests run only on configured sandbox/store builds. Allow normal webhook delivery delay, measure it and retry according to provider behavior; never grant server access from a client flag.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | PAY-01 | P1 | Signed-out Subscribe/Restore; missing offering/key | Simple Sign in guidance or configuration error; no false entitlement |
| [ ] | PAY-02 | P0 | Sandbox new Plus then separate Pro purchase | Correct localized offering price; entitlement `plus`/`pro`; account UUID matches canonical server subscription |
| [ ] | PAY-03 | P0 | Cancel/pending/interrupt payment, close/restart app | No success claim or paid grant without verified entitlement; recovery/retry handles store state |
| [ ] | PAY-04 | P0 | Restore on second device using same account; try different account | Provider identity/transfer policy applied; no leaked local paid toggle or cross-account grant |
| [ ] | PAY-05 | P0 | Upgrade Plus→Pro early/late billing period; manage Pro→Plus | Store confirms actual charge/credit; Android replacement/Apple subscription group correct; app does not invent proration |
| [ ] | PAY-06 | P0 | Cancel renewal while paid period active, then expire | Access retained until paid/grace expiry, then Free; no note/folder/media deletion or automatic movement |
| [ ] | PAY-07 | P0 | Renewal failure with/without verified grace, refund and revocation | Canonical active/grace state respected; inactive retry alone does not grant paid access |
| [ ] | PAY-08 | P0 | Send missing/wrong webhook Authorization; client writes user_subscriptions | Webhook rejected; subscription table read-self/write-server-only; secret absent from bundle/log evidence |
| [ ] | PAY-09 | P0 | Duplicate/late/transfer event; upstream timeout then retry | Server refetches canonical subscriber; stale state cannot overwrite newer verified state; failure retried safely |
| [ ] | PAY-10 | P0 | Sandbox events against sandbox vs production configuration | Test environment allowed explicitly; production ignores sandbox grants by default |
| [ ] | PAY-11 | P0 | Free/Plus/Pro cloud usage around 25/75/750 MiB | Server quota includes UTF-8 JSON, actual images and reservations; wrong-plan growth rejected atomically |
| [ ] | PAY-12 | P0 | Concurrent cloud writes/uploads each individually fitting but combined over quota | Owner serialization prevents combined over-quota acceptance; rejection does not leave partial snapshot |
| [ ] | PAY-13 | P0 | Over-quota shrink/delete/recover after downgrade | Recovery and allowed shrinking work; expiry itself does not delete data; usage/limit display truthful |
| [ ] | PAY-14 | P1 | Offline expiry, foreground refresh, sign-out/in and unconfigured SDK device | Cached paid access expires; identity state cleared; valid server fallback used where configured |
| [ ] | PAY-15 | P1 | Open Privacy Policy/Terms and subscription management | Offline in-app legal copy readable; provider management opens correct destination; app/static legal text aligned |
| [ ] | PAY-16 | P0 | Stage migration rollout with existing paid subscribers | Backfill verified subscribers before enforcement release; older clients cannot bypass server gates |

### T Subfolder read-only downgrade policy

Repeat SUB-01 through SUB-07 for **plain, checklist, expense and reminder** notes. Test active Pro→Free expiry and Pro→Plus downgrade, including offline expiry.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | SUB-01 | P0 | Open existing child note without Pro | Visible, readable, correct explanation and Move note action; no body/title/content editing |
| [ ] | SUB-02 | P0 | Pro expires while typing/dragging/dialog editing | Further edits stop, keyboard/drag state ends; already staged Pro snapshot may finish saving |
| [ ] | SUB-03 | P0 | Immediately Back/Move after expiry with pre-expiry pending save | Final granted snapshot preserved, including inline anchors; no post-expiry new content accepted |
| [ ] | SUB-04 | P0 | Try checkbox, row/bill/category/currency, schedule and undo mutations | Content-changing controls and save paths blocked; readable presentation remains available |
| [ ] | SUB-05 | P0 | Move note to Home/top-level folder | Note retained with same data; editing resumes; root semantics correct |
| [ ] | SUB-06 | P0 | Move whole subfolder back to Home | Folder becomes top-level with notes preserved and editable; nothing moves automatically on expiry |
| [ ] | SUB-07 | P0 | Renew verified Pro and reopen/current editor refresh | Editing resumes without duplicate notes or resetting content |
| [ ] | SUB-08 | P0 | Free/Plus create note or move note into existing subfolder, including direct service call | Gate enforced before mutation; destination disabled/marked Pro; no orphan draft |
| [ ] | SUB-09 | P0 | Export/import/manual recovery of nested data while Free | Recovery remains available; restored child notes still read-only; no destructive flattening |
| [ ] | SUB-10 | P0 | Free invited editor of paid owner's shared note | Collaboration role and owner plan determine access; invitee's unrelated local nesting plan does not block granted shared editing |
| [ ] | SUB-11 | P0 | Bulk currency apply and pending owned shared save inside expired subfolder | Restricted records skipped; no bypass through bulk action/local conflict resolution; pre-expiry grant applies only exact staged snapshot |

### U Force update and deployment readiness

Use a dedicated test backend. Never raise production minimum build solely to test.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | REL-01 | P0 | Native build below/at/above minimum with kill switch on/off | Blocks only below-minimum plus enabled force policy; platform build numbers, not version string alone |
| [ ] | REL-02 | P0 | Cached policy offline within/after 72 hours; missing/invalid server row | Valid unexpired forced cache respected; expired/missing/error fails open; platform caches separated |
| [ ] | REL-03 | P1 | Open update destination and resume after update | Correct platform destination; new acceptable build can access notes; data preserved |
| [ ] | REL-04 | P1 | Web/Expo Go update-policy check | Intentionally unblocked; no unsupported native build comparison |
| [ ] | REL-05 | P0 | Install exact signed candidate without Metro and run smoke suite | App launches standalone; public configuration correct; no secret/service key bundled |
| [ ] | REL-06 | P1 | Verify icon/name, version/build, package, offline legal copy and support details | Correct LockNote identity and release metadata; placeholder operator/legal text resolved before publication |

### V Performance accessibility and compatibility

Targets below are **proposed acceptance budgets**, not existing measured guarantees. Owner/developer should approve them against the lowest supported release device and record any exception before sign-off.

| Done | ID | Priority | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | QUAL-01 | P1 | Cold launch offline and online, at least 5 runs on release build | Proposed usable Home within 3 seconds; no endless spinner; record each run, median and worst |
| [ ] | QUAL-02 | P1 | Open near-limit plain/checklist/reminder and representative large expense, 10 runs | Proposed editable/readable note within 1 second warmed, 2 seconds cold; no sudden material regression vs baseline |
| [ ] | QUAL-03 | P1 | Scroll/type/drag large notes; 20 open/close cycles | No sustained freezes, increasing memory/listeners, misplaced cursor or crash; compare release-build profiling |
| [ ] | QUAL-04 | P1 | Low storage and media/restore failure; recover free space | No silent data reset; clear failure/retry; persisted content remains intact |
| [ ] | QUAL-05 | P1 | Small/large Android, oldest supported available OS and current OS; iOS before release | No clipped essential controls, grid/table drift or keyboard coverage; record untested device gaps |
| [ ] | QUAL-06 | P1 | Light/dark/system, large text, screen reader and reduced motion | Readable content and controls; labels/reading order accurate; essential tasks achievable |
| [ ] | QUAL-07 | P1 | Web normal/narrow widths, refresh, downloads and IndexedDB unavailable/restricted | No blank app; storage/permission limitations explained; native/web behavior differences explicit |
| [ ] | QUAL-08 | P2 | Explore rapid taps, unusual text, repeated cancel/retry, connectivity flaps for 30 minutes | Record new defects with reproducible steps; do not count exploration alone as all cases passed |

## 5 Future functionality excluded from current release claims

Automatic/background sync is **not implemented**. These are design acceptance cases for its future implementation, not current failures or boxes to mark passed. Do not advertise it as working because manual sync passes.

| Future ID | Acceptance requirement |
| --- | --- |
| FUT-SYNC-01 | Launch/session restoration/resume/connectivity recovery trigger serialized foreground sync only for eligible plans |
| FUT-SYNC-02 | Manual/automatic runs and pending 800 ms editor saves cannot race or upload stale snapshots |
| FUT-SYNC-03 | Offline retries queued with bounded backoff; duplicate runs deduplicated and status truthful |
| FUT-SYNC-04 | OS background execution best-effort; no guarantee of an exact schedule; permissions/battery restrictions tested |
| FUT-SYNC-05 | Newer local content protected on recovery, restart, cancellation and subscription expiry |
| FUT-SYNC-06 | Account switch clears account-specific queues and prevents cross-account uploads |

Cloud storage for custom note backgrounds is also planned, not current behavior. Revisit MEDIA-04 only after that feature is explicitly implemented and its privacy/backup policy approved.

## 6 How much to run after a change

| Change | Minimum additional targeted regression |
| --- | --- |
| Copy-only | Changed dialog plus light/dark/large-text check; affected action still works |
| Layout/dialog | NAV-07, EXP-11, DLG suite on phone; keyboard show/hide and narrow screen |
| Editor/save/limits | EDIT suite on affected types, boundary/legacy cases, Undo/Redo and pending exit |
| Drag | DRAG suite, reorder save/undo, permission-loss cleanup and screen bounds |
| Repository/migration | Native/web parity, START-05, root/deletion/archive/nesting, backup and sync |
| Locks/auth | LOCK/AUTH applicable suites, wrong identity, links, cooldown and no plaintext credential |
| Cloud/shared/premium | Backend fixture when affected, deployed sandbox RLS/quotas/roles/webhook and two-session tests |
| Release | Complete automated suite, release-build smoke, all P0/P1 applicable cases and declared P2/device gaps |

This is testing guidance, not a change to the commented testing instruction in `AGENTS.md`. Document authorship does not enable an automatic test-after-every-task policy.

### Every-candidate smoke suite

Run on the exact installed release candidate, first offline and then online: START-01/02 or clean/upgrade equivalents; EDIT-01/02 for all four types; EXP-01; NAV-03/05/07; LOCK-02/03; DLG-01; DRAG-01/03; BACK-03/04 on disposable data; AUTH-03; SYNC-01; SHARE-01/03/08; PAY-02/06; SUB-01/03/05; REL-05. Service-dependent cases Blocked are not a green release result for an advertised service.

## 7 Evidence and defect reporting

Keep a result row per case and environment. Status values: **Not run**, **Pass**, **Fail**, **Blocked**, **Not applicable**. Blocked means an unmet prerequisite; attach the missing configuration/device. Not applicable requires a reason and owner approval where release scope is affected. A test passes only if the expected result and persistence check were observed on the recorded build.

| Severity | Example | Release rule |
| --- | --- | --- |
| S0 critical | Data loss, account isolation breach, unauthorized credential reset, payment without recoverable entitlement | Stop release; reproduce and fix |
| S1 major | Endless launch, latest edit lost on normal Back, broken core sync/restore, wrong shared write permission | Block release for affected scope |
| S2 moderate | Usable workflow with meaningful workaround, noncritical layout/interaction error | Owner may accept documented exception |
| S3 minor | Copy/spacing polish with no loss of function | Schedule fix; record exception |

Priority is test execution urgency; severity describes the discovered defect. Retest the exact failing steps on the fixed build, then run adjacent regressions. Do not mark old-build evidence as proof for a new build after a related change.

### Copyable run record

```text
Run ID / date / tester:
Git commit / dirty changes / app version / native build:
Device / OS / installation mode clean or upgrade:
Backend migration / sandbox project / RevenueCat environment:
Account alias / effective plan / network / theme / accessibility mode:
Case ID / variant:
Status: Not run | Pass | Fail | Blocked | Not applicable
Actual result:
Persistence check after reopen/restart:
Evidence path / log / timestamp:
Defect ID or reason blocked/not applicable:
Retest build / date / result:
```

### Copyable bug report

```text
Bug ID / short title / severity / related test IDs:
Build / device / account aliases / effective plans:
Prerequisites and exact fixture:
Numbered reproduction steps:
Expected result:
Actual result:
Reproduction frequency e.g. 3 of 5:
Data impact / workaround:
Redacted screenshot or video / logs / timestamps:
Developer fix reference:
Tester retest result and neighboring regression results:
```

## 8 Release decision checklist

- [ ] Complete automated suite passes on the candidate commit; logs and exit code retained.
- [ ] Native/web signatures **and** task-related return shapes/semantics checked when repositories change.
- [ ] Exact standalone Android candidate passes clean-install and preserved-data upgrade smoke.
- [ ] All applicable P0/P1 cases executed; no open S0/S1 defect; exceptions explicitly accepted by owner.
- [ ] Two-device private sync and two-account shared-note tests pass against deployed sandbox backend if advertised.
- [ ] Actual sandbox purchase, restore, expiry, webhook, owner funding and quota checks pass if paid services are advertised.
- [ ] Pro subfolder read-only policy tested on all four editors including pending save and Move note.
- [ ] Actual exported files and backup-restored data opened and checked, not merely a success message.
- [ ] Production setup separately reviewed: migrations, verified subscriber backfill, RLS, Storage, email redirects/SMTP, webhook secrets and public/legal details. Test success does not deploy these.
- [ ] iOS-specific cases and device testing completed before an iOS release; web regression status documented.
- [ ] Remaining Blocked/Not run/Not applicable cases and performance/device gaps attached to sign-off.
- [ ] User-facing promises match implemented features; no automatic/background sync claim.

Sign-off record: candidate build, evidence directory, Pass/Fail/Blocked/Not run totals, open defects and accepted exceptions, developer name/date, tester name/date, project owner release decision/date.

## 9 Source references and maintenance

- [Architecture](../ARCHITECTURE.md)
- [Project state](../PROJECT_STATE.md)
- [Subscription policy](../decisions/SUBSCRIPTION_PLANS.md)
- [Subscription setup](../decisions/SUBSCRIPTION_SETUP.md)
- [Character limits](../decisions/NOTE_LIMITS.md) and `src/utils/note-limits.mjs`
- [Android local build instructions](../1_MY_DEV_NOTE.md)
- [Expo SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/)

If older prose conflicts with an approved feature change, confirm the current UI/source and product decision before testing. For example, older expense-limit prose still describes counters removed by request; this plan expects limit dialogs without that removed helper text. Record discrepancies rather than changing app behavior to satisfy stale documentation. Update this plan and Word guide when approved feature boundaries change; keep stable IDs for regression history.
