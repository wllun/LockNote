export const RECIPE_NOTE_TYPE = 'recipe';
export const RECIPE_MAX_STEPS = 50;
export const RECIPE_INGREDIENTS_MAX_CHARACTERS = 10000;
export const RECIPE_STEP_MAX_CHARACTERS = 2000;
export const RECIPE_CONTENT_MAX_CHARACTERS = 50000;

export const createRecipeStep = (text = '') => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
  text: String(text),
});

const normalizeSteps = (steps) => {
  const seen = new Set();
  return (Array.isArray(steps) ? steps : []).flatMap((step, index) => {
    const text = typeof step === 'string' ? step : step?.text;
    if (typeof text !== 'string') return [];
    let id = typeof step?.id === 'string' && step.id ? step.id : `step-${index}`;
    while (seen.has(id)) id += `-${index}`;
    seen.add(id);
    return [{ id, text }];
  });
};

export const parseRecipeNote = (content) => {
  if (!content) return { version: 1, ingredients: '', steps: [] };
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        version: Number(parsed.version) || 1,
        ingredients: typeof parsed.ingredients === 'string' ? parsed.ingredients : '',
        steps: normalizeSteps(parsed.steps),
      };
    }
  } catch { /* Retain unexpected text so it can be read and recovered. */ }
  return { version: 1, ingredients: String(content), steps: [] };
};

export const serializeRecipeNote = ({ ingredients = '', steps = [] } = {}) => JSON.stringify({
  version: 1,
  ingredients: String(ingredients),
  steps: normalizeSteps(steps),
});

export const isRecipeContentEmpty = (content) => {
  const recipe = parseRecipeNote(content);
  return !recipe.ingredients.trim() && !recipe.steps.some((step) => step.text.trim());
};

export const getRecipePreview = (content) => {
  const recipe = parseRecipeNote(content);
  const ingredients = recipe.ingredients.split(/\r?\n/).filter((line) => line.trim());
  const steps = recipe.steps.filter((step) => step.text.trim());
  return ingredients.length || steps.length
    ? `${ingredients.length} ${ingredients.length === 1 ? 'ingredient' : 'ingredients'} · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`
    : 'No ingredients or steps yet';
};

export const getRecipeExportText = (content) => {
  const recipe = parseRecipeNote(content);
  const steps = recipe.steps.filter((step) => step.text.trim());
  return `Ingredients\n${recipe.ingredients.trim() || 'No ingredients yet'}\n\nPreparation\n${steps.length
    ? steps.map((step, index) => `${index + 1}. ${step.text.trim()}`).join('\n\n')
    : 'No steps yet'}`;
};
