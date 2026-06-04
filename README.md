# LockNote

A secure note-taking app with folder organization and password protection.

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to SQL Editor and run the schema from `src/config/schema.sql`
4. Go to Settings > API and copy:
   - Project URL
   - Anon/Public Key

### 2. Configure Environment

Open `src/config/supabase.js` and replace:
- `YOUR_SUPABASE_URL` with your project URL
- `YOUR_SUPABASE_ANON_KEY` with your anon key

### 3. Run the App

```bash
# Install dependencies
npm install

# Start the app
npm start
```

## Database Schema

### Tables

**folders**
- id (UUID, primary key)
- user_id (UUID, foreign key to auth.users)
- name (TEXT)
- password_hash (TEXT, nullable)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**notes**
- id (UUID, primary key)
- user_id (UUID, foreign key to auth.users)
- folder_id (UUID, foreign key to folders, nullable)
- title (TEXT)
- content (TEXT)
- password_hash (TEXT, nullable)
- is_pinned (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

## Features

- Anonymous authentication
- Create/edit/delete folders
- Create/edit/delete notes
- Password protection for folders and notes
- Pull-to-refresh
- Clean, minimal UI

## Project Structure

```
src/
├── config/
│   ├── supabase.js      # Supabase client configuration
│   └── schema.sql       # Database schema
├── contexts/
│   └── AuthContext.js    # Authentication state management
├── navigation/
│   └── AppNavigator.js  # Navigation setup
├── screens/
│   ├── HomeScreen.js    # Main screen with folders and root notes
│   ├── FolderScreen.js  # Notes inside a folder
│   ├── NoteEditorScreen.js  # Create/edit notes
│   └── SettingsScreen.js    # App settings
├── components/
│   ├── FolderItem.js    # Folder list item
│   ├── NoteItem.js      # Note list item
│   └── PasswordModal.js # Password verification modal
├── services/
│   └── api.js           # Supabase API operations
└── utils/
    └── crypto.js        # Password hashing utilities
```
