jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
}));

jest.mock('../supabase', () => ({
  supabase: {
    storage: { from: jest.fn() },
    from: jest.fn(),
  },
}));

const mockEnsureDriverProfile = jest.fn();
jest.mock('../services/dossierService', () => ({
  ensureDriverProfile: (...args: unknown[]) => mockEnsureDriverProfile(...args),
}));

import {
  avatarUploadPaths,
  ensureActiveDriverId,
  jpegBytesFromBase64,
} from '../avatarUpload';

describe('avatarUploadPaths', () => {
  it('always includes the drivers.id folder first', () => {
    const paths = avatarUploadPaths('driver-1', 'user-1');
    expect(paths[0]).toMatch(/^driver-1\/avatar_\d+\.jpg$/);
    expect(paths[1]).toMatch(/^user-1\/avatar_\d+\.jpg$/);
  });

  it('does not duplicate when userId equals driverId', () => {
    expect(avatarUploadPaths('same', 'same')).toHaveLength(1);
  });
});

describe('jpegBytesFromBase64', () => {
  it('decodes a short JPEG-like payload', () => {
    const bytes = new Uint8Array(jpegBytesFromBase64(btoa('abc')));
    expect(Array.from(bytes)).toEqual([97, 98, 99]);
  });
});

describe('ensureActiveDriverId', () => {
  beforeEach(() => {
    mockEnsureDriverProfile.mockReset();
  });

  it('returns the existing driver id without calling ensure', async () => {
    await expect(ensureActiveDriverId('driver-1', 'user-1')).resolves.toEqual({
      id: 'driver-1',
    });
    expect(mockEnsureDriverProfile).not.toHaveBeenCalled();
  });

  it('returns no-user when both ids are missing', async () => {
    await expect(ensureActiveDriverId(null, null)).resolves.toEqual({
      error: 'no-user',
    });
  });

  it('creates a draft profile when driver id is missing', async () => {
    mockEnsureDriverProfile.mockResolvedValue({ id: 'new-driver' });
    await expect(ensureActiveDriverId(null, 'user-1')).resolves.toEqual({
      id: 'new-driver',
    });
  });
});
