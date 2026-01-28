import interactableBrowserElementsScript from './get-interactable-browser-elements';
import { encode } from '@toon-format/toon';

export const getElements = async (browser: WebdriverIO.Browser): Promise<string> => {
  // The driver instance is a Browser
  const elements = await browser.execute(interactableBrowserElementsScript);

  return encode(elements)
    .replace(/,""/g, ',')
    .replace(/"",/g, ',');
};