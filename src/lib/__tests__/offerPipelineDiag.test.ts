const mockInsert = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    })),
  },
}));

type DiagModule = typeof import('../notifications/offerPipelineDiag');

/** Fresh module per test: the buffer, the cached identity and the epoch are module state. */
function loadDiag(): DiagModule {
  let loaded: DiagModule | undefined;
  jest.isolateModules(() => {
    loaded = require('../notifications/offerPipelineDiag') as DiagModule;
  });
  if (!loaded) throw new Error('offerPipelineDiag failed to load');
  return loaded;
}

/** The writes are fire-and-forget; let the microtask queue drain. */
const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

describe('offerPipelineDiag', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ error: null });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.EXPO_PUBLIC_OFFER_DIAG;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_OFFER_DIAG;
  });

  it('is silent when explicitly switched off', async () => {
    process.env.EXPO_PUBLIC_OFFER_DIAG = '0';
    const diag = loadDiag();

    diag.logOfferStage('tap_received', { action: 'open' }, 'r1');
    diag.setOfferPipelineDriverId('d1');
    await flush();

    // Non-vacuity: without the env guard these all become inserts.
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('accepts the documented truthy spellings', () => {
    for (const value of ['1', 'true', 'on', 'yes', 'TRUE']) {
      process.env.EXPO_PUBLIC_OFFER_DIAG = value;
      expect(loadDiag().offerPipelineDiagEnabled()).toBe(true);
    }
    for (const value of ['0', 'false', 'off', 'no', 'FALSE']) {
      process.env.EXPO_PUBLIC_OFFER_DIAG = value;
      expect(loadDiag().offerPipelineDiagEnabled()).toBe(false);
    }
  });

  it('buffers stages logged before the identity is known, then flushes them in order', async () => {
    const diag = loadDiag();

    diag.logOfferStage('tap_received', { action: 'open' }, 'r1');
    diag.logOfferStage('pending_queued', {}, 'r1');
    await flush();

    // Nothing can be written yet: the table is keyed by drivers.id and the tap arrived
    // before the dashboard boot resolved it. Dropping these would destroy the very
    // chronology the diagnostic exists for.
    expect(mockInsert).not.toHaveBeenCalled();

    diag.setOfferPipelineDriverId('d1');
    await flush();

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        driver_id: 'd1',
        ride_id: 'r1',
        stage: 'tap_received',
        detail: expect.objectContaining({
          action: 'open',
          t_ms: expect.any(Number),
        }),
      }),
    );
    expect(mockInsert.mock.calls[1][0]).toEqual(
      expect.objectContaining({ stage: 'pending_queued' }),
    );
  });

  it('writes immediately once the identity is known', async () => {
    const diag = loadDiag();
    diag.setOfferPipelineDriverId('d1');

    diag.logOfferStage('boot_ready', { action: 'accept' }, 'r1');
    await flush();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ driver_id: 'd1', stage: 'boot_ready' }),
    );
  });

  it('keeps only the most recent stages when the identity never arrives', async () => {
    const diag = loadDiag();

    for (let i = 0; i < 60; i += 1) {
      diag.logOfferStage('tap_received', { i }, 'r1');
    }
    diag.setOfferPipelineDriverId('d1');
    await flush();

    // Bounded: a long session without an identity must not grow the buffer without limit.
    expect(mockInsert).toHaveBeenCalledTimes(50);
    expect(mockInsert.mock.calls[0][0].detail.i).toBe(10);
    expect(mockInsert.mock.calls[49][0].detail.i).toBe(59);
  });

  it('never throws when the write fails', async () => {
    const diag = loadDiag();
    diag.setOfferPipelineDriverId('d1');

    mockInsert.mockRejectedValue(new Error('network down'));
    expect(() =>
      diag.logOfferStage('accept_tapped', {}, 'r1'),
    ).not.toThrow();
    await flush();

    mockInsert.mockResolvedValue({ error: { message: 'rls denied' } });
    expect(() => diag.logOfferStage('accept_ok', {}, 'r1')).not.toThrow();
    await flush();
  });
});
