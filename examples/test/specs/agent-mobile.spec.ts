import { browser } from '@wdio/globals';

describe('Using natural language on mobile testing', () => {

  it('should be able to search for a city', async () => {
    await browser.agent('open clock and add a city');

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(1500);

    const searchCommand = await browser.agent('search for "Budapest"');

    await expect($('#city_name')).toHaveText('Budapest, Hungary');
    expect(searchCommand.actions.find(a => a.value === 'Budapest' && a.type === 'SET_VALUE')).not.toBeUndefined();
  });
});

