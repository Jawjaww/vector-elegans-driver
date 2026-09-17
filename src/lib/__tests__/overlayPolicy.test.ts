import {
  canLaunchAppFromBackground,
  shouldShowOverlayBubble,
  type OverlayBubbleContext,
  type OverlayLaunchContext,
} from '../overlay/overlayPolicy';

const bubbleBase: OverlayBubbleContext = {
  platform: 'android',
  moduleAvailable: true,
  permissionGranted: true,
  isOnline: true,
};

const launchBase: OverlayLaunchContext = {
  platform: 'android',
  moduleAvailable: true,
  permissionGranted: true,
  bubbleVisible: true,
};

describe('shouldShowOverlayBubble', () => {
  it('shows the pill when online on Android with the permission', () => {
    expect(shouldShowOverlayBubble(bubbleBase)).toBe(true);
  });

  it('hides the pill when the driver is offline', () => {
    expect(shouldShowOverlayBubble({ ...bubbleBase, isOnline: false })).toBe(false);
  });

  it('hides the pill without the overlay permission', () => {
    expect(shouldShowOverlayBubble({ ...bubbleBase, permissionGranted: false })).toBe(false);
  });

  it('hides the pill when the native module is missing', () => {
    expect(shouldShowOverlayBubble({ ...bubbleBase, moduleAvailable: false })).toBe(false);
  });

  it('hides the pill on iOS, where no overlay window exists', () => {
    expect(shouldShowOverlayBubble({ ...bubbleBase, platform: 'ios' })).toBe(false);
  });
});

describe('canLaunchAppFromBackground', () => {
  it('allows the launch when the permission is granted and the pill is visible', () => {
    expect(canLaunchAppFromBackground(launchBase)).toBe(true);
  });

  it('refuses when the pill is not on screen, even with the permission', () => {
    // Android only honours the exemption for a *visible* overlay window.
    expect(canLaunchAppFromBackground({ ...launchBase, bubbleVisible: false })).toBe(false);
  });

  it('refuses without the overlay permission', () => {
    expect(canLaunchAppFromBackground({ ...launchBase, permissionGranted: false })).toBe(false);
  });

  it('refuses when the native module is missing', () => {
    expect(canLaunchAppFromBackground({ ...launchBase, moduleAvailable: false })).toBe(false);
  });

  it('refuses on iOS', () => {
    expect(canLaunchAppFromBackground({ ...launchBase, platform: 'ios' })).toBe(false);
  });
});
