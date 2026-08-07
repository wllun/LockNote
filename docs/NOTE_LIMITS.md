# Note Character Limits

## Normal notes

| Field | Limit |
| --- | ---: |
| Note body | 100,000 characters |

The limit applies to the editable body of a normal plaintext note. The title is
separate and is not included in the body count.

The editor displays the current count as `used / 100,000` and changes the
counter to the warning color after 90,000 characters. React Native's
`TextInput.maxLength` prevents typing or pasting beyond 100,000 characters on
Android, iOS, and web.

Notes created before this limit was introduced are not truncated when loaded.
If an existing note already exceeds the limit, its stored content remains
unchanged until the user edits it.

## Storage context

Before this application-level limit was added, LockNote did not cap normal note
content. Native notes use SQLite `TEXT`, whose storage ceiling is much larger
than a practical mobile editor should accept, while web notes use AsyncStorage.
The 100,000-character rule is therefore a product and performance limit rather
than the underlying database maximum.
