/* Regenerate the editable diagrams from repository DDL using the draw.io skill SQL parser.
 * Run: node scripts/generate-project-diagrams.cjs
 * No connection to the hosted database is made.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'diagrams');
const skill = path.join(root, '.agents', 'skills', 'drawio-skill', 'scripts');
const nativeSource = fs.readFileSync(path.join(root, 'src/db/sqlite.js'), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(x => x.endsWith('.sql')).sort();
const cloudSource = migrations.map(x => fs.readFileSync(path.join(root, 'supabase/migrations', x), 'utf8')).join('\n');
const parse = source => JSON.parse(execFileSync('python', ['-c',
  'import sys,json;sys.path.insert(0,sys.argv[1]);from sqlerd import parse_tables;print(json.dumps(parse_tables(sys.stdin.read()),default=list))',
  skill], { input: source, encoding: 'utf8' }));
const local = parse(nativeSource);
const cloud = parse(cloudSource);
// CREATE TABLE is the starting schema; guarded ALTERs supply the final fields.
const append = (tables, name, col, type, ref) => {
  if (!tables[name].columns.some(x => x[0] === col)) tables[name].columns.push([col, type]);
  if (ref && !tables[name].fks.some(x => x[0] === col && x[1] === ref)) tables[name].fks.push([col, ref]);
};
const collaboration = nativeSource.match(/const collaborationColumns = \[([\s\S]*?)\n  \];/)[1];
for (const m of collaboration.matchAll(/\['([^']+)',\s*["'](TEXT|INTEGER)/g)) append(local, 'notes', m[1], m[2]);
for (const m of cloudSource.matchAll(/alter table public\.(\w+)\s+add column if not exists (\w+)\s+(\w+)([\s\S]*?);/gi)) {
  append(cloud, m[1], m[2], m[3], m[4].match(/references public\.(\w+)/i)?.[1]);
}
cloud.users = { columns: [['id', 'uuid'], ['email', 'text']], pks: ['id'], fks: [], schema: 'auth' };
const esc = x => String(x).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const colors = { blue: ['#dae8fc', '#6c8ebf'], green: ['#d5e8d4', '#82b366'], purple: ['#e1d5e7', '#9673a6'], orange: ['#ffe6cc', '#d79b00'], grey: ['#f5f5f5', '#666666'], yellow: ['#fff2cc', '#d6b656'] };
const pages = [];
let cells;
const geo = (x,y,w,h) => `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`;
function start(name, subtitle) {
  cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  box('title', name, 40, 20, 1660, 50, 'grey', 'text;align=left;fontSize=26;fontStyle=1;');
  box('subtitle', subtitle, 40, 80, 1660, 60, 'grey', 'text;align=left;fontSize=14;');
}
function box(id, label, x,y,w,h, color='blue', extra='', parent='1', provenance='') {
  const [fill,stroke] = colors[color];
  cells.push(`<mxCell id="${id}" value="${esc(label)}" vertex="1" parent="${parent}" data-model-id="${id}" data-source-path="${esc(provenance)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};fontFamily=Helvetica;fontSize=14;spacing=12;${extra}">${geo(x,y,w,h)}</mxCell>`);
}
function table(tables, id, x,y, color, source, constraints='') {
  const t = tables[id], width = 410;
  const height = 40 + t.columns.length * 20 + (constraints ? 60 : 0);
  const [fill,stroke] = colors[color];
  cells.push(`<mxCell id="${id}" value="${esc((t.schema ? t.schema + '.' : '') + id)}" vertex="1" parent="1" data-model-id="${id}" data-source-path="${esc(source)}" style="swimlane;startSize=40;container=1;collapsible=0;html=1;whiteSpace=wrap;fillColor=${fill};swimlaneFillColor=#ffffff;strokeColor=${stroke};fontFamily=Helvetica;fontSize=16;fontStyle=1;">${geo(x,y,width,height)}</mxCell>`);
  const fk = new Set(t.fks.map(x => x[0]));
  t.columns.forEach(([col,type], i) => {
    const mark = [t.pks.includes(col) ? 'PK' : '', fk.has(col) ? 'FK' : ''].filter(Boolean).join('/');
    cells.push(`<mxCell id="${id}.${col}" value="${esc(`${mark ? mark + '  ' : '      '}${col}: ${type}`)}" vertex="1" parent="${id}" style="text;html=1;align=left;verticalAlign=middle;spacingLeft=12;fontFamily=Helvetica;fontSize=12;${mark ? 'fontStyle=1;' : ''}">${geo(0,40+i*20,width,20)}</mxCell>`);
  });
  if (constraints) box(`${id}.constraints`, constraints, 0,40+t.columns.length*20,width,60, color, 'rounded=0;strokeColor=none;align=left;fontSize=11;spacing=10;', id);
  return height;
}
function edge(id, source,target,label, opts={}) {
  const { logical=false, er=false, one=false, optional=false, exit=[1,.5], entry=[0,.5], points=[] } = opts;
  const arrows = er ? `startArrow=ERone;endArrow=${one ? 'ERzeroToOne' : 'ERzeroToMany'};startFill=0;endFill=0;` : 'endArrow=classic;endFill=1;';
  cells.push(`<mxCell id="${id}" source="${source}" target="${target}" value="${esc(label)}" edge="1" parent="1" data-model-id="${id}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;${arrows}fontSize=11;fontFamily=Helvetica;labelBackgroundColor=#ffffff;strokeColor=${logical ? '#9673a6' : '#666666'};${logical || optional ? 'dashed=1;' : ''}exitX=${exit[0]};exitY=${exit[1]};entryX=${entry[0]};entryY=${entry[1]};"><mxGeometry relative="1" as="geometry">${points.length ? '<Array as="points">' + points.map(([x,y]) => `<mxPoint x="${x}" y="${y}"/>`).join('') + '</Array>' : ''}</mxGeometry></mxCell>`);
}
function finish(id, name) {
  pages.push(`<diagram id="${id}" name="${esc(name)}"><mxGraphModel grid="1" gridSize="10" page="0" background="#ffffff"><root>${cells.join('\n')}</root></mxGraphModel></diagram>`);
}
function write(file) {
  fs.mkdirSync(out, {recursive:true});
  fs.writeFileSync(path.join(out,file), `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="drawio" version="26.0.0">${pages.join('\n')}</mxfile>\n`);
  pages.length = 0;
}

start('LockNote database | Native device storage', 'Repository schema snapshot: 2026-09-19. Native: SQLite locknote.db. Web: identical record shapes in AsyncStorage; image records/files in IndexedDB.');
table(local,'folders',40,170,'green','src/db/sqlite.js','parent_id nullable; root folder = NULL\nNew DB self-FK; legacy guarded ALTER adds column only');
table(local,'notes',650,170,'green','src/db/sqlite.js','folder_id NULL = Home note; cloud_id unique when non-NULL\npassword = SHA-256 access-gate hash, NOT encryption');
table(local,'note_attachments',1260,170,'green','src/db/sqlite.js','JPEG metadata + managed local file URI\nNo soft-delete field; removal deletes metadata/file');
table(local,'sync_tombstones',40,850,'green','src/db/sqlite.js','Composite PK; no FK to purged entity\nRetained to prevent resurrection during later sync');
edge('local-folder-notes','folders','notes','folder_id | ON DELETE CASCADE',{er:true,exit:[1,.3],entry:[0,.3]});
edge('local-note-images','notes','note_attachments','note_id | ON DELETE CASCADE',{er:true,exit:[1,.3],entry:[0,.3]});
edge('local-parent','folders','folders','parent_id | SET NULL (new DB)',{er:true,exit:[0,.2],entry:[0,.7],points:[[20,280],[20,550]]});
box('device-rules','Persistence rules\n• One row per note; expense rows, checklist items and reminder settings are JSON inside notes.content.\n• Ordinary reads exclude soft-deleted rows. Trash is an intentional exception.\n• folders/notes have ISO timestamps and app-generated base-36 IDs.\n• Password protection gates UI access; note content stays plaintext.\n• Theme, note colours/backgrounds, notification registrations and sync preferences are device-local.',650,850,1020,210,'grey','align=left;');
finish('native','1 Native / web persistence');

start('LockNote database | Private account synchronization', 'Final schema derived from the repository migrations through 202609180001. This is not an introspection of the deployed Supabase database.');
table(cloud,'users',40,170,'grey','Supabase-managed auth.users','Managed table: only referenced columns shown');
table(cloud,'private_folders',650,170,'green','supabase/migrations/202608240001_private_note_sync.sql; 202608250002; 202609110001','PK (owner_id, local_id); parent_id nullable\nParent relation is application/trigger-managed, not an FK');
table(cloud,'private_notes',1260,170,'green','supabase/migrations/202608240001_private_note_sync.sql; 202608250001','PK (owner_id, local_id); folder_id nullable = Home\nComposite folder FK is DEFERRABLE INITIALLY DEFERRED');
table(cloud,'app_update_config',40,640,'orange','supabase/migrations/202608300001_app_update_config.sql','Android/iOS platform rows; public SELECT only\nNo relationship to a user or note');
edge('private-user-folders','users','private_folders','owner_id | ON DELETE CASCADE',{er:true,exit:[1,.3],entry:[0,.2]});
edge('private-user-notes','users','private_notes','owner_id | ON DELETE CASCADE',{er:true,exit:[.5,0],entry:[.5,0],points:[[245,150],[1465,150]]});
edge('private-folder-notes','private_folders','private_notes','(owner_id, folder_id) → (owner_id, local_id)',{er:true,exit:[1,.5],entry:[0,.5]});
edge('cloud-parent','private_folders','private_folders','(owner_id, parent_id) | logical parent link',{logical:true,er:true,exit:[0,.4],entry:[0,.8],points:[[610,350],[610,450]]});
box('private-rules','Sync / security\n• Owner-scoped RLS; private/owned note snapshots only (incoming shared caches excluded).\n• sync_private_data RPC: transactional last-write-wins merge by client_updated_at.\n• recover_private_data: explicit no-upload recovery; used when uploads are disallowed.\n• Soft deletions are retained remotely; no standalone cloud tombstone table.\n• password_hash stores a SHA-256 UI access-gate verifier, not content encryption.\n• Combined cloud quota: Free 25 MB / Plus 75 MB / Pro 750 MB.',650,730,1020,240,'grey','align=left;');
box('erd-legend','Legend: PK = primary key; FK = declared foreign key. Solid crow’s-foot = declared FK; purple dashed = logical relationship (no FK). Parent end = one; child end = zero or many unless marked zero or one. NULL folder references preserve Home/root semantics.',40,1020,1630,90,'grey','align=left;');
finish('private','2 Supabase private sync / update policy');

start('LockNote database | Collaboration, images and subscriptions', 'Public tables use RLS and restricted RPC/Edge Function writes. Auth and Storage are Supabase-managed; Storage path links are logical, not declared FKs.');
table(cloud,'users',40,170,'grey','Supabase-managed auth.users','Managed table: referenced columns only');
table(cloud,'profiles',650,170,'purple','supabase/migrations/202608230001_collaboration_release_1.sql','email UNIQUE; profile mirrors Auth identity');
table(cloud,'user_subscriptions',1260,170,'purple','supabase/migrations/202609170001_premium_plan_2.sql','One optional row per profile; plan free/plus/pro\nServer-owned; expires_at / checked_at verification');
table(cloud,'shared_notes',650,460,'blue','supabase/migrations/202608230001_collaboration_release_1.sql; 202609070001','UNIQUE (owner_id, local_note_id); deleted_at soft-delete\nRevision-based saves + renewable server editing lease');
table(cloud,'note_members',40,780,'blue','supabase/migrations/202608230001_collaboration_release_1.sql; 202609060001','PK (note_id, user_id); role = editor / viewer');
table(cloud,'note_attachments',1260,540,'green','supabase/migrations/202609120001_note_image_attachments.sql; 202609120003','storage_path UNIQUE; exactly one note target\nlocal_note_id XOR shared_note_id; ratio 0.35–1');
table(cloud,'attachment_upload_reservations',1260,1130,'orange','supabase/migrations/202609170001_premium_plan_2.sql','storage_path PK; reserve quota BEFORE upload\nowner funds; uploader creates; expires_at bounds lifetime');
edge('auth-profile','users','profiles','id | ON DELETE CASCADE',{er:true,one:true,exit:[1,.3],entry:[0,.3]});
edge('profile-plan','profiles','user_subscriptions','user_id | ON DELETE CASCADE',{er:true,one:true,exit:[1,.3],entry:[0,.3]});
edge('profile-shared','profiles','shared_notes','owner_id / updated_by / edit_lock_user_id (nullable)',{er:true,exit:[.5,1],entry:[.5,0]});
edge('shared-members','shared_notes','note_members','note_id | ON DELETE CASCADE',{er:true,exit:[0,.75],entry:[1,.2],points:[[550,745],[550,830]]});
edge('profile-members','profiles','note_members','user_id / invited_by',{er:true,exit:[0,.6],entry:[.7,0],points:[[480,290],[480,730],[327,730]]});
edge('shared-images','shared_notes','note_attachments','shared_note_id (nullable) | CASCADE',{er:true,exit:[1,.7],entry:[0,.5]});
edge('profile-images','profiles','note_attachments','owner_id / created_by | CASCADE',{er:true,exit:[1,.7],entry:[0,.1],points:[[1170,310],[1170,585]]});
edge('profile-reservations','profiles','attachment_upload_reservations','owner_id / uploader_id | CASCADE',{er:true,exit:[.75,1],entry:[0,.5],points:[[1110,420],[1110,1230]]});
edge('shared-reservations','shared_notes','attachment_upload_reservations','shared_note_id (nullable) | CASCADE',{er:true,exit:[1,.9],entry:[0,.8],points:[[1080,838],[1080,1290]]});
box('storage-links','Private image Storage\nBucket: note-attachments (private JPEG files).\nnote_attachments.storage_path and reservation.storage_path match storage.objects.name (no FK).\nPrivate target: (owner_id, local_note_id) matches private_notes logically (no FK).\nPro funds new images/uploads; members must have editor + lease permission.\nSigned download URLs expire; metadata contains no image bytes.',40,1130,920,240,'grey','align=left;');
box('sharing-rules','Collaboration rules\nOwner needs unexpired Plus/Pro; invitees can be Free. Offline/expired-owner incoming notes stay hidden; caches/memberships are retained.\nSolid = actual FK (grouped labels name parallel FKs). Subscriptions are zero-or-one per profile; other child sets are zero-or-many.\nPK/FK fields are marked in bold. auth.users is a partial managed-table reference.',40,1420,1630,150,'grey','align=left;');
finish('sharing','3 Supabase sharing / images / plans');
write('DATABASE_ERD.drawio');

start('LockNote | Application overview', 'Implemented repository architecture • Expo SDK 54 / React Native 0.81 • Android, iOS and web • Local-first private editing • Snapshot: 2026-09-19');
box('client','LOCKNOTE CLIENT — local/offline boundary',40,170,1000,870,'blue','swimlane;startSize=40;container=1;pointerEvents=0;collapsible=0;align=left;fontStyle=1;fontSize=18;');
box('ui','UI / navigation\nHome · Shared · Premium · Settings · Profile\nFolders + four editors: plain / checklist / expense / reminder\nFocus reloads; debounced local autosave (800 ms)',30,70,940,130,'blue','','client','src/navigation/AppNavigator.js');
box('repos','Platform-matched repository APIs\nnoteRepo · folderRepo · attachmentRepo\nSoft deletes / archive / root notes / timestamps',30,270,430,120,'blue','','client','src/db');
box('local-store','Authoritative device data\nNative: SQLite locknote.db + managed image files\nWeb: AsyncStorage records + IndexedDB images',30,470,430,140,'green','shape=cylinder3;size=15;','client','src/db/sqlite.js');
box('preferences','Device-local state / preferences\nTheme, colours, backgrounds, password gate\nSession / reminder IDs / sync opt-in\nNo global note data store',30,670,430,130,'grey','','client','src/services');
box('coordinators','Cloud service coordinators\nAuthProvider / SubscriptionProvider\nAutomaticSyncProvider / syncService queue\nCollaboration + attachment services\nStartup/resume forced-update policy',510,270,460,180,'purple','','client','App.js; src/context; src/services');
box('sync-detail','Record sync\nFree manual; Plus/Pro opt-in automatic\nLaunch / resume / reconnect / editor-close\n60 s foreground idle; native OS ≥15 min best effort\nHold while editing; retries + tombstones\nBinary images: open-note / manual reconciliation',510,520,460,220,'yellow','','client','src/context/AutomaticSyncContext.js; docs/BACKGROUND_SYNC.md');
box('supabase','OPTIONAL SUPABASE SERVICES',1170,170,570,870,'orange','swimlane;startSize=40;container=1;pointerEvents=0;collapsible=0;align=left;fontStyle=1;fontSize=18;');
box('auth','Authentication\nEmail/password account + persisted session\nConfirmation / account reset / LockNote reset links',30,70,510,110,'purple','','supabase','src/services/supabaseClient.js; src/context/AuthContext.js');
box('database','Postgres / RLS / RPC / Realtime\nPrivate note/folder snapshots; revisioned sharing\nViewer/editor roles + renewable 90 s leases\nVerified subscriptions + quotas + update policy',30,260,510,170,'green','shape=cylinder3;size=15;','supabase','supabase/migrations');
box('storage','Private image Storage\nnote-attachments bucket + metadata\nQuota upload reservations / signed download URLs',30,510,510,130,'green','shape=cylinder3;size=15;','supabase','supabase/migrations/202609120001_note_image_attachments.sql');
box('functions','Edge Functions\nshare-note: authenticated email invitations\nrevenuecat-webhook: canonical entitlement verification\nServer secrets stay on server',30,700,510,120,'orange','','supabase','supabase/functions');
box('os','Device OS / local utilities\nReminders → local notifications → tap opens note\nPDF/image export → Gallery / Documents / web print\nPortable JSON backup / import (device-local)\nNative background scheduler: OS decides execution',40,1160,1000,180,'grey','','1','src/services; src/navigation/AppNavigator.js');
box('payments','RevenueCat + app-store / web billing\nSupabase UUID = RevenueCat App User ID\nPurchase / restore → store entitlements\nAuthenticated webhook → server-verified plan',1170,1160,570,180,'grey','','1','src/services/subscriptionService.js; supabase/functions/revenuecat-webhook');
edge('ui-repo','ui','repos','local reads / autosave',{exit:[.2,1],entry:[.5,0]});
edge('repo-store','repos','local-store','platform storage',{exit:[.5,1],entry:[.5,0]});
edge('ui-context','ui','coordinators','explicit account / paid actions',{exit:[.75,1],entry:[.5,0]});
edge('sync-coordination','coordinators','sync-detail','safe sync scheduling',{exit:[.5,1],entry:[.5,0]});
edge('sync-repos','sync-detail','repos','snapshot / guarded merge',{exit:[0,.3],entry:[1,.8],points:[[520,756],[520,536]]});
edge('cloud-auth','coordinators','auth','session / auth',{optional:true,exit:[1,.15],entry:[0,.5],points:[[1100,467],[1100,295]]});
edge('cloud-records','coordinators','database','RPC + Realtime',{optional:true,exit:[1,.45],entry:[0,.5]});
edge('cloud-images','coordinators','storage','images: separate manual/open-note flow',{optional:true,exit:[1,.65],entry:[0,.5],points:[[1120,557],[1120,745]]});
edge('cloud-invite','coordinators','functions','email invite',{optional:true,exit:[1,.85],entry:[0,.25],points:[[1090,593],[1090,900]]});
edge('function-write','functions','database','restricted server operations',{exit:[1,.3],entry:[1,.8],points:[[1720,906],[1720,566]]});
edge('os-ui','ui','os','reminders / export / backup',{exit:[0,.7],entry:[0,.3],points:[[20,331],[20,1214]]});
edge('client-billing','coordinators','payments','purchase / restore SDK',{optional:true,exit:[1,.95],entry:[0,.5],points:[[1060,611],[1060,1250]]});
edge('billing-webhook','payments','functions','authenticated webhook',{exit:[.5,0],entry:[.5,1]});
box('overview-legend','Legend: blue = client UI/repositories; green = persistence; purple = account/access coordination; yellow = sync scheduling; orange = backend/Edge Functions; grey = managed/external/local services. Dashed arrows = optional network integrations. Diagram shows repository implementation, not proof of production deployment.',40,1390,1700,110,'grey','align=left;');
box('overview-caveats','Important boundaries: password locks are SHA-256 UI gates, NOT encryption; content is plaintext. Private editing works offline; incoming shared notes require online authorization. Auto sync excludes binary images and device preferences. Backend migrations, secrets, SMTP/store setup and live device verification must be completed separately.',40,1540,1700,100,'grey','align=left;');
finish('overview','Application overview');
write('APPLICATION_OVERVIEW.drawio');
console.log('Generated docs/diagrams/DATABASE_ERD.drawio (3 pages) and APPLICATION_OVERVIEW.drawio.');
