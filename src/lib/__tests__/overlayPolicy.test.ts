import { isOverlayAvailable } from '../overlay/overlayPolicy';

describe('isOverlayAvailable', () => {
  it('is available on Android when the native module is present', () => {
    expect(isOverlayAvailable('android', true)).toBe(true);
  });

  it('is unavailable on iOS, which ships no overlay window', () => {
    expect(isOverlayAvailable('ios', true)).toBe(false);
  });

  it('is unavailable when the native module is missing', () => {
    // The case of an OTA delivered to a binary predating the module: every call
    // must stay inert rather than throw.
    expect(isOverlayAvailable('android', false)).toBe(false);
  });

  it('is unavailable on web', () => {
    expect(isOverlayAvailable('web', true)).toBe(false);
  });

  it('stays unavailable when neither platform nor module qualify', () => {
    expect(isOverlayAvailable('ios', false)).toBe(false);
  });
});
