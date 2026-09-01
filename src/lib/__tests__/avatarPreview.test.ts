jest.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
  },
}));

import { supabase } from '../supabase';
import { resolveAvatarPreviewUrl } from '../avatarPreview';

const mockFrom = supabase.storage.from as jest.Mock;

describe('resolveAvatarPreviewUrl', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('returns null for empty values', async () => {
    await expect(resolveAvatarPreviewUrl(null)).resolves.toBeNull();
    await expect(resolveAvatarPreviewUrl('  ')).resolves.toBeNull();
  });

  it('returns http URLs without signing', async () => {
    await expect(
      resolveAvatarPreviewUrl('https://cdn.example/a.jpg'),
    ).resolves.toBe('https://cdn.example/a.jpg');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns local picker URIs without signing', async () => {
    await expect(
      resolveAvatarPreviewUrl('file:///tmp/avatar.jpg'),
    ).resolves.toBe('file:///tmp/avatar.jpg');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('creates a signed URL for storage paths', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/avatar.jpg' },
      error: null,
    });
    mockFrom.mockReturnValue({ createSignedUrl });

    await expect(
      resolveAvatarPreviewUrl('driver-id/avatar_1.jpg'),
    ).resolves.toBe('https://signed.example/avatar.jpg');
    expect(mockFrom).toHaveBeenCalledWith('driver-avatars');
    expect(createSignedUrl).toHaveBeenCalledWith(
      'driver-id/avatar_1.jpg',
      60 * 60,
    );
  });
});
