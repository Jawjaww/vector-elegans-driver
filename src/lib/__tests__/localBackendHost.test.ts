import {
  ANDROID_EMULATOR_LOOPBACK,
  deviceHostFor,
  hostFromHostUri,
  isMachineLocalHttpUrl,
} from '../utils/localBackendHost';

describe('hostFromHostUri', () => {
  it('strips the port from a bare host:port hostUri', () => {
    expect(hostFromHostUri('10.176.226.240:8081')).toBe('10.176.226.240');
  });

  it('strips the scheme and the port', () => {
    expect(hostFromHostUri('http://10.0.2.2:8081')).toBe('10.0.2.2');
    expect(hostFromHostUri('exp://192.168.1.20:19000')).toBe('192.168.1.20');
  });

  it('keeps a host without port', () => {
    expect(hostFromHostUri('localhost')).toBe('localhost');
  });

  it('returns null when there is no usable host', () => {
    expect(hostFromHostUri(undefined)).toBeNull();
    expect(hostFromHostUri(null)).toBeNull();
    expect(hostFromHostUri('')).toBeNull();
    expect(hostFromHostUri('   ')).toBeNull();
  });
});

describe('deviceHostFor', () => {
  it('maps loopback to the emulator alias on Android only', () => {
    expect(deviceHostFor('127.0.0.1', 'android')).toBe(
      ANDROID_EMULATOR_LOOPBACK,
    );
    expect(deviceHostFor('localhost', 'android')).toBe(
      ANDROID_EMULATOR_LOOPBACK,
    );
    expect(deviceHostFor('127.0.0.1', 'ios')).toBe('127.0.0.1');
  });

  it('leaves a real LAN address untouched', () => {
    expect(deviceHostFor('10.176.226.240', 'android')).toBe('10.176.226.240');
  });
});

describe('isMachineLocalHttpUrl', () => {
  it('flags private LAN and loopback HTTP URLs', () => {
    expect(isMachineLocalHttpUrl('http://10.196.235.240:54329')).toBe(true);
    expect(isMachineLocalHttpUrl('http://127.0.0.1:54329')).toBe(true);
    expect(isMachineLocalHttpUrl('http://localhost:54329')).toBe(true);
    expect(isMachineLocalHttpUrl('http://host.docker.internal:54329')).toBe(
      true,
    );
    expect(isMachineLocalHttpUrl('http://192.168.1.50:54329')).toBe(true);
    expect(isMachineLocalHttpUrl('http://172.16.0.5:54329')).toBe(true);
  });

  it('leaves the cloud backend and custom hosts alone', () => {
    expect(
      isMachineLocalHttpUrl('https://iodsddzustunlahxafif.supabase.co'),
    ).toBe(false);
    expect(isMachineLocalHttpUrl('http://supabase.internal:54329')).toBe(false);
  });

  it('rejects anything outside the private 172.16-31 block', () => {
    expect(isMachineLocalHttpUrl('http://172.32.0.1:54329')).toBe(false);
    expect(isMachineLocalHttpUrl('http://172.15.0.1:54329')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isMachineLocalHttpUrl('not a url')).toBe(false);
    expect(isMachineLocalHttpUrl('')).toBe(false);
  });
});
