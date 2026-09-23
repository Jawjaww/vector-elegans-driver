// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import. Two of the assertions below read source files: they
// pin wiring that no unit-level behaviour can express — that the acknowledgement is reached by
// *both* offer paths, and that the RPC the app calls is the one the schema actually exposes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import {
  createPushAckGate,
  notificationIdFromPushData,
} from '../notifications/offerPushAck';
import { OFFER_PIPELINE_STAGES } from '../notifications/offerPipelineDiag';

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

const ACK_MODULE = 'src/lib/notifications/offerPushAck.ts';
const NOTIFICATIONS_HOOK = 'src/hooks/useNotifications.ts';
const SYNCED_TYPES = 'src/lib/types/database.types.ts';

/** The handler both the tray tap and the silent wake end up in. */
function handleNotificationOpenBody(): string {
  const source = readSource(NOTIFICATIONS_HOOK);
  const start = source.indexOf('const handleNotificationOpen = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('const openFromResponse = useCallback(');
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('notificationIdFromPushData', () => {
  it('reads the id dispatch-push puts in the payload', () => {
    expect(
      notificationIdFromPushData({ notification_id: '9ffbce04-e2e5-4d2e-94ff' }),
    ).toBe('9ffbce04-e2e5-4d2e-94ff');
  });

  it('answers null when the push carries no id', () => {
    expect(notificationIdFromPushData({ ride_id: 'ride-1' })).toBeNull();
  });

  it('answers null for an empty id rather than acknowledging the empty string', () => {
    expect(notificationIdFromPushData({ notification_id: '' })).toBeNull();
  });

  it('answers null when the id is not a string', () => {
    expect(notificationIdFromPushData({ notification_id: 42 })).toBeNull();
  });
});

describe('createPushAckGate', () => {
  it('lets the first report of an id through', () => {
    const gate = createPushAckGate();
    expect(gate('n-1')).toBe(true);
  });

  it('refuses the same id twice, so a tap plus a wake costs one round-trip', () => {
    const gate = createPushAckGate();
    gate('n-1');
    expect(gate('n-1')).toBe(false);
  });

  it('does not confuse two notifications of the same ride', () => {
    const gate = createPushAckGate();
    expect(gate('n-1')).toBe(true);
    expect(gate('n-2')).toBe(true);
  });

  it('stays bounded rather than growing for the life of the session', () => {
    const gate = createPushAckGate();
    for (let index = 0; index < 250; index += 1) {
      gate(`n-${index}`);
    }
    // The oldest ids are forgotten, which only ever costs a redundant call the server ignores.
    expect(gate('n-0')).toBe(true);
  });
});

describe('the acknowledgement is wired into the shared offer path', () => {
  it('reports receipt from handleNotificationOpen', () => {
    expect(handleNotificationOpenBody()).toContain('acknowledgeOfferPush(data)');
  });

  it('reports receipt next to the ride being queued, not in a branch only one path reaches', () => {
    const body = handleNotificationOpenBody();
    const queued = body.indexOf('queueOfferOpen(');
    const acknowledged = body.indexOf('acknowledgeOfferPush(');
    expect(queued).toBeGreaterThan(-1);
    expect(acknowledged).toBeGreaterThan(queued);
    // Both sit inside the same `if (rideId)` block, which is the only shape that makes the
    // silent wake — the path with no `NotificationResponse` — acknowledge at all.
    const block = body.slice(body.lastIndexOf('if (rideId) {', queued));
    expect(block).toContain('queueOfferOpen(');
    expect(block).toContain('acknowledgeOfferPush(data)');
  });

  it('is reached by the tray tap and by the silent wake, which are the two call sites', () => {
    const source = readSource(NOTIFICATIONS_HOOK);
    const stages = source.match(/handleNotificationOpen\([\s\S]*?'(tap_received|silent_wake)'/g);
    expect(stages).not.toBeNull();
    const joined = (stages ?? []).join('\n');
    expect(joined).toContain("'tap_received'");
    expect(joined).toContain("'silent_wake'");
  });

  it('never lets the acknowledgement gate the offer behind an await', () => {
    const body = handleNotificationOpenBody();
    expect(body).not.toContain('await acknowledgeOfferPush');
  });
});

describe('the pipeline log can show a channel that never acknowledges', () => {
  it('declares the push_acked stage', () => {
    expect(OFFER_PIPELINE_STAGES).toContain('push_acked');
  });

  it('records every outcome, including the failures', () => {
    const source = readSource(ACK_MODULE);
    for (const outcome of ['ok', 'no_id', 'error', 'threw']) {
      expect(source).toContain(`'${outcome}'`);
    }
  });
});

describe('the app calls the RPC the schema exposes', () => {
  it('names the function and its parameter exactly as the synced types do', () => {
    const types = readSource(SYNCED_TYPES);
    const ack = readSource(ACK_MODULE);

    expect(ack).toContain("'acknowledge_offer_push'");
    expect(ack).toContain('p_notification_id: notificationId');

    // The synced copy of `database.types.ts` is the contract between the app and the schema:
    // renaming the RPC in a migration and regenerating the types fails here, which is the
    // point — a silent mismatch would only ever show up as an acknowledgement that never lands.
    expect(types).toContain('acknowledge_offer_push: {');
    expect(types).toMatch(
      /acknowledge_offer_push: \{\s*Args: \{ p_notification_id: string \}/,
    );
  });
});
