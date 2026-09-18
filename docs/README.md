# LockNote documentation index

Updated: 2026-09-19. App 1.1.0 uses Expo SDK 54 / React Native 0.81. Android is the initial distribution target; iOS/web code and repository parity remain supported. Documentation distinguishes source implementation from deployment and observed test results.

## Start here

- [Project README](../README.md): features, runtime requirements and quick start.
- [Architecture](ARCHITECTURE.md): local storage, services, security boundaries and sync.
- [Project state](PROJECT_STATE.md): implementation inventory and live-verification gaps.
- [Roadmap](ROADMAP.md): delivery priorities and remaining product work.
- [Setup and cleanup TODO](../TODO.md): environment/backend setup and parked Git housekeeping.
- [Shared AI guidance](../AGENTS.md): project conventions; `CLAUDE.md` points to the same rules.

## Run and build

- [Physical Android device](COMMAND_RUN_APK.md): debug, standalone APK and compatible Expo Go.
- [Android virtual device](COMMAND_RUN_AVD.md): debug, emulator ABI and Expo Go.
- [Short-directory Windows build](1_MY_DEV_NOTE.md): copy current source before prebuild/Gradle.
- [Automatic/background sync](BACKGROUND_SYNC.md): opt-in, native rebuild and OS scheduling limits.

## Backend, plans and release

- [Supabase setup](../supabase-setup.md) and [backend README](../supabase/README.md): hosted setup versus source migrations.
- [Subscription policy](decisions/SUBSCRIPTION_PLANS.md) and [RevenueCat setup](decisions/SUBSCRIPTION_SETUP.md): monthly checkout, server verification, quotas and expiry.
- [Forced updates](../FORCE_UPDATE.md): replacement-build availability, signing and rollback.
- [Deployment plan](../deployment-planning.md): staged mobile rollout and production acceptance.
- [Mobile low-budget plan](decisions/MOBILE_LOW_BUDGET.md): dated official service pricing/limits, not a mandatory paid-service requirement.
- [Legal-page publishing](legal/README.md): public static pages are separate from deploying the web app; finalize operator/support details first.

## Design, learning and tests

- [Text/media limits](decisions/NOTE_LIMITS.md) and [monthly commitments](decisions/MONTHLY_EXPENSE_CHECKLIST.md).
- [Learning React Native](tutorials/LEARNING_REACT_NATIVE.md): trace actual repository paths.
- [Full test plan](testing/TEST_PLAN.md): automated checks plus installed-device/backend cases; unchecked cases mean Not run.
- [Editable diagrams](diagrams/README.md): database ERD and application overview with regeneration/validation commands.

## Maintenance rules

Keep canonical Markdown authoritative over older Word/PDF companions until those are separately regenerated. Tests, migration source, diagrams and shared AI rules are intentional tracked files; secrets, real data exports, caches and build binaries are not. Follow the [reviewed cleanup checklist](../TODO.md#7-parked-clean-up-files-included-in-git-commits) before deleting or untracking anything. Bundled third-party skill documentation retains its upstream instructions/license notices and is not rewritten during project-status updates.
