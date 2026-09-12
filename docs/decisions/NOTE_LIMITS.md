# Note Character Limits

## Plain notes

| Field | Limit |
| --- | ---: |
| Note body | 50,000 characters |
| Inline images | 20 per note |
| Selected source image | 5 MB maximum |
| Stored or uploaded image | Strictly below 1 MB after optimization |

The character limit applies to the editable body of a plain note. The title is
separate and is not included in the body count.

Images are inserted at the current text cursor and stored separately from the
plain-text body, so they do not count toward the 50,000-character limit. Each
accepted image is converted to JPEG and resized/compressed locally before it is
saved.

The editor shows a `Character limit reached` dialog at the maximum. React
Native's `TextInput.maxLength` prevents typing or pasting beyond 50,000
characters on Android, iOS, and web.

Notes created before this limit was introduced are not truncated when loaded.
If an existing note already exceeds the limit, its stored content remains
unchanged until the user edits it.

## Checklist notes

| Field | Limit |
| --- | ---: |
| Checklist item | 500 characters per item |
| Active checklist size | 100 items |

The checklist editor enforces the per-item text limit on new and existing
items. A checklist stops accepting new items when it contains 100 items,
including completed items that remain in the list. Existing checklists created
under the former 500-item limit are preserved without truncation, but cannot
accept another item until their item count is below 100.

## Reminder notes

| Field | Limit |
| --- | ---: |
| Reminder description | 5,000 characters |

The reminder editor shows a `Character limit reached` dialog at the maximum.
Existing longer reminder descriptions remain unchanged until edited.

## Expense Records

| Field | Limit |
| --- | ---: |
| Expense-row remark | 200 characters per row |
| Monthly commitment name | 120 characters |
| Monthly summary note | 10,000 characters |

The expense editor always explains the per-row remark limit and shows a live
counter while a remark is focused. The commitment form displays its limit next
to the bill-name label. Monthly summary notes show a live count, remaining-count
warning near the limit, and a limit-reached message. These limits are enforced
with `TextInput.maxLength` on Android, iOS, and web.

## Storage context

Before this application-level limit was added, LockNote did not cap plain-note
content. Native notes use SQLite `TEXT`, whose storage ceiling is much larger
than a practical mobile editor should accept, while web notes use AsyncStorage.
The 50,000-character rule is therefore a product and performance limit rather
than the underlying database maximum.
