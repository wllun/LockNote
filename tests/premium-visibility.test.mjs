import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { transformSync } from '@babel/core';
import vm from 'node:vm';
import { getNoteFeatureVisibility, getSubfolderVisibility, getVisibleNoteBackgroundUri } from '../src/utils/premium-visibility.mjs';

test('background visibility hides on Free/Plus/loading without changing the saved URI', () => {
  for (const uri of ['file:///notes/background.jpg', 'blob:https://local.test/background']) {
    const saved = { backgroundUri: uri };
    for (const plan of ['free', 'plus', 'pro']) {
      const result = getNoteFeatureVisibility({ ...saved, plan });
      assert.equal(result.visibleBackgroundUri, plan === 'pro' ? uri : null);
      assert.equal(result.showBackground, true, 'manual removal stays available');
      assert.equal(saved.backgroundUri, uri);
      assert.equal(getVisibleNoteBackgroundUri(uri, plan, true), null);
    }
    assert.equal(getVisibleNoteBackgroundUri(saved.backgroundUri, 'pro'), uri);
  }
  assert.equal(getVisibleNoteBackgroundUri(null, 'pro'), null);
});

test('shared background layer hides card/editor/settings images and restores on renewal', () => {
  const subscription = { activePlanId: 'pro', loading: false };
  const source = read('src/components/note-background-layer.js')
    .replace(/^import[^;]*;\r?\n/gm, '').replace('export default NoteBackgroundLayer;', '');
  const code = transformSync(source, {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  const render = vm.runInNewContext(`${code}\nNoteBackgroundLayer;`, {
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    View: 'View', Image: 'Image',
    StyleSheet: { absoluteFill: {}, create: (styles) => styles },
    useSubscription: () => subscription, getVisibleNoteBackgroundUri,
    getNoteBackgroundOverlayColor: () => 'theme overlay',
  });
  const props = { uri: 'file:///notes/background.jpg', surface: '#ffffff' };
  for (const [plan, loading] of [['pro', false], ['free', false], ['plus', false], ['pro', true], ['pro', false]]) {
    subscription.activePlanId = plan;
    subscription.loading = loading;
    const result = render(props);
    if (plan === 'pro' && !loading) {
      assert.equal(result.children[0].props.source.uri, props.uri);
      assert.equal(result.props.pointerEvents, 'none');
    } else assert.equal(result, null);
    assert.equal(props.uri, 'file:///notes/background.jpg');
  }
  assert.match(read('src/components/NoteItem.js'), /<NoteBackgroundLayer/);
});

test('editors use visible backgrounds for rendering but retain stored URI for settings/removal', () => {
  for (const screen of ['NoteEditorScreen', 'ChecklistEditorScreen', 'ExpenseRecordEditorScreen', 'ReminderEditorScreen']) {
    const source = read(`src/screens/${screen}.js`);
    assert.match(source, /<NoteBackgroundLayer uri=\{features\.visibleBackgroundUri\}/);
    assert.match(source, /value=\{noteBackgroundUri\}/);
    assert.doesNotMatch(source, /backgroundColor: noteBackgroundUri \?/);
  }
  const modal = read('src/components/note-background-modal.js');
  assert.match(modal, /value && canChangeBackground \?/);
  assert.match(modal, /Background hidden without Pro/);
  assert.match(modal, /!!value && \(/);
});

test('Free hides all new paid actions on ordinary private notes', () => {
  const result = getNoteFeatureVisibility({ plan: 'free' });
  for (const key of ['canExport', 'canInsertImages', 'canChangeBackground', 'showBackground', 'canShare', 'showSharing']) {
    assert.equal(result[key], false, key);
  }
});

test('Plus shows export/sharing, Pro additionally shows images/backgrounds', () => {
  for (const plan of ['plus', 'pro']) {
    const result = getNoteFeatureVisibility({ plan });
    assert.equal(result.canExport, true);
    assert.equal(result.canShare, true);
    assert.equal(result.sharingLabel, 'Share');
    assert.equal(result.canInsertImages, plan === 'pro');
    assert.equal(result.canChangeBackground, plan === 'pro');
  }
});

test('downgrade recovery allows export of existing premium content, not new premium actions', () => {
  for (const content of [{ isSubfolder: true }, { backgroundUri: 'local-image' }, { attachmentCount: 1 }]) {
    const result = getNoteFeatureVisibility({ plan: 'free', ...content });
    assert.equal(result.canExport, true);
    assert.equal(result.canInsertImages, false);
    assert.equal(result.canChangeBackground, false);
    assert.equal(result.showBackground, Boolean(content.backgroundUri));
  }
});

test('existing shared notes retain access management without a Share action on Free', () => {
  for (const share_origin of ['owned', 'incoming']) {
    const result = getNoteFeatureVisibility({ plan: 'free', note: { cloud_id: 'shared', share_origin } });
    assert.equal(result.canShare, false);
    assert.equal(result.showSharing, true);
    assert.equal(result.sharingLabel, 'Manage access');
  }
});

test('incoming image additions follow the owner plan, role and current lease, not the invitee plan', () => {
  for (const plan of ['free', 'plus', 'pro']) {
    for (const ownerPlan of [null, 'free', 'plus', 'pro']) {
      for (const share_role of ['viewer', 'editor']) {
        for (const readOnly of [false, true]) {
          const result = getNoteFeatureVisibility({ plan, ownerPlan, readOnly, note: { share_origin: 'incoming', share_role } });
          assert.equal(result.canInsertImages, ownerPlan === 'pro' && share_role === 'editor' && !readOnly);
          assert.equal(result.canShare, false);
        }
      }
    }
  }
});

test('read-only private notes never offer image insertion even on Pro', () => {
  assert.equal(getNoteFeatureVisibility({ plan: 'pro', readOnly: true }).canInsertImages, false);
});

test('subfolder sections disappear without Pro unless existing children need recovery', () => {
  for (const plan of ['free', 'plus', 'pro']) {
    assert.deepEqual(getSubfolderVisibility(plan, false, 0), {
      showSection: plan === 'pro', canAddSubfolder: plan === 'pro', canAddNote: true,
    });
    assert.deepEqual(getSubfolderVisibility(plan, false, 2), {
      showSection: true, canAddSubfolder: plan === 'pro', canAddNote: true,
    });
    assert.deepEqual(getSubfolderVisibility(plan, true, 0), {
      showSection: false, canAddSubfolder: false, canAddNote: plan === 'pro',
    });
  }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const visit = (node, callback, parents = []) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((child) => visit(child, callback, parents)); return; }
  if (node.type) callback(node, parents);
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'tokens') visit(child, callback, node.type ? [...parents, node] : parents);
  }
};

test('three detailed editor menus gate actual buttons with visibility policy', () => {
  for (const screen of ['NoteEditorScreen', 'ChecklistEditorScreen', 'ExpenseRecordEditorScreen']) {
    const source = read(`src/screens/${screen}.js`);
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const expected = ['canExport', 'showSharing', 'showBackground', ...(screen === 'NoteEditorScreen' ? ['canInsertImages'] : [])];
    const guardedButtons = new Set();
    visit(ast, (node, parents) => {
      if (node.type !== 'JSXOpeningElement' || node.name.name !== 'Pressable') return;
      for (const parent of parents) {
        if (parent.type === 'LogicalExpression' && parent.operator === '&&' && parent.left.type === 'MemberExpression' && parent.left.object.name === 'features') {
          guardedButtons.add(parent.left.property.name);
        }
      }
    });
    for (const flag of expected) assert.ok(guardedButtons.has(flag), `${screen}: ${flag}`);
    assert.ok(source.includes('visible={showExportModal && features.canExport}'));
    if (screen === 'NoteEditorScreen') {
      assert.ok(source.indexOf('const [attachments,') < source.indexOf('const features ='), 'attachments must initialize before visibility hook reads them');
    }
  }
});

test('reminder, category export, list backgrounds and folder controls share visibility gates', () => {
  const reminder = read('src/screens/ReminderEditorScreen.js');
  for (const flag of ['showSharing', 'showBackground', 'canExport']) assert.ok(reminder.includes(`...(features.${flag} ?`));
  const summary = read('src/components/ExpenseSummaryModal.js');
  assert.ok(summary.includes('{canExport && (<View style={styles.categoryTransactionsFooter}>'));
  assert.ok(read('src/screens/ExpenseRecordEditorScreen.js').includes('canExport={features.canExport}'));
  const folder = read('src/screens/FolderScreen.js');
  for (const flag of ['showSection', 'canAddSubfolder', 'canAddNote']) assert.ok(folder.includes(`{folderFeatures.${flag} && (`));
  assert.ok(read('src/components/ItemActionsModal.js').includes('(canChangeBackground || hasBackground)'));
  for (const screen of ['HomeScreen', 'FolderScreen']) assert.ok(read(`src/screens/${screen}.js`).includes('hasBackground={!!itemActions.item?.background_image_uri}'));
});

test('background and sharing dialogs hide new paid actions but retain remove/leave actions', () => {
  const background = read('src/components/note-background-modal.js');
  assert.ok(background.includes('{canChangeBackground && (<Pressable'));
  assert.ok(background.includes('onPress={removeImage}'));
  const sharing = read('src/components/NoteShareModal.js');
  assert.ok(sharing.includes('{!incoming && canInvite && <View style={styles.inviteArea}>'));
  assert.ok(sharing.includes('{canInvite && <Pressable'));
  assert.ok(sharing.includes('onPress={() => remove(member)}'));
  assert.ok(sharing.includes('onPress={leave}'));
});

test('actual detailed-menu JSX evaluates to no button when disallowed, and a button when allowed', () => {
  for (const screen of ['NoteEditorScreen', 'ChecklistEditorScreen', 'ExpenseRecordEditorScreen']) {
    const source = read(`src/screens/${screen}.js`);
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const expressions = new Map();
    visit(ast, (node) => {
      if (node.type === 'LogicalExpression' && node.operator === '&&' && node.left.type === 'MemberExpression'
        && node.left.object.name === 'features' && node.right.type === 'JSXElement'
        && node.right.openingElement.name.name === 'Pressable') {
        expressions.set(node.left.property.name, source.slice(node.start, node.end));
      }
    });
    for (const [flag, expression] of expressions) {
      const code = transformSync(`result = (${expression});`, {
        configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'],
      }).code;
      for (const options of [
        { plan: 'free' }, { plan: 'plus' }, { plan: 'pro' },
        { plan: 'free', backgroundUri: 'existing', attachmentCount: 1 },
        { plan: 'free', note: { cloud_id: 'shared', share_origin: 'incoming', share_role: 'editor' }, ownerPlan: 'pro' },
      ]) {
        const features = getNoteFeatureVisibility(options);
        const sandbox = {
          features, styles: {}, colors: {}, attachments: [], MAX_NOTE_ATTACHMENTS: 20,
          isReadOnly: false, attachmentBusy: false, Pressable: 'Pressable', Text: 'Text', Ionicons: 'Ionicons',
          React: { createElement: (type, props, ...children) => ({ type, props, children }) }, result: null,
        };
        vm.runInNewContext(code, sandbox);
        assert.equal(Boolean(sandbox.result), features[flag], `${screen} ${flag}: ${JSON.stringify(options)}`);
        if (features[flag]) assert.equal(sandbox.result.type, 'Pressable');
      }
    }
  }
});

const createHookHarness = (notes) => {
  const state = [], effects = [];
  let stateIndex = 0, effectIndex = 0, pending = [];
  const subscription = { activePlanId: 'pro', loading: false };
  const auth = { session: { user: { id: 'account-a' } } };
  const globals = {
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect: (effect, dependencies) => {
      const index = effectIndex++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        previous?.cleanup?.();
        const entry = { dependencies };
        effects[index] = entry;
        pending.push(() => { entry.cleanup = effect(); });
      }
    },
    useSubscription: () => subscription, useAuth: () => auth, getNoteFeatureVisibility,
    noteRepo: { getById: async (id) => await notes[id] },
    folderRepo: { getById: async (id) => id === 'child' ? { parent_id: 'parent' } : { parent_id: null } },
    attachmentRepo: { listByNoteId: async () => [] },
  };
  const source = read('src/hooks/use-note-feature-visibility.js')
    .replace(/^import[^;]*;\r?\n/gm, '').replace('export const useNoteFeatureVisibility', 'const useNoteFeatureVisibility');
  const hook = vm.runInNewContext(`${source}\nuseNoteFeatureVisibility;`, globals);
  return {
    subscription, auth,
    render: (id, options = {}) => {
      stateIndex = 0; effectIndex = 0;
      const result = hook(id, { attachmentCount: 0, ...options });
      const callbacks = pending; pending = [];
      callbacks.forEach((effect) => effect());
      return result;
    },
    flush: () => new Promise((resolve) => setImmediate(resolve)),
    unmount: () => effects.forEach((entry) => entry?.cleanup?.()),
  };
};

test('visibility hook reacts to expiry and preserves subfolder recovery without showing new actions', async () => {
  const harness = createHookHarness({ nested: { id: 'nested', folder_id: 'child' } });
  assert.equal(harness.render('nested').canInsertImages, false, 'metadata must load before insertion is offered');
  await harness.flush();
  assert.equal(harness.render('nested').canInsertImages, true);
  harness.subscription.activePlanId = 'free';
  const expired = harness.render('nested');
  assert.equal(expired.canInsertImages, false);
  assert.equal(expired.canShare, false);
  assert.equal(expired.canExport, true);
  await harness.flush();
  assert.equal(harness.render('nested').canExport, true);
  harness.unmount();
});

test('visibility hook hides retained backgrounds on expiry/loading and restores them on Pro renewal', async () => {
  const harness = createHookHarness({ note: { id: 'note' } });
  const options = { backgroundUri: 'blob:https://local.test/retained' };
  assert.equal(harness.render('note', options).visibleBackgroundUri, options.backgroundUri);
  await harness.flush();
  for (const plan of ['free', 'plus']) {
    harness.subscription.activePlanId = plan;
    const result = harness.render('note', options);
    assert.equal(result.visibleBackgroundUri, null);
    assert.equal(result.showBackground, true);
  }
  harness.subscription.activePlanId = 'pro';
  harness.subscription.loading = true;
  assert.equal(harness.render('note', options).visibleBackgroundUri, null);
  harness.subscription.loading = false;
  assert.equal(harness.render('note', options).visibleBackgroundUri, options.backgroundUri);
  harness.unmount();
});

test('visibility hook discards stale note loads and clears owner-funded image access on identity change', async () => {
  let resolveOld;
  const oldNote = new Promise((resolve) => { resolveOld = resolve; });
  const harness = createHookHarness({ old: oldNote, incoming: { id: 'incoming', cloud_id: 'cloud', share_origin: 'incoming', share_role: 'editor' } });
  harness.subscription.activePlanId = 'free';
  harness.render('old');
  harness.render('incoming');
  await harness.flush();
  harness.render('incoming').setOwnerPlan('pro');
  assert.equal(harness.render('incoming').canInsertImages, true);
  resolveOld({ id: 'old', folder_id: 'child' });
  await harness.flush();
  assert.equal(harness.render('incoming').canExport, false, 'old recovery eligibility cannot leak into another note');
  harness.auth.session = { user: { id: 'account-b' } };
  harness.render('incoming');
  assert.equal(harness.render('incoming').canInsertImages, false);
  harness.unmount();
});
